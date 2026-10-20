import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isConfigured } from '@/lib/env';
import { configurePurchases } from '@/lib/purchases';
import { SessionProvider, useSession } from '@/providers/session';
import { ToastProvider } from '@/providers/toast';
import { Screen, Txt } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { booting, profilesLoading, user, profiles } = useSession();
  const t = useTheme();

  useEffect(() => { if (!booting) SplashScreen.hideAsync(); }, [booting]);
  useEffect(() => { if (user) configurePurchases(user.id).catch(() => {}); }, [user]);

  // Só a abertura do app segura a tela de splash. Trocar de tela de login para o app não pode
  // desmontar a navegação, senão ela volta para a rota antiga.
  if (booting) return null;
  const signedIn = !!user;
  const ready = signedIn && !profilesLoading;

  return (
    <>
      <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && profilesLoading}>
          <Stack.Screen name="loading" />
        </Stack.Protected>
        <Stack.Protected guard={ready && profiles.length === 0}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={ready && profiles.length > 0} redirectTo={!signedIn ? '/welcome' : profilesLoading ? '/loading' : '/onboarding'}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="new-transaction" options={{ presentation: 'modal' }} />
          <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
          <Stack.Screen name="add-profile" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="accounts" options={{ presentation: 'modal' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

function MissingConfig() {
  return (
    <Screen>
      <Txt variant="title" style={{ marginTop: 48 }}>Configuração incompleta</Txt>
      <Txt color="ink2" style={{ marginTop: 12 }}>
        Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (arquivo .env) e reinicie o app.
        Para ver o app com dados de demonstração, use EXPO_PUBLIC_MOCK=1.
      </Txt>
    </Screen>
  );
}

export default function RootLayout() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } }));
  const [fontsReady] = useFonts({
    BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold,
    HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold,
    IBMPlexMono_400Regular, IBMPlexMono_500Medium,
  });

  useEffect(() => { if (fontsReady && !isConfigured) SplashScreen.hideAsync(); }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <QueryClientProvider client={client}>
      <SafeAreaProvider>
        {isConfigured ? (
          <SessionProvider>
            <ToastProvider>
              <Navigator />
            </ToastProvider>
          </SessionProvider>
        ) : (
          <MissingConfig />
        )}
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
