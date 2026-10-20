/**
 * Cálculos financeiros. Funções puras: recebem os dados e a data de hoje, não leem relógio nem rede.
 * Todos os valores em centavos.
 */
import { addDays, daysInMonth, diffDays, endOfMonth, monthKey, monthKeyOf, parseISO, toISO } from '../lib/dates.ts';
import type { Account, Bill, Bucket, TxView } from './types.ts';

const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);

/* ---------- totais ---------- */

export function inMonth(txs: TxView[], key: string): TxView[] {
  return txs.filter((t) => monthKeyOf(t.occurred_on) === key);
}

export function monthTotals(txs: TxView[], key: string) {
  const list = inMonth(txs, key);
  return {
    in: sum(list.filter((t) => t.type === 'in'), (t) => t.amount_cents),
    out: sum(list.filter((t) => t.type === 'out'), (t) => t.amount_cents),
  };
}

export function byCategory(txs: TxView[], key: string, type: 'out' | 'in' | 'transfer' = 'out'): Record<string, number> {
  const r: Record<string, number> = {};
  for (const t of inMonth(txs, key)) {
    if (t.type === type) r[t.category_key] = (r[t.category_key] ?? 0) + t.amount_cents;
  }
  return r;
}

/** Últimos `n` meses terminando no de `today`, do mais antigo ao mais recente. */
export function monthSeries(txs: TxView[], today: string, n = 6) {
  const out: { key: string; in: number; out: number }[] = [];
  for (let o = -(n - 1); o <= 0; o++) {
    const key = monthKey(today, o);
    out.push({ key, ...monthTotals(txs, key) });
  }
  return out;
}

/* ---------- cartão de crédito ---------- */

/** Ciclo da fatura que está aberta hoje. */
export function cardCycle(card: Pick<Account, 'closing_day' | 'due_day'>, today: string) {
  const closing = card.closing_day ?? 1;
  const due = card.due_day ?? 1;
  const t = parseISO(today);
  const y = t.getFullYear();
  const m = t.getMonth();
  const closeOn = (yy: number, mm: number) => {
    const d = new Date(yy, mm, Math.min(closing, daysInMonth(yy, mm)));
    return d;
  };
  const thisClose = closeOn(y, m);
  let start: Date;
  let end: Date;
  if (t <= thisClose) {
    end = thisClose;
    start = new Date(closeOn(y, m - 1).getTime());
    start.setDate(start.getDate() + 1);
  } else {
    start = new Date(thisClose.getTime());
    start.setDate(start.getDate() + 1);
    end = closeOn(y, m + 1);
  }
  let dueDate = new Date(end.getFullYear(), end.getMonth(), Math.min(due, daysInMonth(end.getFullYear(), end.getMonth())));
  if (dueDate <= end) {
    dueDate = new Date(end.getFullYear(), end.getMonth() + 1, Math.min(due, daysInMonth(end.getFullYear(), end.getMonth() + 1)));
  }
  return { start: toISO(start), end: toISO(end), due: toISO(dueDate) };
}

/**
 * O saldo do cartão guarda a dívida total (compras menos pagamentos). A fatura aberta é o que
 * foi comprado no ciclo atual; o que passa disso é a fatura já fechada, ainda por pagar.
 */
export function cardSummary(card: Account, txs: TxView[], today: string) {
  const c = cardCycle(card, today);
  const purchases = sum(
    txs.filter((t) => t.account_id === card.id && t.occurred_on >= c.start && t.occurred_on <= c.end),
    (t) => (t.type === 'out' ? t.amount_cents : t.type === 'in' ? -t.amount_cents : 0),
  );
  const debt = card.balance_cents;
  const open = Math.max(0, Math.min(debt, purchases));
  const closed = Math.max(0, debt - open);
  const limit = card.credit_limit_cents ?? 0;
  return { cycle: c, debt, openInvoice: open, closedInvoice: closed, available: Math.max(0, limit - debt), limit };
}

/* ---------- pessoa física: livre para gastar e divisão da renda ---------- */

export function freeToSpend(args: {
  balanceCents: number;
  bills: Bill[];
  cards: Account[];
  txs: TxView[];
  today: string;
}) {
  const { balanceCents, bills, cards, today } = args;
  const end = endOfMonth(today);
  const daysLeft = diffDays(end, today) + 1;
  const billsDue = sum(
    bills.filter((b) => b.kind === 'pagar' && b.status === 'open' && b.due_on <= end),
    (b) => b.amount_cents,
  );
  const cardDebt = sum(cards, (c) => c.balance_cents);
  const free = balanceCents - billsDue - cardDebt;
  return {
    free,
    perDay: free > 0 ? Math.round(free / daysLeft) : 0,
    daysLeft,
    end,
    billsDue,
    cardDebt,
  };
}

export function bucketTarget(incomeCents: number, b: Pick<Bucket, 'pct'>): number {
  return Math.round((incomeCents * b.pct) / 100);
}

/** Gasto (ou aporte, nos buckets de investimento) do mês. */
export function bucketSpent(txs: TxView[], key: string, b: Pick<Bucket, 'kind' | 'category_keys'>): number {
  const c = byCategory(txs, key, b.kind === 'invest' ? 'transfer' : 'out');
  return sum(b.category_keys, (k) => c[k] ?? 0);
}

export type BucketState = 'ok' | 'warn' | 'over' | 'done' | 'short';

