import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { backend } from '@/data';
import type { ProfileKind } from '@/domain/types';
import { BackLink, PasswordField } from '@/features/auth/parts';
import { KIND_COPY, KindPicker, ProfileFields, useProfileForm } from '@/features/auth/profile-form';
import { env } from '@/lib/env';
import { Button, Field, Notice, Screen, Txt } from '@/ui/kit';
import { Icon } from '@/ui/icons';
import { KindContext, fonts, space, useTheme } from '@/ui/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function Terms({ accepted, onToggle, error }: { accepted: boolean; onToggle: () => void; error?: boolean }) {
  const t = useTheme();
  const open = (url: string) => { if (url) Linking.openURL(url).catch(() => {}); };
  return (
    <View style={{ gap: 6 }}>
      <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
        <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: error ? t.bad : accepted ? t.accent : t.line2, backgroundColor: accepted ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
          {accepted ? <Icon name="check" size={16} color={t.accentInk} strokeWidth={2.4} /> : null}
        </View>
        <Text style={{ flex: 1, color: t.ink2, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }}>
          Li e aceito os{' '}
          <Text style={{ color: t.accent, fontFamily: fonts.bodyMedium }} onPress={() => open(env.termsUrl)}>Termos de Uso</Text>
          {' '}e a{' '}
          <Text style={{ color: t.accent, fontFamily: fonts.bodyMedium }} onPress={() => open(env.privacyUrl)}>Política de Privacidade</Text>.
        </Text>
      </Pressable>
      {error ? <Txt variant="small" color="bad">Aceite os termos para criar a conta.</Txt> : null}
    </View>
  );
}

export default function SignUp() {
  const router = useRouter();
  const [kind, setKind] = useState<ProfileKind | null>(null);
  const [step, setStep] = useState<'kind' | 'form' | 'confirm'>('kind');
  const form = useProfileForm(kind ?? 'pf');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; terms?: boolean; server?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!kind) return;
    const p = form.validate();
    const e: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) e.email = 'Informe um e-mail válido.';
    if (password.length < 8) e.password = 'A senha precisa ter pelo menos 8 caracteres.';
    if (!accepted) e.terms = true;
    setErrors(e);
    if (!p || e.email || e.password || e.terms) return;
    setBusy(true);
    try {
      const r = await backend.signUp({ email, password, kind, document: p.document, displayName: p.displayName });
      if (r.needsConfirmation) setStep('confirm');
      // Sem confirmação por e-mail a sessão já abriu, e a navegação segue sozinha.
    } catch (err) {
      setErrors({ server: err instanceof Error ? err.message : 'Não foi possível criar a conta.' });
    } finally { setBusy(false); }
  };

  // A cor muda conforme o tipo escolhido: azul na pessoa física, violeta na empresa.
  return (
    <KindContext.Provider value={kind ?? 'pf'}>
      <Screen>
        <BackLink onPress={() => (step === 'form' ? setStep('kind') : router.back())} />

        {step === 'kind' ? (
          <>
            <Txt variant="title" style={{ marginTop: space.lg }}>Que tipo de conta?</Txt>
            <Txt color="ink2" style={{ marginTop: 4 }}>Cada tipo tem a sua tela. Depois você pode adicionar o outro com o mesmo login.</Txt>
            <View style={{ marginTop: space.xl }}><KindPicker value={kind} onChange={setKind} /></View>
            <Button title="Continuar" disabled={!kind} onPress={() => setStep('form')} style={{ marginTop: space.xl }} />
          </>
        ) : null}

        {step === 'form' && kind ? (
          <>
            <Txt variant="title" style={{ marginTop: space.lg }}>{KIND_COPY[kind].title}</Txt>
            <Txt color="ink2" style={{ marginTop: 4 }}>Crie o seu acesso. Os primeiros dias são grátis.</Txt>
            <View style={{ marginTop: space.xl, gap: space.lg }}>
              <ProfileFields kind={kind} form={form} />
              <Field label="E-mail" value={email} onChangeText={(v) => { setEmail(v); setErrors((x) => ({ ...x, email: undefined })); }} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
              <PasswordField value={password} onChangeText={(v) => { setPassword(v); setErrors((x) => ({ ...x, password: undefined })); }} error={errors.password} hint="Mínimo de 8 caracteres." label="Crie uma senha" />
              <Terms accepted={accepted} onToggle={() => { setAccepted((a) => !a); setErrors((x) => ({ ...x, terms: false })); }} error={errors.terms} />
              {errors.server ? <Notice tone="bad">{errors.server}</Notice> : null}
              <Button title="Criar conta" onPress={submit} loading={busy} />
            </View>
          </>
        ) : null}

        {step === 'confirm' ? (
          <View style={{ marginTop: space.xl, gap: space.lg }}>
            <Txt variant="title">Confirme o seu e-mail</Txt>
            <Txt color="ink2">Enviamos um link para {email.trim()}. Abra o e-mail, confirme e volte aqui para entrar.</Txt>
            <Button title="Ir para o login" onPress={() => router.replace('/sign-in')} />
          </View>
        ) : null}
      </Screen>
    </KindContext.Provider>
  );
}
