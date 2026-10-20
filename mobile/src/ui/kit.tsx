import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatBRL } from '@/lib/money';
import { Icon, type IconName } from './icons';
import { fonts, radius, space, useTheme, type ColorName } from './theme';

/* ---------- valores ocultos ---------- */

export const PrivacyContext = createContext<{ hidden: boolean; toggle: () => void }>({ hidden: false, toggle: () => {} });
export const usePrivacy = () => useContext(PrivacyContext);

/* ---------- texto ---------- */

type Variant = 'display' | 'title' | 'heading' | 'body' | 'small' | 'caption' | 'label';

const variants: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.displayBold, fontSize: 34, lineHeight: 38, letterSpacing: -0.8 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
};

export function Txt({ variant = 'body', color = 'ink', mono, style, ...rest }: TextProps & { variant?: Variant; color?: ColorName; mono?: boolean }) {
  const t = useTheme();
  return <Text {...rest} style={[variants[variant], mono && { fontFamily: fonts.mono }, { color: t[color] }, style]} />;
}

export function Money({ cents, tone, size = 14, sign, style, bold }: { cents: number; tone?: 'pos' | 'neg' | 'muted' | 'onAccent'; size?: number; sign?: boolean; bold?: boolean; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  const { hidden } = usePrivacy();
  const color = tone === 'pos' ? t.ok : tone === 'neg' ? t.bad : tone === 'muted' ? t.ink2 : tone === 'onAccent' ? t.accentInk : t.ink;
  return (
    <Text style={[{ fontFamily: bold ? fonts.monoMedium : fonts.mono, fontSize: size, color }, style]}>
      {hidden ? 'R$ ••••' : formatBRL(cents, { sign })}
    </Text>
  );
}

/* ---------- estrutura ---------- */

export function Screen({ children, scroll = true, padded = true, bottomInset = 24 }: { children: ReactNode; scroll?: boolean; padded?: boolean; bottomInset?: number }) {
  const t = useTheme();
  const inner = padded ? { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: bottomInset } : undefined;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: t.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={inner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style, pad = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: boolean }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.surface, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.lg, paddingHorizontal: pad ? space.lg : 0, paddingVertical: pad ? space.md : 0 }, style]}>
      {children}
    </View>
  );
}

/** Lista de linhas separadas por fio dentro de um cartão. */
export function Rows({ children }: { children: ReactNode[] | ReactNode }) {
  const t = useTheme();
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <Card style={{ paddingVertical: 2 }}>
      {items.map((c, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: t.line } : undefined}>{c}</View>
      ))}
    </Card>
  );
}

export function Section({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.sm }}>
      <Txt variant="heading" accessibilityRole="header">{title}</Txt>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button"><Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: t.accent }}>{action}</Text></Pressable>
      ) : null}
    </View>
  );
}

export function IconBubble({ name, tone = 'neutral', size = 40 }: { name: IconName | string; tone?: 'neutral' | 'ok' | 'warn' | 'accent'; size?: number }) {
  const t = useTheme();
  const bg = tone === 'ok' ? t.okSoft : tone === 'warn' ? t.warnSoft : tone === 'accent' ? t.accentSoft : t.surface2;
  const fg = tone === 'ok' ? t.ok : tone === 'warn' ? t.warn : tone === 'accent' ? t.accent : t.ink2;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={size * 0.46} color={fg} />
    </View>
  );
}

