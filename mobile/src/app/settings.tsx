import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { backend } from '@/data';
import { planSummary } from '@/domain/access';
import { KIND_COPY } from '@/features/auth/profile-form';
import { ModalHeader } from '@/features/common/modal';
import { formatDocument } from '@/lib/documents';
import { env } from '@/lib/env';
import { useSession } from '@/providers/session';
import { useToast } from '@/providers/toast';
import { Button, Card, Field, Notice, Row, Rows, Screen, Section, Sheet, Txt } from '@/ui/kit';
import { space } from '@/ui/theme';

export default function Settings() {
  const router = useRouter();
  const toast = useToast();
  const { user, profiles, profile, setActiveProfile, signOut } = useSession();
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const open = (u: string) => { if (u) Linking.openURL(u).catch(() => {}); };

  const remove = async () => {
    setBusy(true);
    try { await backend.deleteAccount(); }
    catch (e) { toast(e instanceof Error ? e.message : 'Não foi possível excluir a conta.', 'error'); setBusy(false); }
  };

  return (
    <Screen>
      <ModalHeader title="Configurações" subtitle={user?.email} />

      <Section title="Perfis e planos" />
      <Rows>
        {profiles.map((p) => (
          <Row key={p.id} icon={KIND_COPY[p.kind].icon} tone={p.id === profile?.id ? 'accent' : 'neutral'} title={p.display_name}
            subtitle={`${KIND_COPY[p.kind].docLabel} ${formatDocument(p.kind, p.document)} · ${planSummary(p.subscription)}`}
            onPress={() => { setActiveProfile(p.id); router.push('/paywall'); }} />
        ))}
      </Rows>
      {profiles.length < 2 ? <Button title={profiles.some((p) => p.kind === 'pf') ? 'Adicionar uma empresa' : 'Adicionar pessoa física'} variant="secondary" onPress={() => router.push('/add-profile')} style={{ marginTop: space.md }} /> : null}

      <Section title="Contas e cartões" />
      <Rows><Row icon="bank" title="Gerenciar contas e cartões" subtitle="Saldo inicial, reservas e cartão de crédito" onPress={() => router.push('/accounts')} /></Rows>

      <Section title="Ajuda e privacidade" />
      <Rows>
        <Row icon="receipt" title="Termos de Uso" onPress={() => open(env.termsUrl)} />
        <Row icon="lock" title="Política de Privacidade" onPress={() => open(env.privacyUrl)} />
        <Row icon="user" title="Falar com o suporte" subtitle={env.supportEmail || undefined} onPress={() => open(env.supportEmail ? `mailto:${env.supportEmail}` : '')} />
      </Rows>

      <View style={{ marginTop: space.xl, gap: space.md }}>
        <Button title="Sair da conta" variant="secondary" icon="logout" onPress={signOut} />
        <Button title="Excluir minha conta e meus dados" variant="danger" onPress={() => setDeleting(true)} />
      </View>

      <Sheet visible={deleting} onClose={() => { setDeleting(false); setConfirmText(''); }} title="Excluir a conta">
        <Notice tone="bad" title="Isto não pode ser desfeito">
          Apagamos o seu login, os perfis (pessoa física e empresa) e todos os lançamentos, contas e metas. Assinaturas ativas não são canceladas por aqui: cancele também nos ajustes da App Store ou do Google Play.
        </Notice>
        <Field label='Digite EXCLUIR para confirmar' value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" autoCorrect={false} />
        <Button title="Excluir definitivamente" variant="danger" disabled={confirmText.trim().toUpperCase() !== 'EXCLUIR'} loading={busy} onPress={remove} />
        <Button title="Cancelar" variant="secondary" onPress={() => { setDeleting(false); setConfirmText(''); }} />
      </Sheet>
      <Card pad={false} style={{ marginTop: space.xl, borderWidth: 0, backgroundColor: 'transparent' }}>
        <Txt variant="caption" color="ink3" style={{ textAlign: 'center' }}>Caixa Livre</Txt>
      </Card>
    </Screen>
  );
}
