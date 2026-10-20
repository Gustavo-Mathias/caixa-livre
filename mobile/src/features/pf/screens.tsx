import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import type { Workspace } from '@/data';
import { bucketSpent, bucketState, bucketTarget, cardCycle, cardSummary, freeToSpend, goalPlan, monthSeries, monthTotals } from '@/domain/finance';
import type { Account, Bucket, Goal } from '@/domain/types';
import { dayLabel, diffDays, monthKey, monthName, parseISO } from '@/lib/dates';
import { formatBRL, parseBRL, toInputBRL } from '@/lib/money';
import { useWorkspace } from '@/providers/workspace';
import { Bar, Button, Card, Empty, Field, IconBubble, KV, Money, Notice, Pill, Row, Rows, Screen, Section, Segmented, Sheet, Summary, Txt } from '@/ui/kit';
import { fonts, space, useTheme } from '@/ui/theme';
import { PairChart } from '../common/chart';
import { AppHeader } from '../common/header';
import { BillRow, TxRow } from '../common/rows';
import { cardInvoices, useSettle } from '../common/settle';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

function bucketTone(b: Bucket, spent: number, target: number): 'accent' | 'ok' | 'warn' | 'bad' {
  const s = bucketState(b, spent, target);
  return s === 'over' ? 'bad' : s === 'warn' ? 'warn' : s === 'done' ? 'ok' : 'accent';
}

