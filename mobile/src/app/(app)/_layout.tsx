import { useRouter } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabListProps, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, Text, View, type PressableProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/providers/session';
import { Icon, type IconName } from '@/ui/icons';
import { fonts, useTheme } from '@/ui/theme';

function TabButton({ children, isFocused, icon, ...props }: TabTriggerSlotProps & { icon: IconName }) {
  const t = useTheme();
  const color = isFocused ? t.accent : t.ink3;
  return (
    <Pressable {...(props as unknown as PressableProps)} accessibilityRole="tab" accessibilityState={{ selected: !!isFocused }} style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 7 }}>
      <Icon name={icon} size={22} color={color} />
      <Text style={{ color, fontFamily: fonts.bodyMedium, fontSize: 11 }}>{children}</Text>
    </Pressable>
  );
}

function Bar(props: TabListProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View {...props} style={{ flexDirection: 'row', alignItems: 'flex-end', backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.line, paddingHorizontal: 8, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8) }}>
      {props.children}
    </View>
  );
}

export default function AppLayout() {
  const { profile } = useSession();
  const router = useRouter();
  const t = useTheme();

  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <Bar>
          <TabTrigger name="index" href="/" asChild><TabButton icon="home">Início</TabButton></TabTrigger>
          <TabTrigger name="transactions" href="/transactions" asChild><TabButton icon="list">Lançamentos</TabButton></TabTrigger>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Pressable onPress={() => router.push('/new-transaction')} accessibilityRole="button" accessibilityLabel="Novo lançamento"
              style={{ width: 54, height: 54, borderRadius: 27, marginTop: -26, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#0E1B33', shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
              <Icon name="plus" size={26} color={t.accentInk} strokeWidth={2.2} />
            </Pressable>
          </View>
          <TabTrigger name="plan" href="/plan" asChild><TabButton icon="target">{profile?.kind === 'pj' ? 'Gestão' : 'Planejar'}</TabButton></TabTrigger>
          <TabTrigger name="assistant" href="/assistant" asChild><TabButton icon="spark">Assistente</TabButton></TabTrigger>
        </Bar>
      </TabList>
    </Tabs>
  );
}