export function bucketState(b: Pick<Bucket, 'kind'>, spent: number, target: number): BucketState {
  const pct = target > 0 ? spent / target : 0;
  if (b.kind === 'invest') return pct >= 1 ? 'done' : 'short';
  return pct > 1 ? 'over' : pct >= 0.85 ? 'warn' : 'ok';
}

export function goalPlan(goal: { target_cents: number; saved_cents: number; deadline: string }, today: string) {
  const remaining = Math.max(0, goal.target_cents - goal.saved_cents);
  const months = Math.max(1, Math.round(diffDays(goal.deadline, today) / 30));
  return {
    remaining,
    pct: Math.min(1, goal.saved_cents / goal.target_cents),
    months,
    suggested: Math.ceil(remaining / months / 100) * 100,
  };
}

/* ---------- empresa: fôlego de caixa, Simples Nacional, resultado ---------- */

/** Dias de caixa no ritmo de saída dos 3 meses fechados anteriores. */
export function cashRunwayDays(args: { cashCents: number; txs: TxView[]; today: string }): number {
  const { cashCents, txs, today } = args;
  let out = 0;
  let days = 0;
  for (let o = -3; o <= -1; o++) {
    const key = monthKey(today, o);
    out += monthTotals(txs, key).out;
    const [y, m] = key.split('-').map(Number);
    days += daysInMonth(y, m - 1);
  }
  return out > 0 ? cashCents / (out / days) : Infinity;
}

/** Simples Nacional, Anexo III. Valores da tabela de referência, em reais. */
const ANEXO_III: [number, number, number][] = [
  [180_000, 0.06, 0],
  [360_000, 0.112, 9_360],
  [720_000, 0.135, 17_640],
  [1_800_000, 0.16, 35_640],
  [3_600_000, 0.21, 125_640],
  [4_800_000, 0.33, 648_000],
];

export const SIMPLES_LIMIT_CENTS = 480_000_000;

export function simplesRate(rbt12Reais: number) {
  const i = ANEXO_III.findIndex((r) => rbt12Reais <= r[0]);
  const row = ANEXO_III[i < 0 ? ANEXO_III.length - 1 : i];
  const effective = rbt12Reais > 0 ? Math.max(0, (rbt12Reais * row[1] - row[2]) / rbt12Reais) : row[1];
  return { band: (i < 0 ? ANEXO_III.length : i + 1), nominal: row[1], effective };
}

export function revenueOfMonth(txs: TxView[], key: string): number {
  return sum(
    inMonth(txs, key).filter((t) => t.type === 'in' && t.category_key === 'receita'),
    (t) => t.amount_cents,
  );
}

/** Faturamento dos 12 meses fechados antes do mês de `today`. */
export function rbt12(txs: TxView[], today: string): number {
  let s = 0;
  for (let o = -12; o <= -1; o++) s += revenueOfMonth(txs, monthKey(today, o));
  return s;
}

/** Estimativa do DAS do mês: alíquota efetiva sobre a receita do mês anterior. */
export function dasEstimate(txs: TxView[], today: string) {
  const acc = rbt12(txs, today);
  const rate = simplesRate(acc / 100);
  const base = revenueOfMonth(txs, monthKey(today, -1));
  return { amountCents: Math.round((base * rate.effective) / 50) * 50, rate, rbt12Cents: acc };
}

/** Despesas da empresa: tudo que sai, menos retirada do sócio e uso pessoal. */
export function companyExpenses(txs: TxView[], key: string): number {
  return sum(
    inMonth(txs, key).filter((t) => t.type === 'out' && t.category_key !== 'retirada' && t.category_key !== 'pessoal'),
    (t) => t.amount_cents,
  );
}

export function ownerDraws(txs: TxView[], key: string): number {
  return sum(
    inMonth(txs, key).filter((t) => t.type === 'out' && (t.category_key === 'retirada' || t.category_key === 'pessoal')),
    (t) => t.amount_cents,
  );
}

export function personalOnCompany(txs: TxView[], key: string): TxView[] {
  return inMonth(txs, key).filter((t) => t.category_key === 'pessoal');
}

/** Demonstrativo simplificado do mês. */
export function dre(txs: TxView[], key: string) {
  const c = byCategory(txs, key, 'out');
  const revenue = monthTotals(txs, key).in;
  const das = c.das ?? 0;
  const net = revenue - das;
  const payroll = (c.folha ?? 0) + (c.encargos ?? 0);
  const opex = (c.aluguel ?? 0) + (c.software ?? 0) + (c.marketing ?? 0) + (c.freela ?? 0) + (c.contador ?? 0) + (c.equip ?? 0);
  const result = net - payroll - opex;
  const draws = c.retirada ?? 0;
  const personal = c.pessoal ?? 0;
  return { revenue, das, net, payroll, opex, result, draws, personal, afterOwner: result - draws - personal, margin: revenue > 0 ? result / revenue : 0 };
}

/** Quanto dá para retirar sem ficar abaixo de um mês de despesas, depois das contas dos próximos 30 dias. */
export function safeWithdrawal(args: { accountCents: number; bills: Bill[]; txs: TxView[]; today: string }) {
  const { accountCents, bills, txs, today } = args;
  const limit = addDays(today, 30);
  const payable = sum(
    bills.filter((b) => b.kind === 'pagar' && b.status === 'open' && b.due_on <= limit),
    (b) => b.amount_cents,
  );
  const reserve = companyExpenses(txs, monthKey(today, -1));
  const room = accountCents - payable - reserve;
  return { payable, reserve, room, safe: room > 0 ? Math.floor(room / 10_000) * 10_000 : 0 };
}
