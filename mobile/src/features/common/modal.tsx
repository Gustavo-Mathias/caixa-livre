import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Icon } from '@/ui/icons';
import { Txt } from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';

export function ModalHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const router = useRouter();
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md, marginBottom: space.lg }}>
      <View style={{ flex: 1 }}>
        <Txt variant="title">{title}</Txt>
        {subtitle ? <Txt color="ink2" style={{ marginTop: 2 }}>{subtitle}</Txt> : null}
      </View>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="Fechar"
        style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: t.line2, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="x" size={20} color={t.ink2} />
      </Pressable>
    </View>
  );
}
