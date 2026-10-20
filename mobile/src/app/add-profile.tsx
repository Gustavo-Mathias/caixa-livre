import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { backend } from '@/data';
import { KIND_COPY, ProfileFields, useProfileForm } from '@/features/auth/profile-form';
import { ModalHeader } from '@/features/common/modal';
import { useSession } from '@/providers/session';
import { Button, Notice, Screen, Txt } from '@/ui/kit';
import { KindContext, space } from '@/ui/theme';

/** Cadastra o outro perfil do mesmo login. O novo perfil não tem teste grátis: precisa de plano. */
export default function AddProfile() {
  const router = useRouter();
  const { profiles, refreshProfiles, setActiveProfile } = useSession();
  const kind = profiles.some((p) => p.kind === 'pf') ? 'pj' : 'pf';
  const form = useProfileForm(kind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (profiles.length >= 2) {
    return (
      <Screen>
        <ModalHeader title="Seus perfis" />
        <Txt color="ink2">Este login já tem um perfil de pessoa física e um de empresa.</Txt>
      </Screen>
    );
  }

  const submit = async () => {
    const p = form.validate();
    if (!p) return;
    setBusy(true); setError(null);
    try {
      await backend.addProfile({ kind, ...p });
      await refreshProfiles();
      const created = (await backend.listProfiles()).find((x) => x.kind === kind);
      if (created) setActiveProfile(created.id);
      router.replace('/paywall');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar o perfil.');
    } finally { setBusy(false); }
  };

  return (
    <KindContext.Provider value={kind}>
      <Screen>
        <ModalHeader title={kind === 'pj' ? 'Adicionar uma empresa' : 'Adicionar pessoa física'} subtitle={KIND_COPY[kind].blurb} />
        <View style={{ gap: space.lg }}>
          <Notice tone="accent" title="Plano próprio">Cada perfil tem o seu plano. Depois de cadastrar, você escolhe o plano deste perfil.</Notice>
          <ProfileFields kind={kind} form={form} />
          {error ? <Notice tone="bad">{error}</Notice> : null}
          <Button title="Cadastrar e escolher o plano" onPress={submit} loading={busy} />
        </View>
      </Screen>
    </KindContext.Provider>
  );
}
