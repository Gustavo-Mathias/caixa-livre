import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { byCategory, cashRunwayDays, companyExpenses, dasEstimate, dre, monthSeries, monthTotals, ownerDraws, personalOnCompany, SIMPLES_LIMIT_CENTS } from '@/domain/finance';
import { dayLabel, diffDays, monthKey, monthName } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { useWorkspace } from '@/providers/workspace';
import { Bar, Button, Card, Chip, Empty, KV, Money, Notice, Rows, Screen, Section, Segmented, Txt } from '@/ui/kit';
import { fonts, space, useTheme } from '@/ui/theme';
import { PairChart } from '../common/chart';
import { AppHeader } from '../common/header';
import { BillRow } from '../common/rows';
import { cardInvoices, useSettle } from '../common/settle';

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

function Trio({ items }: { items: [string, number, ('pos' | 'neg')?][] }) {
  const t = useTheme();
  return (
    <Card pad={false} style={{ flexDirection: 'row' }}>
      {items.map(([l, v, tone], i) => (
        <View key={l} style={{ flex: 1, padding: space.md, gap: 2, borderLeftWidth: i ? 1 : 0, borderLeftColor: t.line }}>
          <Txt variant="caption" color="ink2">{l}</Txt>
          <Money cents={v} tone={tone} size={13} />
        </View>
      ))}
    </Card>
  );
}

export function PjHome() {
  const { ws, today, loading, error, refetch } = useWorkspace();
  const router = useRouter();
  const settle = useSettle();
  const t = useTheme();
  const key = monthKey(today);
  const banks = ws.accounts.filter((a) => a.kind === 'bank');
  const saves = ws.accounts.filter((a) => a.kind === 'save');
  const cash = sum(ws.accounts.filter((a) => a.kind !== 'card').map((a) => a.balance_cents));
  const totals = monthTotals(ws.txs, key);
  const exp = companyExpenses(ws.txs, key);
  const result = totals.in - exp;
  const runway = cashRunwayDays({ cashCents: cash, txs: ws.txs, today });
  const pessoal = personalOnCompany(ws.txs, key);
  const all = [...ws.bills, ...cardInvoices(ws.accounts, ws.txs, today)];
  const week = [
    ...all.filter((b) => diffDays(b.due_on, today) >= 0 && diffDays(b.due_on, today) <= 7),
    ...all.filter((b) => b.kind === 'receber' && diffDays(b.due_on, today) < 0),
  ].sort((a, b) => (a.due_on < b.due_on ? -1 : 1)).slice(0, 6);
  const pay7 = sum(all.filter((b) => b.kind === 'pagar' && diffDays(b.due_on, today) <= 7).map((b) => b.amount_cents));
  const rec7 = sum(all.filter((b) => b.kind === 'receber' && diffDays(b.due_on, today) <= 7).map((b) => b.amount_cents));
  const das = dasEstimate(ws.txs, today);
  const dasBill = ws.bills.find((b) => b.kind === 'pagar' && b.category_id === ws.categories.find((c) => c.key === 'das')?.id);
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
            <Txt variant="label" style={{ color: t.accentInk, opacity: 0.9 }}>Caixa da empresa</Txt>
            <Money cents={cash} size={40} tone="onAccent" style={{ fontFamily: fonts.displayBold, letterSpacing: -1 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
              <Txt variant="small" style={{ color: t.accentInk }}>Fôlego: {Number.isFinite(runway) ? `${Math.round(runway)} dias` : 'sem histórico'}</Txt>
              <Txt variant="small" style={{ color: t.accentInk }}>Resultado de {monthName(key)}: {formatBRL(result)}</Txt>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(127,127,127,0.4)' }}>
              <Txt variant="caption" style={{ color: t.accentInk, opacity: 0.9 }}>Contas {formatBRL(sum(banks.map((a) => a.balance_cents)))}</Txt>
              <Txt variant="caption" style={{ color: t.accentInk, opacity: 0.9 }}>Reserva {formatBRL(sum(saves.map((a) => a.balance_cents)))}</Txt>
            </View>
          </View>

          {empty ? (
            <View style={{ marginTop: space.lg }}>
              <Notice tone="accent" title="Bem-vindo! Comece por aqui">
                <Txt variant="small">1. Em Contas, informe o saldo da conta da empresa.{'\n'}2. Cadastre o que você tem a pagar e a receber.{'\n'}3. Toque no + para lançar entradas e saídas.</Txt>
              </Notice>
              <Button title="Configurar contas" variant="secondary" onPress={() => router.push('/accounts')} style={{ marginTop: space.md }} />
            </View>
          ) : null}

          <View style={{ marginTop: space.md }}>
            <Trio items={[['Receita', totals.in, 'pos'], ['Despesas', exp], ['Resultado', result, result < 0 ? 'neg' : 'pos']]} />
          </View>

          {pessoal.length ? (
            <View style={{ marginTop: space.md }}>
              <Notice tone="warn" title="Gasto pessoal no CNPJ">
                <Txt variant="small">{formatBRL(sum(pessoal.map((x) => x.amount_cents)))} em {pessoal.length} {pessoal.length === 1 ? 'lançamento' : 'lançamentos'} neste mês. Misturar as contas distorce o resultado da empresa. Marque como retirada do sócio ou devolva o valor.</Txt>
                <Button title="Revisar lançamentos" onPress={() => router.push('/transactions')} style={{ marginTop: space.sm }} />
              </Notice>
            </View>
          ) : null}

          <Section title="Próximos 7 dias" action="Ver tudo" onAction={() => router.push('/plan')} />
          <Trio items={[['A pagar', pay7], ['A receber', rec7, 'pos'], ['Diferença', rec7 - pay7, rec7 - pay7 < 0 ? 'neg' : 'pos']]} />
          <View style={{ marginTop: space.md }}>
            {week.length ? <Rows>{week.map((b) => <BillRow key={b.id} bill={b} ws={ws} today={today} onSettle={settle.open} />)}</Rows> : <Card><Empty>Nada vence nos próximos 7 dias.</Empty></Card>}
          </View>

          <Section title="Impostos" action="Detalhes" onAction={() => router.push('/plan')} />
          <Card>
            <KV label="DAS estimado"><Money cents={dasBill?.amount_cents ?? das.amountCents} bold /></KV>
            <KV label="Vence em">{dasBill ? `${dayLabel(dasBill.due_on)} · ${Math.max(0, diffDays(dasBill.due_on, today))} dias` : '—'}</KV>
            <KV label="Alíquota efetiva estimada">{`${(das.rate.effective * 100).toFixed(2).replace('.', ',')}%`}</KV>
          </Card>

          <Section title="Entradas e saídas" />
          <PairChart data={monthSeries(ws.txs, today, 6)} />
        </>
      )}
      {settle.sheet}
    </Screen>
  );
}

