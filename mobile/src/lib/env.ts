/**
 * Configuração por variáveis EXPO_PUBLIC_* (ficam embutidas no app, então nada aqui é segredo).
 * O acesso precisa ser literal (process.env.EXPO_PUBLIC_X) para o Expo substituir na compilação.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  /** Dados de demonstração em memória. Só para desenvolvimento: precisa ser pedido explicitamente. */
  mock: process.env.EXPO_PUBLIC_MOCK === '1',
  /** Liga o plano com assistente de IA. Fica desligado até o assistente existir de verdade. */
  aiEnabled: process.env.EXPO_PUBLIC_AI_ENABLED === '1',
  revenueCatIos: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
  revenueCatAndroid: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
  privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? '',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? '',
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '',
};

export const isConfigured = env.mock || (env.supabaseUrl !== '' && env.supabaseKey !== '');
