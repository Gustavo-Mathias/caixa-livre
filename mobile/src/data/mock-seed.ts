/**
 * Dados de demonstração em memória (só para desenvolvimento, EXPO_PUBLIC_MOCK=1).
 * Espelham o que o banco cria para um perfil novo, mais um histórico de lançamentos.
 */
import { addDays, addMonths, daysInMonth, parseISO, startOfMonth, toISO } from '@/lib/dates';
import type { Account, Bill, Bucket, Category, Goal, ProfileKind, TxView } from '@/domain/types';
import type { Workspace } from './backend';

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const PF_CATS: [string, string, Category['kind'], string, boolean][] = [
  ['salario', 'Pró-labore', 'in', 'brief', false], ['extras', 'Trabalhos extras', 'in', 'wallet', false], ['rend', 'Rendimentos', 'in', 'trend', false],
  ['moradia', 'Moradia', 'out', 'home', false], ['mercado', 'Mercado', 'out', 'cart', false], ['rest', 'Restaurantes', 'out', 'fork', false],
  ['transp', 'Transporte', 'out', 'car', false], ['saude', 'Saúde', 'out', 'heart', false], ['lazer', 'Lazer', 'out', 'ticket', false],
  ['assin', 'Assinaturas', 'out', 'repeat', false], ['educ', 'Educação', 'out', 'book', false], ['outros', 'Outros', 'out', 'dots', false],
  ['curto', 'Investimento de curto prazo', 'transfer', 'wallet', false], ['longo', 'Investimento de longo prazo', 'transfer', 'trend', false],
  ['fatura', 'Fatura do cartão', 'transfer', 'card', true],
];
const PJ_CATS: [string, string, Category['kind'], string, boolean][] = [
  ['receita', 'Receitas de clientes', 'in', 'wallet', false], ['rendimento', 'Rendimentos', 'in', 'trend', false],
  ['folha', 'Pró-labore e folha', 'out', 'brief', false], ['encargos', 'FGTS e INSS', 'out', 'bank', false], ['das', 'Imposto (DAS)', 'out', 'receipt', false],
  ['aluguel', 'Aluguel e coworking', 'out', 'build', false], ['software', 'Software e assinaturas', 'out', 'repeat', false],
  ['marketing', 'Marketing e anúncios', 'out', 'mega', false], ['freela', 'Freelancers e fornecedores', 'out', 'users', false],
  ['contador', 'Contabilidade', 'out', 'book', false], ['equip', 'Equipamentos', 'out', 'laptop', false], ['retirada', 'Retirada do sócio', 'out', 'swap', false],
  ['pessoal', 'Gasto pessoal no CNPJ', 'out', 'home', true], ['fatura', 'Fatura do cartão', 'transfer', 'card', true],
];

type AccountSeed = Partial<Account> & Pick<Account, 'id' | 'name' | 'kind' | 'balance_cents'>;