export function PjManage() {
  const { ws, today } = useWorkspace();
  const settle = useSettle();
  const [tab, setTab] = useState<'fluxo' | 'impostos' | 'dre'>('fluxo');
  const [kind, setKind] = useState<'pagar' | 'receber'>('pagar');
  const [dreOffset, setDreOffset] = useState(0);
  const all = [...ws.bills, ...cardInvoices(ws.accounts, ws.txs, today)].sort((a, b) => (a.due_on < b.due_on ? -1 : 1));
  const cash = sum(ws.accounts.filter((a) => a.kind !== 'card').map((a) => a.balance_cents));
  const p30 = sum(all.filter((b) => b.kind === 'pagar' && diffDays(b.due_on, today) <= 30).map((b) => b.amount_cents));
  const r30 = sum(all.filter((b) => b.kind === 'receber' && diffDays(b.due_on, today) <= 30).map((b) => b.amount_cents));

  return (
    <Screen>
      <AppHeader />
      <Segmented value={tab} onChange={setTab} options={[{ value: 'fluxo', label: 'Pagar e receber' }, { value: 'impostos', label: 'Impostos' }, { value: 'dre', label: 'Resultado' }]} />

      {tab === 'fluxo' ? (
        <>
          <View style={{ marginTop: space.lg }}>
            <Trio items={[['A pagar em 30 dias', p30], ['A receber em 30 dias', r30, 'pos'], ['Saldo previsto', cash - p30 + r30]]} />
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: space.md }}>
            {(['pagar', 'receber'] as const).map((k) => (
              <Chip key={k} on={kind === k} label={`${k === 'pagar' ? 'A pagar' : 'A receber'} (${all.filter((b) => b.kind === k).length})`} onPress={() => setKind(k)} />
            ))}
          </View>
          <View style={{ marginTop: space.md }}>
            {all.filter((b) => b.kind === kind).length
              ? <Rows>{all.filter((b) => b.kind === kind).map((b) => <BillRow key={b.id} bill={b} ws={ws} today={today} onSettle={settle.open} />)}</Rows>
              : <Card><Empty>Nada por aqui.</Empty></Card>}
          </View>
          {kind === 'receber' ? <Txt variant="small" color="ink3" style={{ marginTop: space.sm }}>Ao marcar como recebido, o valor entra na conta escolhida.</Txt> : null}
        </>
      ) : null}

      {tab === 'impostos' ? <Taxes /> : null}

      {tab === 'dre' ? <Dre offset={dreOffset} setOffset={setDreOffset} /> : null}
      {settle.sheet}
    </Screen>
  );
}

