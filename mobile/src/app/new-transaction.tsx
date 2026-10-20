import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import type { TxType } from '@/domain/types';
import { ModalHeader } from '@/features/common/modal';
import { addDays, diffDays, toISO } from '@/lib/dates';
import { parseBRL } from '@/lib/money';
import { useWorkspace } from '@/providers/workspace';
import { Button, Chip, Field, Notice, Screen, Segmented, Txt } from '@/ui/kit';
import { fonts, space, useTheme } from '@/ui/theme';

/** "19/10/2026" -> "2026-10-19", ou null se não for uma data real. */
function parseBrDate(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (d.getFullYear() !== Number(m[3]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[1])) return null;
  return toISO(d);
}

const maskDate = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
};

export default function NewTransaction() {
  const router = useRouter();
  const t = useTheme();
  const { profile, ws, today, actions, guard } = useWorkspace();
  const isPj = profile?.kind === 'pj';

  const types: { value: TxType; label: string }[] = [
    { value: 'out', label: 'Despesa' }, { value: 'in', label: 'Receita' }, ...(isPj ? [] : [{ value: 'transfer' as const, label: 'Investimento' }]),
  ];
  const [type, setType] = useState<TxType>('out');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [who, setWho] = useState<'empresa' | 'pessoal'>('empresa');
  const [dateMode, setDateMode] = useState<'hoje' | 'ontem' | 'outra'>('hoje');
  const [dateText, setDateText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const personal = isPj && type === 'out' && who === 'pessoal';
  const categories = useMemo(() => ws.categories.filter((c) => c.kind === type && !c.hidden_in_form), [ws.categories, type]);
  const accounts = useMemo(() => ws.accounts.filter((a) => a.kind === 'bank' || (a.kind === 'card' && type === 'out')), [ws.accounts, type]);
  const savings = ws.accounts.find((a) => a.kind === 'save');
  const pickedCat = personal ? ws.categories.find((c) => c.key === 'pessoal') : ws.categories.find((c) => c.id === categoryId) ?? categories[0];
  const pickedAcc = accounts.find((a) => a.id === accountId) ?? accounts[0];

  const occurredOn = dateMode === 'hoje' ? today : dateMode === 'ontem' ? addDays(today, -1) : parseBrDate(dateText);

  const save = () => {
    const cents = parseBRL(amount);
    if (!cents || cents <= 0) return setError('Informe o valor.');
    if (!description.trim()) return setError('Descreva o lançamento.');
    if (!pickedCat || !pickedAcc) return setError('Escolha a categoria e a conta.');
    if (!occurredOn) return setError('Data inválida. Use dia/mês/ano, por exemplo 19/10/2026.');
    if (diffDays(occurredOn, today) > 0) return setError('A data não pode ser no futuro.');
    if (type === 'transfer' && !savings) return setError('Crie uma conta do tipo Reserva em Contas para receber os investimentos.');
    setError(null);
    guard(async () => {
      setBusy(true);
      const ok = await actions.addTransaction({
        type, amountCents: cents, description, categoryId: pickedCat.id, accountId: pickedAcc.id,
        toAccountId: type === 'transfer' ? savings?.id : null, occurredOn, tag: personal ? 'pessoal' : 'empresa',
      });
      setBusy(false);
      if (ok) router.back();
    });
  };

  return (
    <Screen>
      <ModalHeader title="Novo lançamento" />
      <Segmented value={type} onChange={(v) => { setType(v); setCategoryId(null); setAccountId(null); setError(null); }} options={types} />

      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, paddingVertical: space.lg }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 22, color: t.ink2 }}>R$</Text>
        <TextInput
          value={amount}
          onChangeText={(v) => { setAmount(v.replace(/[^\d.,]/g, '')); setError(null); }}
          placeholder="0,00"
          placeholderTextColor={t.ink3}
          keyboardType="decimal-pad"
          autoFocus
          accessibilityLabel="Valor"
          style={{ minWidth: 150, textAlign: 'center', fontFamily: fonts.displayBold, fontSize: 40, color: t.ink, borderBottomWidth: 2, borderBottomColor: t.line2, paddingVertical: 2 }}
        />
      </View>

      <View style={{ gap: space.lg }}>
        <Field label="Descrição" value={description} onChangeText={setDescription} placeholder={isPj ? 'Ex.: Assinatura de software' : 'Ex.: Almoço com a família'} autoCapitalize="sentences" />

        {isPj && type === 'out' ? (
          <View style={{ gap: 6 }}>
            <Txt variant="label" color="ink2">Quem usou?</Txt>
            <Segmented value={who} onChange={setWho} options={[{ value: 'empresa', label: 'Empresa' }, { value: 'pessoal', label: 'Uso pessoal do sócio' }]} />
            {personal ? <Txt variant="small" color="ink3">Fica marcado como gasto pessoal no CNPJ, para você reclassificar como retirada depois.</Txt> : null}
          </View>
        ) : null}

        {!personal ? (
          <View style={{ gap: 8 }}>
            <Txt variant="label" color="ink2">Categoria</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {categories.map((c) => <Chip key={c.id} label={c.name} on={pickedCat?.id === c.id} onPress={() => setCategoryId(c.id)} />)}
            </View>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Txt variant="label" color="ink2">{type === 'in' ? 'Entrou em' : 'Conta ou cartão'}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {accounts.map((a) => <Chip key={a.id} label={a.name} on={pickedAcc?.id === a.id} onPress={() => setAccountId(a.id)} />)}
          </View>
          {type === 'transfer' ? <Txt variant="small" color="ink3">{savings ? `O valor vai para ${savings.name}.` : 'Você ainda não tem uma conta de reserva.'}</Txt> : null}
        </View>

        <View style={{ gap: 8 }}>
          <Txt variant="label" color="ink2">Data</Txt>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Chip label="Hoje" on={dateMode === 'hoje'} onPress={() => setDateMode('hoje')} />
            <Chip label="Ontem" on={dateMode === 'ontem'} onPress={() => setDateMode('ontem')} />
            <Chip label="Outra data" on={dateMode === 'outra'} onPress={() => setDateMode('outra')} />
          </View>
          {dateMode === 'outra' ? <Field label="" accessibilityLabel="Data do lançamento" value={dateText} onChangeText={(v) => setDateText(maskDate(v))} placeholder="dd/mm/aaaa" keyboardType="number-pad" maxLength={10} /> : null}
        </View>

        {error ? <Notice tone="bad">{error}</Notice> : null}
        <Button title="Salvar lançamento" onPress={save} loading={busy} />
      </View>
    </Screen>
  );
}