function BucketRow({ b, ws, today, income, onPress }: { b: Bucket; ws: Workspace; today: string; income: number; onPress: () => void }) {
  const target = bucketTarget(income, b);
  const spent = bucketSpent(ws.txs, monthKey(today), b);
  const invest = b.kind === 'invest';
  const pct = target > 0 ? spent / target : 0;
  const state = bucketState(b, spent, target);
  const foot = invest
    ? state === 'done' ? 'Meta do mês atingida' : `Faltam ${formatBRL(target - spent)}`
    : state === 'over' ? `Passou ${formatBRL(spent - target)}` : `Sobram ${formatBRL(target - spent)}`;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${b.name}, ${b.pct}% da renda. Ver detalhes`} style={{ paddingVertical: space.md, gap: 7 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt style={{ fontFamily: fonts.bodyMedium }} numberOfLines={1}>{b.name}</Txt>
          <Txt variant="small" color="ink2">{b.pct}% da renda · {invest ? 'aportado' : 'gasto'} de {formatBRL(target)}</Txt>
        </View>
        <Money cents={spent} />
      </View>
      <Bar value={pct} tone={bucketTone(b, spent, target)} label={`${Math.round(pct * 100)}% da meta do mês`} />
      <Txt variant="small" color={state === 'over' ? 'bad' : state === 'done' ? 'ok' : 'ink2'} style={state === 'over' || state === 'done' ? { fontFamily: fonts.bodyMedium } : undefined}>{foot}</Txt>
    </Pressable>
  );
}

function Alerts({ ws, today, income }: { ws: Workspace; today: string; income: number }) {
  const items: { icon: string; text: string }[] = [];
  const key = monthKey(today);
  const over = ws.buckets.filter((b) => b.kind === 'spend').map((b) => ({ b, s: bucketSpent(ws.txs, key, b), t: bucketTarget(income, b) })).filter((x) => x.t > 0 && x.s > x.t).sort((a, b) => b.s - b.t - (a.s - a.t))[0];
  if (over) items.push({ icon: 'alert', text: `${over.b.name} passou da meta de ${over.b.pct}% em ${formatBRL(over.s - over.t)} neste mês.` });
  const inv = ws.buckets.filter((b) => b.kind === 'invest');
  const falta = sum(inv.map((b) => Math.max(0, bucketTarget(income, b) - bucketSpent(ws.txs, key, b))));
  if (income > 0 && falta > 0) items.push({ icon: 'trend', text: `Faltam ${formatBRL(falta)} para completar os investimentos de ${monthName(key)}.` });
  for (const card of ws.accounts.filter((a) => a.kind === 'card')) {
    const s = cardSummary(card, ws.txs, today);
    const days = diffDays(s.cycle.end, today);
    if (s.debt > 0 && days <= 7) items.push({ icon: 'card', text: `A fatura de ${card.name} fecha em ${days === 0 ? 'hoje' : `${days} ${days === 1 ? 'dia' : 'dias'}`}.` });
  }
  if (!items.length) return null;
  return (
    <>
      <Section title="Atenção" />
      <View style={{ gap: space.sm }}>
        {items.map((i) => (
          <Card key={i.text} pad={false} style={{ flexDirection: 'row', gap: space.md, padding: space.md, alignItems: 'center' }}>
            <IconBubble name={i.icon} tone="accent" size={34} />
            <Txt variant="small" style={{ flex: 1 }}>{i.text}</Txt>
          </Card>
        ))}
      </View>
    </>
  );
}

function AccountCard({ a, ws, today }: { a: Account; ws: Workspace; today: string }) {
  const avg = (() => {
    let s = 0;
    for (let o = -3; o <= -1; o++) s += monthTotals(ws.txs, monthKey(today, o)).out;
    return s / 3;
  })();
  if (a.kind === 'card') {
    const s = cardSummary(a, ws.txs, today);
    return (
      <Card style={{ width: 236, gap: 6 }}>
        <Txt style={{ fontFamily: fonts.bodyMedium }}>{a.name}</Txt>
        <Txt variant="small" color="ink2">{a.institution ?? ''} · fecha em {diffDays(s.cycle.end, today)} dias</Txt>
        <Txt variant="caption" color="ink3">Dívida em aberto</Txt>
        <Money cents={s.debt} size={20} bold />
        <Bar value={s.limit > 0 ? s.debt / s.limit : 0} label="Limite usado" />
        <Txt variant="small" color="ink2">Disponível {formatBRL(s.available)} · vence {dayLabel(s.cycle.due)}</Txt>
      </Card>
    );
  }
  return (
    <Card style={{ width: 236, gap: 6 }}>
      <Txt style={{ fontFamily: fonts.bodyMedium }}>{a.name}</Txt>
      <Txt variant="small" color="ink2">{a.institution ?? (a.kind === 'save' ? 'Reserva' : 'Conta')}</Txt>
      <Money cents={a.balance_cents} size={20} bold />
      <Txt variant="small" color="ink2">
        {a.kind === 'save' && avg > 0 ? `Cobre ${(a.balance_cents / avg).toFixed(1).replace('.', ',')} meses de gastos` : 'Disponível agora'}
      </Txt>
    </Card>
  );
}

export function PfHome() {
  const { ws, today, loading, error, refetch } = useWorkspace();
  const router = useRouter();
  const settle = useSettle();
  const t = useTheme();
  const [bucketOpen, setBucketOpen] = useState<Bucket | null>(null);
  const key = monthKey(today);
  const banks = ws.accounts.filter((a) => a.kind === 'bank');
  const income = ws.plan?.income_cents ?? 0;
  const free = useMemo(() => freeToSpend({
    balanceCents: sum(ws.accounts.filter((a) => a.kind === 'bank').map((a) => a.balance_cents)),
    bills: ws.bills, cards: ws.accounts.filter((a) => a.kind === 'card'), txs: ws.txs, today,
  }), [ws, today]);
  const totals = monthTotals(ws.txs, key);
  const upcoming = [...ws.bills, ...cardInvoices(ws.accounts, ws.txs, today)]
    .filter((b) => b.kind === 'pagar' && diffDays(b.due_on, today) <= 20)
    .sort((a, b) => (a.due_on < b.due_on ? -1 : 1)).slice(0, 4);
  const empty = !loading && ws.txs.length === 0;

  return (
    <Screen>
      <AppHeader />
      {error ? (
        <View style={{ gap: space.md }}>
          <Notice tone="bad" title="Não foi possível carregar">{error.message}</Notice>
          <Button title="Tentar de novo" variant="secondary" onPress={() => refetch()} />
        </View>
      ) : (
        <>
          <View style={{ backgroundColor: t.accent, borderRadius: 22, padding: 18, gap: 10 }}>
            <Txt variant="label" style={{ color: t.accentInk, opacity: 0.9 }}>Livre para gastar até {dayLabel(free.end)}</Txt>
            <Money cents={free.free} size={40} tone="onAccent" style={{ fontFamily: fonts.displayBold, letterSpacing: -1 }} />
            {free.free < 0 ? (
              <Txt variant="small" style={{ color: t.accentInk }}>As contas e a fatura passam do saldo em {formatBRL(-free.free)}.</Txt>
            ) : (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                <Txt variant="small" style={{ color: t.accentInk }}>≈ {formatBRL(free.perDay)} por dia</Txt>
                <Txt variant="small" style={{ color: t.accentInk }}>{free.daysLeft} {free.daysLeft === 1 ? 'dia restante' : 'dias restantes'}</Txt>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(127,127,127,0.4)' }}>
              <Txt variant="caption" style={{ color: t.accentInk, opacity: 0.9 }}>Saldo em conta {formatBRL(sum(banks.map((a) => a.balance_cents)))}</Txt>
              <Txt variant="caption" style={{ color: t.accentInk, opacity: 0.9 }}>Contas e fatura {formatBRL(free.billsDue + free.cardDebt)}</Txt>
            </View>
          </View>

          {empty ? (
            <View style={{ marginTop: space.lg }}>
              <Notice tone="accent" title="Bem-vindo! Comece por aqui">
                <Txt variant="small">1. Em Contas, informe o saldo da sua conta corrente.{'\n'}2. Toque no + para lançar o que entrou e o que saiu.{'\n'}3. Ajuste a divisão da renda em Planejar.</Txt>
              </Notice>
              <Button title="Configurar contas" variant="secondary" onPress={() => router.push('/accounts')} style={{ marginTop: space.md }} />
            </View>
          ) : null}

          <Card pad={false} style={{ flexDirection: 'row', marginTop: space.md }}>
            {([['Entradas', totals.in, 'pos'], ['Saídas', totals.out, undefined], ['Sobrou', totals.in - totals.out, totals.in - totals.out < 0 ? 'neg' : 'pos']] as const).map(([l, v, tone], i) => (
              <View key={l} style={{ flex: 1, padding: space.md, gap: 2, borderLeftWidth: i ? 1 : 0, borderLeftColor: t.line }}>
                <Txt variant="caption" color="ink2">{l}</Txt>
                <Money cents={v} tone={tone} size={13} />
              </View>
            ))}
          </Card>

          <Section title="Próximas contas" />
          {upcoming.length ? <Rows>{upcoming.map((b) => <BillRow key={b.id} bill={b} ws={ws} today={today} onSettle={settle.open} />)}</Rows> : <Card><Empty>Nenhuma conta nos próximos 20 dias.</Empty></Card>}

          <Section title="Divisão da renda" action="Ajustar" onAction={() => router.push('/plan')} />
          {income > 0 ? (
            <Card style={{ paddingVertical: 0 }}>
              {ws.buckets.map((b, i) => (
                <View key={b.id} style={i ? { borderTopWidth: 1, borderTopColor: t.line } : undefined}>
                  <BucketRow b={b} ws={ws} today={today} income={income} onPress={() => setBucketOpen(b)} />
                </View>
              ))}
            </Card>
          ) : (
            <Card><Empty>Informe a sua renda mensal em Planejar para ver quanto cabe em cada parte.</Empty></Card>
          )}

          <Section title="Contas e cartões" action="Gerenciar" onAction={() => router.push('/accounts')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingRight: space.lg }}>
            {ws.accounts.map((a) => <AccountCard key={a.id} a={a} ws={ws} today={today} />)}
          </ScrollView>

          <Section title="Entradas e saídas" />
          <PairChart data={monthSeries(ws.txs, today, 6)} />

          <Alerts ws={ws} today={today} income={income} />
        </>
      )}
      {settle.sheet}
      <BucketSheet bucket={bucketOpen} onClose={() => setBucketOpen(null)} />
    </Screen>
  );
}

/* ---------- Planejar ---------- */

function SplitSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { ws, actions } = useWorkspace();
  const [income, setIncome] = useState('');
  const [pcts, setPcts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(false);

  if (visible && !seeded) {
    setSeeded(true);
    setIncome(toInputBRL(ws.plan?.income_cents ?? 0));
    setPcts(Object.fromEntries(ws.buckets.map((b) => [b.key, String(b.pct)])));
  }
  if (!visible && seeded) setSeeded(false);

  const rows = ws.buckets.map((b) => ({ b, n: Math.max(0, Math.min(100, Math.round(Number(pcts[b.key] ?? b.pct) || 0))) }));
  const total = sum(rows.map((r) => r.n));
  const incomeCents = parseBRL(income) ?? 0;
  const DEFAULT: Record<string, number> = { desp: 55, estudo: 5, livre: 10, curto: 10, longo: 20 };

  const save = async () => {
    setBusy(true);
    const ok = await actions.saveBudgetPlan(incomeCents, rows.map((r) => ({ key: r.b.key, pct: r.n })));
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Divisão da renda">
      <Field label="Renda mensal planejada (R$)" value={income} onChangeText={setIncome} keyboardType="decimal-pad" placeholder="0,00" />
      <View>
        {rows.map(({ b }, i) => (
          <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(127,127,127,0.25)' }}>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontFamily: fonts.bodyMedium }}>{b.name}</Txt>
              <Money cents={Math.round((incomeCents * (Number(pcts[b.key]) || 0)) / 100)} size={12} tone="muted" />
            </View>
            <View style={{ width: 96 }}>
              <Field label="" accessibilityLabel={`Percentual de ${b.name}`} value={pcts[b.key] ?? ''} onChangeText={(v) => setPcts((p) => ({ ...p, [b.key]: v.replace(/\D/g, '').slice(0, 3) }))} keyboardType="number-pad" right={<Txt color="ink2">%</Txt>} style={{ gap: 0 }} />
            </View>
          </View>
        ))}
      </View>
      <Notice tone={total === 100 ? 'accent' : 'bad'}>
        <Txt variant="label" style={{ textAlign: 'center' }}>{total === 100 ? 'Total: 100%' : `Total: ${total}% · ${total < 100 ? `faltam ${100 - total}%` : `passou ${total - 100}%`}`}</Txt>
      </Notice>
      <Button title="Salvar divisão" onPress={save} loading={busy} disabled={total !== 100 || incomeCents <= 0} />
      <Button title="Voltar ao padrão 55 · 5 · 10 · 10 · 20" variant="secondary" onPress={() => setPcts(Object.fromEntries(ws.buckets.map((b) => [b.key, String(DEFAULT[b.key] ?? b.pct)])))} />
    </Sheet>
  );
}

function BucketSheet({ bucket, onClose }: { bucket: Bucket | null; onClose: () => void }) {
  const { ws, today } = useWorkspace();
  const income = ws.plan?.income_cents ?? 0;
  const [goal, setGoal] = useState<Goal | null>(null);
  if (!bucket) return <GoalSheet goal={goal} onClose={() => setGoal(null)} />;
  const key = monthKey(today);
  const target = bucketTarget(income, bucket);
  const spent = bucketSpent(ws.txs, key, bucket);
  const invest = bucket.kind === 'invest';
  const outBy: Record<string, number> = {};
  const avg = (k: string) => { let s = 0; for (let o = -3; o <= -1; o++) s += ws.txs.filter((x) => x.type === 'out' && x.category_key === k && x.occurred_on.startsWith(monthKey(today, o))).reduce((a, x) => a + x.amount_cents, 0); return s / 3; };
  ws.txs.filter((x) => x.occurred_on.startsWith(key) && x.type === 'out').forEach((x) => { outBy[x.category_key] = (outBy[x.category_key] ?? 0) + x.amount_cents; });
  const aportes = ws.txs.filter((x) => x.occurred_on.startsWith(key) && x.type === 'transfer' && bucket.category_keys.includes(x.category_key));
  const goals = ws.goals.filter((g) => g.bucket === bucket.key);
  return (
    <>
      <Sheet visible onClose={onClose} title={`${bucket.name} · ${bucket.pct}%`}>
        <Summary>
          <Txt variant="small" color="ink2">Meta do mês</Txt>
          <Money cents={target} size={20} />
          <Txt variant="small" color="ink2">{invest ? 'Aportado' : 'Gasto'} {formatBRL(spent)} · {target ? Math.round((spent / target) * 100) : 0}%</Txt>
        </Summary>
        {invest ? (
          <>
            <Txt variant="label" color="ink2">Aportar em uma meta</Txt>
            {goals.length ? <Rows>{goals.map((g) => (
              <Row key={g.id} icon={g.icon} title={g.name} subtitle={`${formatBRL(g.saved_cents)} de ${formatBRL(g.target_cents)}`} right={<Button size="sm" variant="secondary" title="Aportar" onPress={() => { onClose(); setTimeout(() => setGoal(g), 250); }} />} />
            ))}</Rows> : <Txt variant="small" color="ink2">Nenhuma meta de {bucket.key === 'curto' ? 'curto' : 'longo'} prazo ainda. Crie uma na aba Metas.</Txt>}
            <Txt variant="label" color="ink2">Aportes deste mês</Txt>
            {aportes.length ? <Rows>{aportes.map((x) => <TxRow key={x.id} tx={x} ws={ws} />)}</Rows> : <Txt variant="small" color="ink2">Nenhum aporte neste mês.</Txt>}
          </>
        ) : (
          <>
            <Txt variant="label" color="ink2">Onde foi o dinheiro</Txt>
            <Rows>{bucket.category_keys.map((k) => ({ k, v: outBy[k] ?? 0 })).sort((a, b) => b.v - a.v).map(({ k, v }) => {
              const c = ws.categories.find((x) => x.key === k);
              return <Row key={k} icon={c?.icon ?? 'dots'} title={c?.name ?? k} subtitle={`Média de 3 meses: ${formatBRL(Math.round(avg(k)))}`} right={<Money cents={v} />} />;
            })}</Rows>
          </>
        )}
        <Button title="Fechar" variant="secondary" onPress={onClose} />
      </Sheet>
      <GoalSheet goal={goal} onClose={() => setGoal(null)} />
    </>
  );
}

function GoalSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { ws, actions } = useWorkspace();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const from = ws.accounts.find((a) => a.kind === 'bank');
  const to = ws.accounts.find((a) => a.kind === 'save');
  const cents = parseBRL(amount) ?? 0;
  return (
    <Sheet visible={!!goal} onClose={onClose} title={goal ? `Aportar em ${goal.name}` : ''}>
      {goal ? (
        <>
          <Summary><Txt variant="small" color="ink2">Falta para a meta</Txt><Money cents={Math.max(0, goal.target_cents - goal.saved_cents)} size={20} /></Summary>
          <Field label="Valor do aporte (R$)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" />
          <Txt variant="small" color="ink3">O valor sai de {from?.name ?? 'sua conta'} e vai para {to?.name ?? 'a reserva'}.</Txt>
          {!to ? <Notice tone="bad">Crie uma conta do tipo Reserva em Contas para receber os aportes.</Notice> : null}
          <Button title="Fazer aporte" loading={busy} disabled={cents <= 0 || !from || !to} onPress={async () => {
            if (!from || !to) return;
            setBusy(true);
            const ok = await actions.contribute({ goalId: goal.id, amountCents: cents, fromAccountId: from.id, toAccountId: to.id });
            setBusy(false);
            if (ok) { setAmount(''); onClose(); }
          }} />
        </>
      ) : null}
    </Sheet>
  );
}

export function PfPlan() {
  const { ws, today, guard } = useWorkspace();
  const t = useTheme();
  const [tab, setTab] = useState<'orc' | 'metas' | 'cartao'>('orc');
  const [split, setSplit] = useState(false);
  const [bucketOpen, setBucketOpen] = useState<Bucket | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const income = ws.plan?.income_cents ?? 0;
  const shades = [1, 0.72, 0.45, 0.6, 1];

  return (
    <Screen>
      <AppHeader />
      <Segmented value={tab} onChange={setTab} options={[{ value: 'orc', label: 'Divisão da renda' }, { value: 'metas', label: 'Metas' }, { value: 'cartao', label: 'Cartão' }]} />

      {tab === 'orc' ? (
        <>
          <Card style={{ marginTop: space.lg }}>
            <KV label="Renda mensal planejada"><Money cents={income} bold /></KV>
            <View style={{ flexDirection: 'row', height: 12, borderRadius: 99, overflow: 'hidden', gap: 2, marginVertical: space.sm }} accessibilityLabel={ws.buckets.map((b) => `${b.name} ${b.pct}%`).join(', ')}>
              {ws.buckets.map((b, i) => <View key={b.id} style={{ flex: b.pct, backgroundColor: b.kind === 'invest' ? t.ok : t.accent, opacity: shades[i] ?? 1 }} />)}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space.md }}>
              {ws.buckets.map((b, i) => (
                <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: '48%' }}>
                  <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: b.kind === 'invest' ? t.ok : t.accent, opacity: shades[i] ?? 1 }} />
                  <Txt variant="caption" color="ink2" numberOfLines={1} style={{ flex: 1 }}>{b.name} {b.pct}%</Txt>
                </View>
              ))}
            </View>
            <Button title="Editar divisão" variant="secondary" onPress={() => guard(() => setSplit(true))} />
          </Card>
          <Section title="Neste mês" />
          {income > 0 ? (
            <Card style={{ paddingVertical: 0 }}>
              {ws.buckets.map((b, i) => (
                <View key={b.id} style={i ? { borderTopWidth: 1, borderTopColor: t.line } : undefined}>
                  <BucketRow b={b} ws={ws} today={today} income={income} onPress={() => setBucketOpen(b)} />
                </View>
              ))}
            </Card>
          ) : <Card><Empty>Informe a sua renda mensal para ver quanto cabe em cada parte.</Empty></Card>}
        </>
      ) : null}

      {tab === 'metas' ? (
        <View style={{ gap: space.md, marginTop: space.lg }}>
          {ws.goals.length === 0 ? <Card><Empty>Você ainda não tem metas.</Empty></Card> : null}
          {ws.goals.map((g) => {
            const p = goalPlan(g, today);
            return (
              <Card key={g.id} style={{ gap: space.sm }}>
                <Row icon={g.icon} title={g.name} subtitle={`${g.bucket === 'curto' ? 'Curto prazo' : 'Longo prazo'} · até ${dayLabel(g.deadline)} ${parseISO(g.deadline).getFullYear()}`}
                  right={<Button size="sm" variant="secondary" title="Aportar" onPress={() => guard(() => setGoal(g))} />} />
                <Bar value={p.pct} tone="ok" label={`${Math.round(p.pct * 100)}% da meta`} />
                <KV label={`${formatBRL(g.saved_cents)} de ${formatBRL(g.target_cents)}`}>{`${Math.round(p.pct * 100)}%`}</KV>
                {p.remaining > 0 ? <Txt variant="small" color="ink2">Faltam {formatBRL(p.remaining)}. Aporte sugerido: {formatBRL(p.suggested)} por mês.</Txt> : <Pill label="Meta atingida" tone="ok" />}
              </Card>
            );
          })}
        </View>
      ) : null}

      {tab === 'cartao' ? <CardTab /> : null}

      <SplitSheet visible={split} onClose={() => setSplit(false)} />
      <BucketSheet bucket={bucketOpen} onClose={() => setBucketOpen(null)} />
      <GoalSheet goal={goal} onClose={() => setGoal(null)} />
    </Screen>
  );
}

function CardTab() {
  const { ws, today } = useWorkspace();
  const settle = useSettle();
  const router = useRouter();
  const card = ws.accounts.find((a) => a.kind === 'card');
  if (!card) {
    return (
      <View style={{ marginTop: space.lg, gap: space.md }}>
        <Card><Empty>Você ainda não cadastrou um cartão de crédito.</Empty></Card>
        <Button title="Adicionar cartão" onPress={() => router.push('/accounts')} />
      </View>
    );
  }
  const s = cardSummary(card, ws.txs, today);
  const inv = cardInvoices(ws.accounts, ws.txs, today)[0];
  const list = ws.txs.filter((x) => x.account_id === card.id && x.occurred_on >= s.cycle.start && x.occurred_on <= s.cycle.end);
  const prevDue = cardCycle(card, today);
  void prevDue;
  return (
    <>
      <Card style={{ marginTop: space.lg }}>
        <KV label="Dívida em aberto"><Money cents={s.debt} bold /></KV>
        <Bar value={s.limit > 0 ? s.debt / s.limit : 0} label="Limite usado" />
        <KV label="Fatura aberta (ciclo atual)"><Money cents={s.openInvoice} /></KV>
        <KV label="Fatura fechada, a pagar"><Money cents={s.closedInvoice} /></KV>
        <KV label="Limite disponível"><Money cents={s.available} /></KV>
        <KV label="Fecha em">{`${dayLabel(s.cycle.end)} · ${diffDays(s.cycle.end, today)} dias`}</KV>
        <KV label="Próximo vencimento">{dayLabel(s.cycle.due)}</KV>
        {inv ? <Button title="Pagar fatura" onPress={() => settle.open(inv)} style={{ marginTop: space.sm }} /> : null}
      </Card>
      <Section title="Compras desta fatura" />
      {list.length ? <Rows>{list.map((x) => <TxRow key={x.id} tx={x} ws={ws} />)}</Rows> : <Card><Empty>Sem compras neste ciclo.</Empty></Card>}
      {settle.sheet}
    </>
  );
}
