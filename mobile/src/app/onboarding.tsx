import { useState } from 'react';
import { View } from 'react-native';

import { backend } from '@/data';
import type { ProfileKind } from '@/domain/types';
import { KindPicker, ProfileFields, useProfileForm } from '@/features/auth/profile-form';
import { useSession } from '@/providers/session';
import { Button, Notice, Screen, Txt } from '@/ui/kit';
import { KindContext, space } from '@/ui/theme';

/** Login sem perfil ainda (por exemplo, conta criada fora do app): escolhe CPF ou CNPJ e segue. */
export default function Onboarding() {
  const { refreshProfiles, signOut } = useSession();
  const [kind, setKind] = useState<ProfileKind | null>(null);
  const form = useProfileForm(kind ?? 'pf');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!kind) return;
    const p = form.validate();
    if (!p) return;
    setBusy(true); setError(null);
    try { await backend.addProfile({ kind, ...p }); await refreshProfiles(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível criar o perfil.'); }
    finally { setBusy(false); }
  };

  return (
    <KindContext.Provider value={kind ?? 'pf'}>
      <Screen>
        <Txt variant="title" style={{ marginTop: space.xl }}>Falta pouco</Txt>
        <Txt color="ink2" style={{ marginTop: 4 }}>Escolha como você vai usar o Caixa Livre. Você pode adicionar o outro perfil depois.</Txt>
        <View style={{ marginTop: space.xl, gap: space.xl }}>
          <KindPicker value={kind} onChange={setKind} />
          {kind ? <ProfileFields kind={kind} form={form} /> : null}
          {error ? <Notice tone="bad">{error}</Notice> : null}
          <Button title="Continuar" onPress={submit} loading={busy} disabled={!kind} />
          <Button title="Sair" variant="secondary" onPress={signOut} />
        </View>
      </Screen>
    </KindContext.Provider>
  );
}
