import { Stack } from 'expo-router';

/** A rota "welcome" é a primeira tela de quem ainda não entrou. */
export const unstable_settings = { anchor: 'welcome' };

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
