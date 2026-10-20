import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import type { ProfileKind } from '@/domain/types';

/** Azul para a pessoa física, violeta para a empresa: dá para saber em qual perfil você está só pela cor. */
const accents = {
  pf: { light: { accent: '#2A4BDB', accentInk: '#FFFFFF', accentSoft: '#E5EAFF' }, dark: { accent: '#8EA2FF', accentInk: '#0A1224', accentSoft: '#1C2A58' } },
  pj: { light: { accent: '#6A3FD1', accentInk: '#FFFFFF', accentSoft: '#EEE8FB' }, dark: { accent: '#B8A5FF', accentInk: '#0A1224', accentSoft: '#2B2152' } },
} as const;

const base = {
  light: {
    bg: '#F2F4F8', surface: '#FFFFFF', surface2: '#E9EDF5', ink: '#0E1B33', ink2: '#4F5C77', ink3: '#66738E',
    line: '#DDE3EE', line2: '#C3CCDD', ok: '#0F7B5A', okSoft: '#DCF2E9', warn: '#9A5B06', warnSoft: '#FCEED0',
    bad: '#C2382F', badSoft: '#FBE3E0', scrim: 'rgba(7,13,27,0.55)',
  },
  dark: {
    bg: '#0A1224', surface: '#111C33', surface2: '#18274A', ink: '#E8EDF8', ink2: '#A6B2CA', ink3: '#8190AB',
    line: '#22314F', line2: '#344870', ok: '#4CD6A0', okSoft: '#10352B', warn: '#F2B24C', warnSoft: '#3A2C10',
    bad: '#FF8F84', badSoft: '#40201F', scrim: 'rgba(0,0,0,0.65)',
  },
} as const;

export type Theme = { [K in keyof typeof base.light | 'accent' | 'accentInk' | 'accentSoft']: string } & { scheme: 'light' | 'dark'; kind: ProfileKind };
export type ColorName = keyof typeof base.light | 'accent' | 'accentInk' | 'accentSoft';

export const KindContext = createContext<ProfileKind>('pf');

export function useTheme(): Theme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const kind = useContext(KindContext);
  return useMemo(() => ({ ...base[scheme], ...accents[kind][scheme], scheme, kind }) as Theme, [scheme, kind]);
}

export const fonts = {
  display: 'BricolageGrotesque_600SemiBold',
  displayBold: 'BricolageGrotesque_700Bold',
  body: 'HankenGrotesk_400Regular',
  bodyMedium: 'HankenGrotesk_500Medium',
  bodySemi: 'HankenGrotesk_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
