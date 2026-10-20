import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { inMonth, monthTotals } from '@/domain/finance';
import type { TxView } from '@/domain/types';
import { dayHeading, monthKey, monthLabel } from '@/lib/dates';
import { useWorkspace } from '@/providers/workspace';
import { Button, Card, Chip, Empty, Money, Notice, Rows, Screen, Sheet, Summary, Txt } from '@/ui/kit';
import { Icon } from '@/ui/icons';
import { fonts, radius, space, useTheme } from '@/ui/theme';
import { AppHeader } from './header';
import { TxRow } from './rows';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function TransactionsScreen() {
  const { profile, ws, today, loading, error, refetch, actions, guard } = useWorkspace();
  const t = useTheme();
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<'todos' | 'in' | 'out' | 'pessoal'>('todos');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<TxView | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const key = monthKey(today, offset);
  const totals = monthTotals(ws.txs, key);
  const isPj = profile?.kind === 'pj';

  const groups = useMemo(() => {
    const needle = norm(q.trim());
    const catName = (id: string) => ws.categories.find((c) => c.id === id)?.name ?? '';
    const list = inMonth(ws.txs, key).filter((x) =>
      (filter === 'todos' || (filter === 'pessoal' ? x.category_key === 'pessoal' : x.type === filter)) &&
      (!needle || norm(`${x.description} ${catName(x.category_id)}`).includes(needle)));
    const out: { date: string; items: TxView[] }[] = [];
    for (const x of list) {
      const g = out.find((o) => o.date === x.occurred_on);
      if (g) g.items.push(x); else out.push({ date: x.occurred_on, items: [x] });
    }
    return out;
  }, [ws, key, filter, q]);

  const filters: { id: typeof filter; label: string }[] = [
    { id: 'todos', label: 'Todos' }, { id: 'in', label: 'Entradas' }, { id: 'out', label: 'Saídas' },
    ...(isPj ? [{ id: 'pessoal' as const, label: 'Pessoal no CNPJ' }] : []),
  ];

  const cats = open ? ws.categories.filter((c) => c.kind === open.type && !c.hidden_in_form) : [];
  const close = () => { setOpen(null); setConfirmDelete(false); };

  return (
    <Screen>
      <AppHeader />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md }}>
        <StepButton dir="back" label="Mês anterior" disabled={offset <= -11} onPress={() => setOffset((o) => o - 1)} />
        <Txt variant="heading" style={{ textTransform: 'capitalize' }}>{monthLabel(key)}</Txt>
        <StepButton dir="next" label="Próximo mês" disabled={offset >= 0} onPress={() => setOffset((o) => o + 1)} />
      </View>

      <Card pad={false} style={{ flexDirection: 'row' }}>
        {[['Entradas', totals.in, 'pos'], ['Saídas', totals.out, undefined], ['Saldo', totals.in - totals.out, totals.in - totals.out < 0 ? 'neg' : 'pos']].map(([l, v, tone], i) => (
          <View key={l as string} style={{ flex: 1, padding: space.md, gap: 2, borderLeftWidth: i ? 1 : 0, borderLeftColor: t.line }}>
            <Txt variant="caption" color="ink2">{l as string}</Txt>
            <Money cents={v as number} tone={tone as 'pos' | 'neg' | undefined} size={13} />
          </View>
        ))}
      </Card>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.md, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line2, borderRadius: radius.md, paddingHorizontal: space.md }}>
        <Icon name="search" size={18} color={t.ink3} />
        <TextInput value={q} onChangeText={setQ} placeholder="Buscar descrição ou categoria" placeholderTextColor={t.ink3} accessibilityLabel="Buscar lançamento"
          style={{ flex: 1, minHeight: 46, color: t.ink, fontFamily: fonts.body, fontSize: 15 }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md }}>
        {filters.map((f) => <Chip key={f.id} label={f.label} on={filter === f.id} onPress={() => setFilter(f.id)} />)}
      </View>

      {error ? (
        <View style={{ marginTop: space.lg, gap: space.md }}>
          <Notice tone="bad" title="Não foi possível carregar">{error.message}</Notice>
          <Button title="Tentar de novo" variant="secondary" onPress={() => refetch()} />
        </View>
      ) : loading ? (
        <Empty>Carregando…</Empty>
      ) : groups.length === 0 ? (
        <Empty>Nenhum lançamento encontrado.</Empty>
      ) : (
        groups.map((g) => (
          <View key={g.date} style={{ marginTop: space.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, paddingBottom: 4 }}>
              <Txt variant="small" color="ink2" style={{ fontFamily: fonts.bodyMedium }}>{dayHeading(g.date, today)}</Txt>
              <Money cents={g.items.reduce((s, x) => s + (x.type === 'in' ? x.amount_cents : x.type === 'out' ? -x.amount_cents : 0), 0)} size={12} tone="muted" />
            </View>
            <Rows>{g.items.map((x) => <TxRow key={x.id} tx={x} ws={ws} onPress={() => setOpen(x)} />)}</Rows>
          </View>
        ))
      )}

      <Sheet visible={!!open} onClose={close} title={open?.description}>
        {open ? (
          <>
            <Summary>
              <Txt variant="small" color="ink2">
                {open.type === 'in' ? 'Receita' : open.type === 'out' ? 'Despesa' : 'Transferência'} · {dayHeading(open.occurred_on, today)} · {ws.accounts.find((a) => a.id === open.account_id)?.name}
              </Txt>
              <Money cents={open.amount_cents} size={20} tone={open.type === 'in' ? 'pos' : undefined} />
            </Summary>

            {cats.length ? (
              <View style={{ gap: space.sm }}>
                <Txt variant="label" color="ink2">Categoria</Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {cats.map((c) => (
                    <Chip key={c.id} label={c.name} on={c.id === open.category_id}
                      onPress={() => guard(async () => { if (await actions.recategorize(open.id, { id: c.id, key: c.key })) close(); })} />
                  ))}
                </View>
              </View>
            ) : null}

            {isPj && open.category_key === 'pessoal' ? (
              <Notice title="Gasto pessoal pago pela empresa">
                Registre como retirada do sócio para o resultado da empresa ficar correto.
              </Notice>
            ) : null}
            {isPj && open.category_key === 'pessoal' ? (
              <Button title="Reclassificar como retirada" onPress={() => {
                const c = ws.categories.find((x) => x.key === 'retirada');
                if (c) guard(async () => { if (await actions.recategorize(open.id, { id: c.id, key: c.key })) close(); });
              }} />
            ) : null}

            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Button title="Fechar" variant="secondary" onPress={close} style={{ flex: 1 }} />
              <Button title={confirmDelete ? 'Confirmar exclusão' : 'Excluir'} variant="danger" style={{ flex: 1 }}
                onPress={() => { if (!confirmDelete) { setConfirmDelete(true); return; } guard(async () => { if (await actions.deleteTransaction(open.id)) close(); }); }} />
            </View>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function StepButton({ dir, label, disabled, onPress }: { dir: 'back' | 'next'; label: string; disabled: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: t.line2, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
      <View style={dir === 'next' ? { transform: [{ scaleX: -1 }] } : undefined}><Icon name="back" size={20} color={t.ink} /></View>
    </Pressable>
  );
}
