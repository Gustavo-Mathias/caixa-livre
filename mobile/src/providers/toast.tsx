import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, radius, space, useTheme } from '@/ui/theme';

type Tone = 'info' | 'error';
const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(ToastContext);

/** Aviso curto no pé da tela. Alert.alert não funciona na web, então usamos o nosso. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: Tone; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, tone: Tone = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, tone, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), tone === 'error' ? 5000 : 3000);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: space.lg, right: space.lg, bottom: Math.max(insets.bottom, 12) + 84, alignItems: 'center' }}>
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{ backgroundColor: toast.tone === 'error' ? t.bad : t.ink, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.md, maxWidth: 440 }}
          >
            <Text style={{ color: toast.tone === 'error' ? '#fff' : t.bg, fontFamily: fonts.bodyMedium, fontSize: 14, textAlign: 'center' }}>{toast.message}</Text>
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}