function Taxes() {
  const { ws, today } = useWorkspace();
  const settle = useSettle();
  const das = dasEstimate(ws.txs, today);
  const dasCat = ws.categories.find((c) => c.key === 'das')?.id;
  const dasBill = ws.bills.find((b) => b.kind === 'pagar' && b.category_id === dasCat);
  const used = das.rbt12Cents / SIMPLES_LIMIT_CENTS;
  const catIds = ws.categories.filter((c) => c.key === 'das' || c.key === 'encargos').map((c) => c.id);
  const obligations = ws.bills.filter((b) => b.kind === 'pagar' && catIds.includes(b.category_id) && diffDays(b.due_on, today) <= 31).sort((a, b) => (a.due_on < b.due_on ? -1 : 1));
  return (
    <>
      <Card style={{ marginTop: space.lg }}>
        <KV label="DAS do mês"><Money cents={dasBill?.amount_cents ?? das.amountCents} bold /></KV>
        <KV label="Vencimento">{dasBill ? dayLabel(dasBill.due_on) : '—'}</KV>
        <KV label="Faixa do Anexo III">{`${das.rate.band}ª · ${(das.rate.nominal * 100).toFixed(1).replace('.', ',')}% nominal`}</KV>
        <KV label="Alíquota efetiva estimada">{`${(das.rate.effective * 100).toFixed(2).replace('.', ',')}%`}</KV>
      </Card>
      <Section title="Faturamento em 12 meses" />
      <Card style={{ gap: space.sm }}>
        <KV label="Acumulado"><Money cents={das.rbt12Cents} bold /></KV>
        <Bar value={Math.max(0.02, used)} label={`${(used * 100).toFixed(1)}% do limite do Simples`} />
        <KV label="Limite do Simples">{`${formatBRL(SIMPLES_LIMIT_CENTS)} · ${(used * 100).toFixed(1).replace('.', ',')}% usado`}</KV>
      </Card>
      <Section title="Obrigações dos próximos 30 dias" />
      {obligations.length ? <Rows>{obligations.map((b) => <BillRow key={b.id} bill={b} ws={ws} today={today} onSettle={settle.open} />)}</Rows> : <Card><Empty>Nenhuma obrigação neste período.</Empty></Card>}
      <Txt variant="small" color="ink3" style={{ marginTop: space.md }}>
        Estimativa pela tabela do Anexo III, com o faturamento do mês anterior. Confirme os valores e as datas com a sua contabilidade antes de pagar.
      </Txt>
      {settle.sheet}
    </>
  );
}

function Dre({ offset, setOffset }: { offset: number; setOffset: (n: number) => void }) {
  const { ws, today } = useWorkspace();
  const key = monthKey(today, offset);
  const d = dre(ws.txs, key);
  const by = byCategory(ws.txs, key, 'out');
  const top = Object.keys(by).filter((k) => k !== 'retirada' && k !== 'pessoal').sort((a, b) => by[b] - by[a]).slice(0, 5);
  const totalOpex = companyExpenses(ws.txs, key);
  void ownerDraws;
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: space.lg }}>
        <Chip label="Este mês" on={offset === 0} onPress={() => setOffset(0)} />
        <Chip label="Mês passado" on={offset === -1} onPress={() => setOffset(-1)} />
      </View>
      <Card style={{ marginTop: space.md }}>
        <Txt variant="heading" style={{ textTransform: 'capitalize', marginBottom: 4 }}>Resultado de {monthName(key)}{offset === 0 ? ' (até hoje)' : ''}</Txt>
        <KV label="Receita bruta"><Money cents={d.revenue} /></KV>
        <KV label="(−) Imposto (DAS)"><Money cents={-d.das} /></KV>
        <KV label="Receita líquida" strong><Money cents={d.net} bold /></KV>
        <KV label="(−) Pessoal e encargos"><Money cents={-d.payroll} /></KV>
        <KV label="(−) Despesas operacionais"><Money cents={-d.opex} /></KV>
        <KV label="Resultado da empresa" strong><Money cents={d.result} bold /></KV>
        <KV label="(−) Retiradas do sócio"><Money cents={-d.draws} /></KV>
        <KV label="(−) Gastos pessoais no CNPJ"><Money cents={-d.personal} /></KV>
        <KV label="Resultado após o sócio" strong><Money cents={d.afterOwner} bold /></KV>
        <Txt variant="small" color="ink3">Margem da empresa: {Math.round(d.margin * 100)}% da receita.</Txt>
      </Card>
      <Section title="Maiores despesas" />
      <Card style={{ paddingVertical: 4 }}>
        {top.length ? top.map((k, i) => {
          const c = ws.categories.find((x) => x.key === k);
          return (
            <View key={k} style={{ gap: 6, paddingVertical: space.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt style={{ fontFamily: fonts.bodyMedium }}>{c?.name ?? k}</Txt>
                <Money cents={by[k]} />
              </View>
              <Bar value={totalOpex > 0 ? by[k] / totalOpex : 0} label={`${c?.name ?? k}`} />
            </View>
          );
        }) : <Empty>Sem despesas neste mês.</Empty>}
      </Card>
    </>
  );
}
