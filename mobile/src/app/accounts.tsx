import { useState } from 'react';
import { View } from 'react-native';

import { backend } from '@/data';
import { cardSummary } from '@/domain/finance';
import type { Account } from '@/domain/types';
import { ModalHeader } from '@/features/common/modal';
import { formatBRL, parseBRL, toInputBRL } from '@/lib/money';
import { useSession } from '@/providers/session';
import { useToast } from '@/providers/toast';
import { useWorkspace } from '@/providers/workspace';
import { Button, Card, Empty, Field, Money, Notice, Row, Rows, Screen, Segmented, Sheet, Txt } from '@/ui/kit';
import { space } from '@/ui/theme';

const KIND_LABEL = { bank: 'Conta', save: 'Reserva', card: 'Cartão de crédito' } as const;

/** Contas, reservas e cartões do perfil ativo. */
export default function Accounts() {
  const { profile } = useSession();
  const { ws, today, access, guard, refetch } = useWorkspace();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  // novo cadastro
  const [kind, setKind] = useState<'bank' | 'save' | 'card'>('bank');
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [balance, setBalance] = useState('');
  const [limit, setLimit] = useState('');
  const [closing, setClosing] = useState('');
  const [due, setDue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // ajuste do saldo inicial
  const [opening, setOpening] = useState('');

  const reset = () => { setName(''); setInstitution(''); setBalance(''); setLimit(''); setClosing(''); setDue(''); setError(null); setKind('bank'); };

  const hasTx = (a: Account) => ws.txs.some((t) => t.account_id === a.id || t.to_account_id === a.id);

  const create = async () => {
    if (!profile) return;
    const n = name.trim();
    if (n.length < 1) return setError('Dê um nome para a conta.');
    const day = (s: string) => { const v = Number(s); return Number.isInteger(v) && v >= 1 && v <= 31 ? v : null; };
    if (kind === 'card') {
      if (!(parseBRL(limit) ?? 0)) return setError('Informe o limite do cartão.');
      if (!day(closing) || !day(due)) return setError('Informe o dia de fechamento e o de vencimento (de 1 a 31).');
    }
    setBusy(true); setError(null);
    try {
      await backend.addAccount({
        profileId: profile.id, name: n, kind, institution,
        balanceCents: kind === 'card' ? 0 : parseBRL(balance) ?? 0,
        limitCents: parseBRL(limit) ?? 0, closingDay: day(closing) ?? undefined, dueDay: day(due) ?? undefined,
      });
      await refetch();
      toast('Conta criada.');
      setAdding(false); reset();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível criar a conta.'); }
    finally { setBusy(false); }
  };

  const saveOpening = async () => {
    if (!editing) return;
    setBusy(true);
    try { await backend.setOpeningBalance(editing.id, parseBRL(opening) ?? 0); await refetch(); toast('Saldo ajustado.'); setEditing(null); }
    catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível ajustar.', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <ModalHeader title="Contas e cartões" subtitle={profile?.display_name} />
      {ws.accounts.length === 0 ? <Card><Empty>Nenhuma conta cadastrada.</Empty></Card> : (
        <Rows>
          {ws.accounts.map((a) => {
            const s = a.kind === 'card' ? cardSummary(a, ws.txs, today) : null;
            return (
              <Row key={a.id} icon={a.kind === 'card' ? 'card' : a.kind === 'save' ? 'wallet' : 'bank'} title={a.name}
                subtitle={a.kind === 'card' && s ? `Limite ${formatBRL(s.limit)} · fecha dia ${a.closing_day}, vence dia ${a.due_day}` : `${KIND_LABEL[a.kind]}${a.institution ? ` · ${a.institution}` : ''}${a.kind !== 'card' && !hasTx(a) ? ' · toque para ajustar o saldo inicial' : ''}`}
                onPress={a.kind !== 'card' && !hasTx(a) ? () => guard(() => { setEditing(a); setOpening(toInputBRL(a.balance_cents)); }) : undefined}
                right={<Money cents={a.kind === 'card' && s ? s.debt : a.balance_cents} bold />} />
            );
          })}
        </Rows>
      )}
      <Txt variant="small" color="ink3" style={{ marginTop: space.sm }}>
        O saldo de uma conta muda só por lançamento. O saldo inicial pode ser ajustado enquanto a conta não tiver lançamentos.
      </Txt>
      <Button title="Adicionar conta, reserva ou cartão" onPress={() => guard(() => setAdding(true))} style={{ marginTop: space.lg }} />
      {!access ? <Notice tone="warn" title="Plano vencido">Assine para criar contas e fazer lançamentos.</Notice> : null}

      <Sheet visible={adding} onClose={() => { setAdding(false); reset(); }} title="Nova conta">
        <Segmented value={kind} onChange={setKind} options={[{ value: 'bank', label: 'Conta' }, { value: 'save', label: 'Reserva' }, { value: 'card', label: 'Cartão' }]} />
        <Field label="Nome" value={name} onChangeText={setName} placeholder={kind === 'card' ? 'Ex.: Cartão de crédito' : kind === 'save' ? 'Ex.: Reserva de emergência' : 'Ex.: Conta corrente'} />
        <Field label="Banco ou final do cartão (opcional)" value={institution} onChangeText={setInstitution} />
        {kind === 'card' ? (
          <>
            <Field label="Limite (R$)" value={limit} onChangeText={setLimit} keyboardType="decimal-pad" placeholder="0,00" />
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Field label="Dia que fecha" value={closing} onChangeText={(v) => setClosing(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" style={{ flex: 1 }} />
              <Field label="Dia que vence" value={due} onChangeText={(v) => setDue(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" style={{ flex: 1 }} />
            </View>
          </>
        ) : (
          <Field label="Saldo atual (R$)" value={balance} onChangeText={setBalance} keyboardType="decimal-pad" placeholder="0,00" />
        )}
        {error ? <Notice tone="bad">{error}</Notice> : null}
        <Button title="Criar" onPress={create} loading={busy} />
      </Sheet>

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing ? `Saldo inicial · ${editing.name}` : ''}>
        <Field label="Saldo atual (R$)" value={opening} onChangeText={setOpening} keyboardType="decimal-pad" placeholder="0,00" />
        <Txt variant="small" color="ink3">Depois do primeiro lançamento, o saldo passa a mudar só por lançamentos.</Txt>
        <Button title="Salvar saldo" onPress={saveOpening} loading={busy} />
      </Sheet>
    </Screen>
  );
}
