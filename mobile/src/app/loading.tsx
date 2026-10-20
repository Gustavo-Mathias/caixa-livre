import { ActivityIndicator, View } from 'react-native';

import { useTheme } from '@/ui/theme';

/** Aparece por um instante, entre entrar e carregar os perfis. */
export default function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
      <ActivityIndicator color={t.accent} />
    </View>
  );
}
