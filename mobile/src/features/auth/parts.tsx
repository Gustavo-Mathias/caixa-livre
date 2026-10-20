import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Field, Txt } from '@/ui/kit';
import { Icon } from '@/ui/icons';
import { fonts, space, useTheme } from '@/ui/theme';

export function BrandMark({ size = 56 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
      <Txt style={{ color: t.accentInk, fontFamily: fonts.displayBold, fontSize: size * 0.56, lineHeight: size * 0.7 }}>C</Txt>
    </View>
  );
}

export function BackLink({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: space.sm }}>
      <Icon name="back" size={20} color={t.ink2} />
      <Text style={{ color: t.ink2, fontFamily: fonts.bodyMedium, fontSize: 14 }}>Voltar</Text>
    </Pressable>
  );
}

export function PasswordField(props: { value: string; onChangeText: (v: string) => void; error?: string | null; label?: string; hint?: string }) {
  const t = useTheme();
  const [show, setShow] = useState(false);
  return (
    <Field
      label={props.label ?? 'Senha'}
      value={props.value}
      onChangeText={props.onChangeText}
      error={props.error}
      hint={props.hint}
      secureTextEntry={!show}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="password"
      textContentType="password"
      right={
        <Pressable onPress={() => setShow((s) => !s)} accessibilityRole="button" accessibilityLabel={show ? 'Ocultar senha' : 'Mostrar senha'} hitSlop={10}>
          <Text style={{ color: t.accent, fontFamily: fonts.bodyMedium, fontSize: 13 }}>{show ? 'Ocultar' : 'Mostrar'}</Text>
        </Pressable>
      }
    />
  );
}
