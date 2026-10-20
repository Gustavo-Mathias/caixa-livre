import { useState } from 'react';
import { Pressable, View } from 'react-native';

import type { ProfileKind } from '@/domain/types';
import { checkDocument, maskDocument } from '@/lib/documents';
import { Field, Txt } from '@/ui/kit';
import { Icon } from '@/ui/icons';
import { radius, space, useTheme } from '@/ui/theme';

export const KIND_COPY = {
  pf: {
    title: 'Pessoa física',
    blurb: 'O seu dinheiro pessoal: orçamento, cartão e metas. Você se cadastra com o CPF.',
    nameLabel: 'Nome completo',
    docLabel: 'CPF',
    docPlaceholder: '000.000.000-00',
    icon: 'user',
  },
  pj: {
    title: 'Empresa',
    blurb: 'O caixa do seu negócio: contas a pagar e a receber, impostos e resultado. Você se cadastra com o CNPJ.',
    nameLabel: 'Nome da empresa',
    docLabel: 'CNPJ',
    docPlaceholder: '00.000.000/0000-00',
    icon: 'build',
  },
} as const;

export function useProfileForm(kind: ProfileKind) {
  const [name, setName] = useState('');
  const [doc, setDoc] = useState('');
  const [errors, setErrors] = useState<{ name?: string; doc?: string }>({});

  const validate = (): { displayName: string; document: string } | null => {
    const e: { name?: string; doc?: string } = {};
    if (name.trim().length < 2) e.name = 'Informe o nome.';
    const d = checkDocument(kind, doc);
    if (!d.ok) e.doc = d.message;
    setErrors(e);
    return e.name || e.doc || !d.ok ? null : { displayName: name.trim(), document: d.value };
  };

  return {
    name, doc, errors, validate,
    setName: (v: string) => { setName(v); if (errors.name) setErrors((x) => ({ ...x, name: undefined })); },
    setDoc: (v: string) => { setDoc(maskDocument(kind, v)); if (errors.doc) setErrors((x) => ({ ...x, doc: undefined })); },
    reset: () => { setName(''); setDoc(''); setErrors({}); },
  };
}

export function ProfileFields({ kind, form }: { kind: ProfileKind; form: ReturnType<typeof useProfileForm> }) {
  const c = KIND_COPY[kind];
  return (
    <View style={{ gap: space.lg }}>
      <Field label={c.nameLabel} value={form.name} onChangeText={form.setName} error={form.errors.name} autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="next" />
      <Field
        label={c.docLabel}
        value={form.doc}
        onChangeText={form.setDoc}
        error={form.errors.doc}
        placeholder={c.docPlaceholder}
        keyboardType={kind === 'pf' ? 'number-pad' : 'default'}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={18}
        hint={kind === 'pj' ? 'Aceita CNPJ com letras, no novo formato.' : undefined}
      />
    </View>
  );
}

/** Escolha entre pessoa física e empresa. */
export function KindPicker({ value, onChange, only }: { value: ProfileKind | null; onChange: (k: ProfileKind) => void; only?: ProfileKind[] }) {
  const t = useTheme();
  const kinds = (only ?? ['pf', 'pj']) as ProfileKind[];
  return (
    <View style={{ gap: space.md }}>
      {kinds.map((k) => {
        const c = KIND_COPY[k];
        const on = value === k;
        const accent = k === 'pf' ? (t.scheme === 'dark' ? '#8EA2FF' : '#2A4BDB') : t.scheme === 'dark' ? '#B8A5FF' : '#6A3FD1';
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={{ flexDirection: 'row', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: on ? 2 : 1, borderColor: on ? accent : t.line2, backgroundColor: t.surface }}
          >
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: on ? accent : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={c.icon} size={22} color={on ? (t.scheme === 'dark' ? '#0A1224' : '#fff') : t.ink2} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="heading">{c.title}</Txt>
              <Txt variant="small" color="ink2">{c.blurb}</Txt>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
