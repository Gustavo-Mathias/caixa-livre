import { useState } from 'react';
import { Text, View } from 'react-native';

import type { Workspace } from '@/data';
import type { Account, Bill, TxView } from '@/domain/types';
import { dayLabel, diffDays } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { Button, Chip, Money, Pill, Row, Sheet, Summary, Txt, usePrivacy } from '@/ui/kit';
import { fonts, space, useTheme } from '@/ui/theme';

export function dueText(b: Pick<Bill, 'kind' | 'due_on'>, today: string): { text: string; late: boolean } {
  const d = diffDays(b.due_on, today);
  if (b.kind === 'receber') {
    if (d < 0) return { text: `Atrasado há ${-d} ${-d === 1 ? 'dia' : 'dias'}`, late: true };
    if (d === 0) return { text: 'Previsto para hoje', late: false };
    return { text: d === 1 ? 'Previsto para amanhã' : `Previsto em ${d} dias`, late: false };
  }
  if (d < 0) return { text: `Venceu há ${-d} ${-d === 1 ? 'dia' : 'dias'}`, late: true };
  if (d === 0) return { text: 'Vence hoje', late: false };
  return { text: d === 1 ? 'Vence amanhã' : `Vence em ${d} dias · ${dayLabel(b.due_on)}`, late: false };
}

export function TxRow({ tx, ws, onPress }: { tx: TxView; ws: Workspace; onPress?: () => void }) {
  const cat = ws.categories.find((c) => c.id === tx.category_id);
  const acc = ws.accounts.find((a) => a.id === tx.account_id);
  const sign = tx.type === 'in' ? '+' : tx.type === 'out' ? '−' : '';
  return (
    <Row
      icon={cat?.icon ?? 'dots'}
      tone={tx.type === 'in' ? 'ok' : tx.tag === 'pessoal' ? 'warn' : 'neutral'}
      title={tx.description}
      subtitle={`${cat?.name ?? 'Sem categoria'}${acc ? ` · ${acc.name}` : ''}`}
      onPress={onPress}
      right={
        <>
          <MoneyWithSign cents={tx.amount_cents} sign={sign} pos={tx.type === 'in'} />
          {tx.tag === 'pessoal' ? <Pill label="Pessoal" tone="warn" /> : null}
        </>
      }
    />
  );
}

function MoneyWithSign({ cents, sign, pos }: { cents: number; sign: string; pos: boolean }) {
  const t = useTheme();
  const { hidden } = usePrivacy();
  return <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: pos ? t.ok : t.ink }}>{hidden ? 'R$ ••••' : `${sign}${formatBRL(cents)}`}</Text>;
}

export function BillRow({ bill, ws, today, onSettle }: { bill: Bill; ws: Workspace; today: string; onSettle: (b: Bill) => void }) {
  const cat = ws.categories.find((c) => c.id === bill.category_id);
  const due = dueText(bill, today);
  return (
    <Row
      icon={bill.id.startsWith('card:') ? 'card' : cat?.icon ?? 'dots'}
      tone={bill.kind === 'receber' ? 'ok' : 'neutral'}
      title={bill.description}
      subtitle={due.text}
      subtitleTone={due.late ? 'bad' : undefined}
      right={
        <>
          <Money cents={bill.amount_cents} tone={bill.kind === 'receber' ? 'pos' : undefined} />
          <Button size="sm" variant="secondary" title={bill.kind === 'receber' ? 'Recebi' : 'Pagar'} onPress={() => onSettle(bill)} />
        </>
      }
    />
  );
}

/** Confirma o pagamento ou o recebimento de uma conta. */
export function SettleSheet({ bill, ws, today, onClose, onConfirm }: {
  bill: Bill | null; ws: Workspace; today: string; onClose: () => void; onConfirm: (accountId: string) => Promise<boolean>;
}) {
  const banks: Account[] = ws.accounts.filter((a) => a.kind === 'bank');
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accountId = picked ?? bill?.account_id ?? banks[0]?.id ?? '';
  const pay = bill?.kind === 'pagar';
  const due = bill ? dueText(bill, today) : null;

  return (
    <Sheet visible={!!bill} onClose={onClose} title={pay ? 'Pagar conta' : 'Registrar recebimento'}>
      {bill ? (
        <>
          <Summary>
            <Txt style={{ fontFamily: fonts.bodySemi }}>{bill.description}</Txt>
            <Txt variant="small" color={due?.late ? 'bad' : 'ink2'}>{due?.text}</Txt>
            <View style={{ marginTop: 4 }}><Money cents={bill.amount_cents} size={20} tone={pay ? undefined : 'pos'} /></View>
          </Summary>
          {banks.length > 1 ? (
            <View style={{ gap: space.sm }}>
              <Txt variant="label" color="ink2">{pay ? 'Pagar com' : 'Entrou em'}</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {banks.map((a) => <Chip key={a.id} label={a.name} on={a.id === accountId} onPress={() => setPicked(a.id)} />)}
              </View>
            </View>
          ) : null}
          <Button
            title={pay ? 'Confirmar pagamento' : 'Confirmar recebimento'}
            loading={busy}
            onPress={async () => { setBusy(true); const ok = await onConfirm(accountId); setBusy(false); if (ok) { setPicked(null); onClose(); } }}
          />
        </>
      ) : null}
    </Sheet>
  );
}