export function Row({ icon, tone, title, subtitle, subtitleTone, right, onPress, last }: {
  icon?: IconName | string; tone?: 'neutral' | 'ok' | 'warn' | 'accent'; title: string; subtitle?: string; subtitleTone?: 'bad'; right?: ReactNode; onPress?: () => void; last?: boolean;
}) {
  const t = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
      {icon ? <IconBubble name={icon} tone={tone} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt style={{ fontFamily: fonts.bodyMedium }} numberOfLines={1}>{title}</Txt>
        {subtitle ? <Txt variant="small" color={subtitleTone === 'bad' ? 'bad' : 'ink2'} numberOfLines={1} style={subtitleTone === 'bad' ? { fontFamily: fonts.bodyMedium } : undefined}>{subtitle}</Txt> : null}
      </View>
      {right ? <View style={{ alignItems: 'flex-end', gap: 4 }}>{right}</View> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { backgroundColor: t.surface2 }}>{body}</Pressable> : body;
}

export function Pill({ label, tone = 'accent' }: { label: string; tone?: 'ok' | 'warn' | 'bad' | 'accent' | 'neutral' }) {
  const t = useTheme();
  const map = { ok: [t.okSoft, t.ok], warn: [t.warnSoft, t.warn], bad: [t.badSoft, t.bad], accent: [t.accentSoft, t.accent], neutral: [t.surface2, t.ink2] } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontFamily: fonts.bodyMedium, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export function Bar({ value, tone = 'accent', label }: { value: number; tone?: 'accent' | 'ok' | 'warn' | 'bad'; label?: string }) {
  const t = useTheme();
  const color = tone === 'ok' ? t.ok : tone === 'warn' ? t.warn : tone === 'bad' ? t.bad : t.accent;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(1, Math.max(0, value)) * 100) }} style={{ height: 8, borderRadius: 99, backgroundColor: t.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%`, height: '100%', borderRadius: 99, backgroundColor: color }} />
    </View>
  );
}

/* ---------- controles ---------- */

export function Button({ title, onPress, variant = 'primary', size = 'md', loading, disabled, icon, style }: {
  title: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'danger'; size?: 'md' | 'sm'; loading?: boolean; disabled?: boolean; icon?: IconName; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const primary = variant === 'primary';
  const bg = primary ? t.accent : t.surface;
  const fg = primary ? t.accentInk : variant === 'danger' ? t.bad : t.ink;
  const border = primary ? t.accent : variant === 'danger' ? t.bad : t.line2;
  const off = disabled || loading;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        { backgroundColor: bg, borderColor: border, borderWidth: 1, borderRadius: size === 'sm' ? radius.sm : radius.md, minHeight: size === 'sm' ? 36 : 50, paddingHorizontal: size === 'sm' ? 12 : 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 18} color={fg} /> : null}
      {loading ? null : <Text style={{ color: fg, fontFamily: fonts.bodySemi, fontSize: size === 'sm' ? 13 : 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, hint, right, style, ...input }: TextInputProps & { label: string; error?: string | null; hint?: string; right?: ReactNode }) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Txt variant="label" color="ink2">{label}</Txt> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderRadius: radius.md, borderWidth: focus ? 2 : 1, borderColor: error ? t.bad : focus ? t.accent : t.line2, paddingHorizontal: 14 }}>
        <TextInput
          {...input}
          accessibilityLabel={input.accessibilityLabel ?? label}
          placeholderTextColor={t.ink3}
          onFocus={(e) => { setFocus(true); input.onFocus?.(e); }}
          onBlur={(e) => { setFocus(false); input.onBlur?.(e); }}
          style={[{ flex: 1, minHeight: 50, color: t.ink, fontFamily: fonts.body, fontSize: 16 }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
        />
        {right}
      </View>
      {error ? <Txt variant="small" color="bad">{error}</Txt> : hint ? <Txt variant="small" color="ink3">{hint}</Txt> : null}
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: t.surface2, borderRadius: radius.md, padding: 3, gap: 2 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 4, borderRadius: radius.sm, backgroundColor: on ? t.surface : 'transparent' }}>
            <Text numberOfLines={1} style={{ fontFamily: fonts.bodyMedium, fontSize: 13.5, color: on ? t.ink : t.ink2 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? t.ink : t.line2, backgroundColor: on ? t.ink : t.surface }}>
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: on ? t.bg : t.ink2 }}>{label}</Text>
    </Pressable>
  );
}

export function Notice({ tone = 'warn', title, children }: { tone?: 'warn' | 'bad' | 'accent'; title?: string; children?: ReactNode }) {
  const t = useTheme();
  const bg = tone === 'bad' ? t.badSoft : tone === 'accent' ? t.accentSoft : t.warnSoft;
  const fg = tone === 'bad' ? t.bad : tone === 'accent' ? t.accent : t.warn;
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.md, padding: space.md, gap: 4 }}>
      {title ? <Text style={{ color: fg, fontFamily: fonts.bodySemi, fontSize: 14 }}>{title}</Text> : null}
      {typeof children === 'string' ? <Txt variant="small" style={{ color: t.ink }}>{children}</Txt> : children}
    </View>
  );
}

/** Folha que sobe de baixo. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable accessibilityLabel="Fechar" onPress={onClose} style={{ flex: 1, backgroundColor: t.scrim }} />
        <View style={{ backgroundColor: t.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.lg) + space.sm, maxHeight: '92%' }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 4, backgroundColor: t.line2, marginBottom: space.md }} />
          {title ? <Txt variant="title" style={{ marginBottom: space.md }}>{title}</Txt> : null}
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ gap: space.md, paddingBottom: space.sm }}>{children}</View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <View style={{ padding: space.xl, alignItems: 'center' }}><Txt color="ink2" style={{ textAlign: 'center' }}>{children}</Txt></View>;
}

export function Summary({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={{ backgroundColor: t.surface2, borderRadius: radius.md, padding: space.md, gap: 2 }}>{children}</View>;
}

export function KV({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, gap: space.md }}>
      <Txt variant="small" color={strong ? 'ink' : 'ink2'} style={strong ? { fontFamily: fonts.bodySemi } : undefined}>{label}</Txt>
      {typeof children === 'string' ? <Txt variant="small" style={strong ? { fontFamily: fonts.bodySemi } : undefined}>{children}</Txt> : children}
    </View>
  );
}
