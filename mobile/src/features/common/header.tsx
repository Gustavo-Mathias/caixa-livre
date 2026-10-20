import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { planSummary } from '@/domain/access';
import { KIND_COPY } from '@/features/auth/profile-form';
import { formatDocument } from '@/lib/documents';
import { useSession } from '@/providers/session';
import { Icon } from '@/ui/icons';
import { IconBubble, Sheet, Txt, usePrivacy } from '@/ui/kit';
import { fonts, radius, space, useTheme } from '@/ui/theme';

/** Saudação, troca de perfil, ocultar valores e configurações. */
export function AppHeader() {
  const { profile, profiles, setActiveProfile } = useSession();
  const { hidden, toggle } = usePrivacy();
  const router = useRouter();
  const t = useTheme();
  const [open, setOpen] = useState(false);
  if (!profile) return null;

  const first = profile.display_name.split(' ')[0];
  const otherKind = profiles.length < 2 ? (profiles.some((p) => p.kind === 'pf') ? 'pj' : 'pf') : null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg, gap: space.md }}>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Perfil ativo: ${profile.display_name}. Trocar de perfil`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1, minWidth: 0 }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Txt style={{ color: t.accent, fontFamily: fonts.display, fontSize: 18 }}>{first.charAt(0).toUpperCase()}</Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="heading" numberOfLines={1}>Olá, {first}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Txt variant="small" color="ink2">{KIND_COPY[profile.kind].title}</Txt>
            {profiles.length > 1 || otherKind ? <Icon name="chev" size={12} color={t.ink3} /> : null}
          </View>
        </View>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <RoundButton icon={hidden ? 'eyeoff' : 'eye'} label={hidden ? 'Mostrar valores' : 'Ocultar valores'} onPress={toggle} />
        <RoundButton icon="user" label="Configurações" onPress={() => router.push('/settings')} />
      </View>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Seus perfis">
        {profiles.map((p) => (
          <Pressable key={p.id} onPress={() => { setActiveProfile(p.id); setOpen(false); }} accessibilityRole="button" accessibilityState={{ selected: p.id === profile.id }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: p.id === profile.id ? 2 : 1, borderColor: p.id === profile.id ? t.accent : t.line2 }}>
            <IconBubble name={KIND_COPY[p.kind].icon} tone="accent" />
            <View style={{ flex: 1 }}>
              <Txt style={{ fontFamily: fonts.bodySemi }} numberOfLines={1}>{p.display_name}</Txt>
              <Txt variant="small" color="ink2">{KIND_COPY[p.kind].docLabel} {formatDocument(p.kind, p.document)}</Txt>
              <Txt variant="caption" color="ink3">{planSummary(p.subscription)}</Txt>
            </View>
            {p.id === profile.id ? <Icon name="check" size={20} color={t.accent} /> : null}
          </Pressable>
        ))}
        {otherKind ? (
          <Pressable onPress={() => { setOpen(false); router.push('/add-profile'); }} accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: t.line2 }}>
            <IconBubble name="plus" />
            <View style={{ flex: 1 }}>
              <Txt style={{ fontFamily: fonts.bodySemi }}>{otherKind === 'pj' ? 'Adicionar uma empresa' : 'Adicionar pessoa física'}</Txt>
              <Txt variant="small" color="ink2">Mesmo login, plano próprio.</Txt>
            </View>
          </Pressable>
        ) : null}
      </Sheet>
    </View>
  );
}

function RoundButton({ icon, label, onPress }: { icon: 'eye' | 'eyeoff' | 'user'; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: t.line2, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={20} color={t.ink2} />
    </Pressable>
  );
}