export function mockWorkspace(kind: ProfileKind, profileId: string, today: string): Workspace {
  const pf = kind === 'pf';
  const R = rng(pf ? 11 : 23);
  const jit = (b: number, p: number) => Math.round((b * (1 + (R() * 2 - 1) * p)) / 50) * 50;
  const cid = (key: string) => `${profileId}:cat:${key}`;
  const categories: Category[] = (pf ? PF_CATS : PJ_CATS).map(([key, name, k, icon, hidden], i) => ({
    id: cid(key), profile_id: profileId, key, name, kind: k, icon, hidden_in_form: hidden, sort: i,
  }));

  const seeds: AccountSeed[] = pf
    ? [
        { id: `${profileId}:cc`, name: 'Conta corrente', institution: 'Banco Exemplo', kind: 'bank', balance_cents: 842035 },
        { id: `${profileId}:rv`, name: 'Reserva', institution: 'Renda fixa', kind: 'save', balance_cents: 1520000 },
        { id: `${profileId}:cd`, name: 'Cartão de crédito', institution: 'final 4821', kind: 'card', balance_cents: 0, credit_limit_cents: 1200000, closing_day: 26, due_day: 5 },
      ]
    : [
        { id: `${profileId}:cc`, name: 'Conta PJ', institution: 'Banco Exemplo', kind: 'bank', balance_cents: 3864012 },
        { id: `${profileId}:rv`, name: 'Reserva da empresa', institution: 'CDB com liquidez diária', kind: 'save', balance_cents: 2500000 },
        { id: `${profileId}:cd`, name: 'Cartão corporativo', institution: 'final 7730', kind: 'card', balance_cents: 0, credit_limit_cents: 1000000, closing_day: 20, due_day: 28 },
      ];
  const accounts: Account[] = seeds.map(withAccountDefaults(profileId));

  const monthDay = (o: number, day: number) => {
    const s = startOfMonth(today, o);
    const d = parseISO(s);
    return addDays(s, Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())) - 1);
  };
  const nextDue = (day: number) => {
    const d = monthDay(0, day);
    return d > today ? d : monthDay(1, day);
  };

  const txs: TxView[] = [];
  let n = 0;
  const put = (o: number, day: number, description: string, key: string, amount: number, acct: string, type: TxView['type'] = 'out', tag: TxView['tag'] = 'empresa') => {
    const date = monthDay(o, day);
    if (date > today) return;
    n++;
    txs.push({
      id: `${profileId}:t${n}`, profile_id: profileId, account_id: `${profileId}:${acct}`, to_account_id: null, category_id: cid(key),
      type, amount_cents: amount, description, occurred_on: date, tag, bill_id: null, category_key: key,
    });
  };

  const bills: Bill[] = [];
  const bill = (id: string, kind: Bill['kind'], description: string, amount: number, due: string, key: string, recur = false) =>
    bills.push({ id: `${profileId}:${id}`, profile_id: profileId, kind, description, party: null, amount_cents: amount, due_on: due, category_id: cid(key),
      account_id: `${profileId}:cc`, recur_monthly: recur, status: 'open', settled_on: null });

  let buckets: Bucket[] = [];
  let goals: Goal[] = [];
  let plan: Workspace['plan'] = null;

  if (pf) {
    for (let o = -6; o <= 0; o++) {
      put(o, 1, 'Rendimento da reserva', 'rend', jit(5400, 0.12), 'cc', 'in');
      put(o, 5, 'Pró-labore · Prado Estúdio', 'salario', 534000, 'cc', 'in');
      put(o, 3, 'Academia', 'lazer', 11900, 'cd');
      put(o, 6, 'Streaming de vídeo', 'assin', 3990, 'cd'); put(o, 6, 'Streaming de música', 'assin', 2190, 'cd'); put(o, 9, 'Armazenamento em nuvem', 'assin', 1490, 'cd');
      put(o, 8, 'Plano de saúde', 'saude', 62000, 'cc');
      put(o, 10, 'Aluguel', 'moradia', 210000, 'cc'); put(o, 10, 'Condomínio', 'moradia', 68000, 'cc');
      put(o, 12, 'Energia elétrica', 'moradia', jit(21000, 0.2), 'cc');
      put(o, 14, 'Internet e celular', 'moradia', 17900, 'cc');
      put(o, 15, 'Curso de inglês', 'educ', 19000, 'cc');
      [2, 9, 16, 23].forEach((d, i) => put(o, d, ['Supermercado', 'Hortifruti', 'Supermercado', 'Padaria e mercearia'][i], 'mercado', jit(19000, 0.3), i % 2 ? 'cc' : 'cd'));
      [4, 8, 13, 18, 25].forEach((d, i) => put(o, d, ['Restaurante', 'Delivery', 'Café', 'Pizzaria', 'Delivery'][i], 'rest', Math.round((jit(6500, 0.4) * (o === 0 ? 1.5 : 1)) / 50) * 50, 'cd'));
      [3, 7, 11, 15, 20, 27].forEach((d, i) => put(o, d, ['App de transporte', 'Combustível', 'Estacionamento', 'App de transporte', 'Combustível', 'App de transporte'][i], 'transp', jit(5200, 0.5), 'cd'));
      put(o, 17, 'Farmácia', 'saude', jit(7500, 0.4), 'cd');
      put(o, 14, 'Cinema', 'lazer', jit(5200, 0.3), 'cd'); put(o, 21, 'Show', 'lazer', jit(13000, 0.3), 'cd');
      if ([-5, -3, -1, 0].includes(o)) put(o, 16, 'Projeto extra · design', 'extras', jit(140000, 0.3), 'cc', 'in');
      put(o, 6, 'Aporte · Reserva de emergência', 'curto', o === -2 ? 30000 : 50000, 'cc', 'transfer');
      if (o !== -3) put(o, 7, 'Aporte · Independência financeira', 'longo', o === 0 ? 80000 : 100000, 'cc', 'transfer');
    }
    // dívida do cartão = compras ainda não pagas (os últimos dois ciclos)
    accounts.find((a) => a.kind === 'card')!.balance_cents = txs
      .filter((t) => t.account_id.endsWith(':cd') && t.type === 'out' && t.occurred_on >= monthDay(-1, 27))
      .reduce((s, t) => s + t.amount_cents, 0);
    bill('b1', 'pagar', 'Plano de saúde', 62000, nextDue(8), 'saude', true);
    bill('b2', 'pagar', 'Aluguel', 210000, nextDue(10), 'moradia', true);
    bill('b3', 'pagar', 'Condomínio', 68000, nextDue(10), 'moradia', true);
    bill('b4', 'pagar', 'Energia elétrica', 21500, nextDue(12), 'moradia', true);
    bill('b5', 'pagar', 'Internet e celular', 17900, nextDue(14), 'moradia', true);
    bill('b6', 'pagar', 'Curso de inglês', 19000, nextDue(15), 'educ', true);
    plan = { profile_id: profileId, income_cents: 800000 };
    const bk = (key: string, name: string, pct: number, kind: Bucket['kind'], keys: string[], sort: number): Bucket =>
      ({ id: `${profileId}:bk:${key}`, profile_id: profileId, key, name, pct, kind, category_keys: keys, sort });
    buckets = [
      bk('desp', 'Despesas', 55, 'spend', ['moradia', 'mercado', 'saude', 'transp', 'outros'], 1),
      bk('estudo', 'Estudos', 5, 'spend', ['educ'], 2),
      bk('livre', 'Gastos livres', 10, 'spend', ['rest', 'lazer', 'assin'], 3),
      bk('curto', 'Investimento de curto prazo', 10, 'invest', ['curto'], 4),
      bk('longo', 'Investimento de longo prazo', 20, 'invest', ['longo'], 5),
    ];
    const g = (id: string, name: string, target: number, saved: number, months: number, bucket: Goal['bucket'], icon: string): Goal =>
      ({ id: `${profileId}:${id}`, profile_id: profileId, name, target_cents: target, saved_cents: saved, deadline: addMonths(today, months), bucket, icon });
    goals = [
      g('g1', 'Reserva de emergência', 3000000, 1520000, 8, 'curto', 'wallet'),
      g('g2', 'Viagem de fim de ano', 800000, 310000, 2, 'curto', 'ticket'),
      g('g3', 'Notebook novo', 1200000, 420000, 6, 'curto', 'laptop'),
      g('g4', 'Independência financeira', 10000000, 1260000, 120, 'longo', 'trend'),
    ];
  } else {
    const clients: [string, string][] = [['Studio Pilates Corpo & Mente', 'identidade visual'], ['Marcos Vilela Arquitetura', 'site institucional'], ['Padaria Pão Nobre', 'manutenção do site'], ['Escola de Idiomas Horizonte', 'redes sociais'], ['Mercearia Dois Irmãos', 'cardápio digital'], ['Oficina Mecânica Rápida', 'logotipo e papelaria'], ['Livraria Entrelinhas', 'catálogo online'], ['Clínica Odonto Sorriso', 'landing page']];
    const base = [760000, 560000, 380000, 480000, 330000, 290000];
    const pay: Record<number, number[]> = {};
    for (let o = -13; o <= 0; o++) pay[o] = base.map((b) => jit(b, 0.12));
    const revOf = (o: number) => pay[o].reduce((s, x) => s + x, 0);
    for (let o = -12; o <= 0; o++) {
      pay[o].forEach((amt, i) => { const c = clients[(i + o + 24) % clients.length]; put(o, [4, 8, 12, 17, 22, 27][i], `${c[0]} · ${c[1]}`, 'receita', amt, 'cc', 'in'); });
      put(o, 1, 'Rendimento da reserva', 'rendimento', jit(21000, 0.1), 'cc', 'in');
      put(o, 5, 'Pró-labore · Camila', 'folha', 600000, 'cc'); put(o, 5, 'Salário · designer', 'folha', 300000, 'cc');
      put(o, 7, 'FGTS', 'encargos', 24000, 'cc'); put(o, 10, 'Aluguel do coworking', 'aluguel', 180000, 'cc');
      put(o, 15, 'Contabilidade', 'contador', 48000, 'cc'); put(o, 20, 'INSS do pró-labore', 'encargos', 66000, 'cc');
      put(o, 20, 'DAS · Simples Nacional', 'das', Math.round((revOf(o - 1) * 0.0841) / 50) * 50, 'cc');
      put(o, 3, 'E-mail e armazenamento', 'software', 8400, 'cd'); put(o, 9, 'Hospedagem e domínios', 'software', 14900, 'cd');
      put(o, 12, 'Assinaturas de design', 'software', 89000, 'cd'); put(o, 18, 'Anúncios online', 'marketing', jit(160000, 0.3), 'cd');
      if (o % 2 === 0) put(o, 24, 'Freelancer · ilustração', 'freela', jit(220000, 0.3), 'cc');
      if (o === -2) put(o, 13, 'Notebook novo', 'equip', 920000, 'cd');
      if (o === -1 || o === -4) put(o, 28, 'Distribuição de lucros · Camila', 'retirada', 400000, 'cc');
      if (o === -1) { put(o, 6, 'Supermercado', 'pessoal', 31250, 'cd', 'out', 'pessoal'); put(o, 22, 'Farmácia', 'pessoal', 8790, 'cd', 'out', 'pessoal'); }
      if (o === 0) { put(o, 6, 'Supermercado', 'pessoal', 27480, 'cd', 'out', 'pessoal'); put(o, 11, 'Academia', 'pessoal', 11900, 'cd', 'out', 'pessoal'); put(o, 16, 'Restaurante', 'pessoal', 18000, 'cd', 'out', 'pessoal'); }
    }
    accounts.find((a) => a.kind === 'card')!.balance_cents = txs
      .filter((t) => t.account_id.endsWith(':cd') && t.type === 'out' && t.occurred_on >= monthDay(-1, 21))
      .reduce((s, t) => s + t.amount_cents, 0);
    let rbt = 0; for (let o = -12; o <= -1; o++) rbt += revOf(o);
    const eff = Math.max(0, (rbt / 100 * 0.112 - 9360) / (rbt / 100));
    const das = Math.round((revOf(-1) * eff) / 50) * 50;
    bill('p1', 'pagar', 'Pró-labore · Camila', 600000, nextDue(5), 'folha', true);
    bill('p2', 'pagar', 'Salário · designer', 300000, nextDue(5), 'folha', true);
    bill('p3', 'pagar', 'FGTS', 24000, nextDue(7), 'encargos', true);
    bill('p4', 'pagar', 'Aluguel do coworking', 180000, nextDue(10), 'aluguel', true);
    bill('p5', 'pagar', 'Contabilidade', 48000, nextDue(15), 'contador', true);
    bill('p6', 'pagar', 'INSS do pró-labore', 66000, nextDue(20), 'encargos', true);
    bill('p7', 'pagar', 'DAS · Simples Nacional', das, nextDue(20), 'das', true);
    const rc = (id: string, d: string, amt: number, o: number) => bill(id, 'receber', d, amt, addDays(today, o), 'receita');
    rc('r1', 'Clínica Odonto Sorriso · landing page 1/2', 110000, -12); rc('r2', 'Livraria Entrelinhas · catálogo online 4/4', 55000, -10);
    rc('r3', 'Ana Beatriz Torres · consultoria de marca 1/3', 30000, -8); rc('r4', 'Júlia Mendonça Nutrição · site e agenda 1/3', 140000, -3);
    rc('r5', 'Studio Pilates Corpo & Mente · identidade visual 5/6', 80000, -2); rc('r6', 'Padaria Pão Nobre · manutenção do site 3/4', 35000, 0);
    rc('r7', 'Mercearia Dois Irmãos · cardápio digital 2/3', 75000, 0); rc('r8', 'Oficina Mecânica Rápida · logotipo e papelaria 2/2', 90000, 5);
    rc('r9', 'Marcos Vilela Arquitetura · site institucional 3/4', 150000, 15); rc('r10', 'Escola de Idiomas Horizonte · redes sociais 4/5', 60000, 15);
    rc('r11', 'Clínica Odonto Sorriso · landing page 2/2', 110000, 18);
  }

  txs.sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : a.occurred_on > b.occurred_on ? -1 : 0));
  return { accounts, categories, txs, bills, buckets, plan, goals };
}

function withAccountDefaults(profileId: string) {
  return (a: Partial<Account> & Pick<Account, 'id' | 'name' | 'kind' | 'balance_cents'>): Account => ({
    profile_id: profileId, institution: null, credit_limit_cents: null, closing_day: null, due_day: null, archived: false, ...a,
  });
}

export { toISO };
