import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { backend } from '@/data';
import { BackLink, PasswordField } from '@/features/auth/parts';
import { env } from '@/lib/env';
import { useToast } from '@/providers/toast';
import { Button, Field, Screen, Txt } from '@/ui/kit';
import { fonts, space } from '@/ui/theme';



export default function SignIn() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState(env.mock ? 'demo@caixalivre.app' : '');
  const [password, setPassword] = useState(env.mock ? 'demo1234' : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) { setError('Informe o e-mail e a senha.'); return; }
    setBusy(true); setError(null);
    try { await backend.signIn(email, password); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
  };

  const forgot = async () => {
    if (!email.trim()) { setError('Digite o seu e-mail acima e toque em "Esqueci a senha" de novo.'); return; }
    try { await backend.resetPassword(email); toast('Se o e-mail existir, enviamos um link para redefinir a senha.'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível enviar agora.', 'error'); }
  };

  return (
    <Screen>
      <BackLink onPress={() => router.back()} />
      <Txt variant="title" style={{ marginTop: space.lg }}>Entrar</Txt>
      <Txt color="ink2" style={{ marginTop: 4 }}>Use o e-mail do seu cadastro.</Txt>

      <View style={{ marginTop: space.xl, gap: space.lg }}>
        <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
        <PasswordField value={password} onChangeText={setPassword} error={error} />
        <Button title="Entrar" onPress={submit} loading={busy} />
        <Pressable onPress={forgot} accessibilityRole="button" style={{ alignSelf: 'center', padding: space.sm }}>
          <Txt variant="small" color="accent" style={{ fontFamily: fonts.bodyMedium }}>Esqueci a senha</Txt>
        </Pressable>
        {env.mock ? <Txt variant="caption" color="ink3" style={{ textAlign: 'center' }}>Modo demonstração: demo@caixalivre.app / demo1234</Txt> : null}
      </View>
    </Screen>
  );
}
