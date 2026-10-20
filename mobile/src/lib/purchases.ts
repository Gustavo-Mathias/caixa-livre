/**
 * Assinaturas pela App Store e pelo Google Play, via RevenueCat.
 *
 * O app não decide quem tem acesso: ele compra, e o RevenueCat avisa o nosso servidor
 * (supabase/functions/revenuecat-webhook), que grava na tabela `subscriptions`.
 * Depois da compra o app só relê os perfis.
 */
import { Platform } from 'react-native';

import { PRODUCT_IDS } from '@/domain/access';
import type { PlanTier, ProfileKind } from '@/domain/types';
import { env } from './env';

type RC = {
  configure(o: { apiKey: string; appUserID?: string }): void;
  logIn(id: string): Promise<unknown>;
  getOfferings(): Promise<{ all: Record<string, { availablePackages: { product: { identifier: string; priceString: string } }[] }> }>;
  purchasePackage(p: unknown): Promise<unknown>;
  restorePurchases(): Promise<unknown>;
};

let sdk: RC | null = null;
let configuredFor: string | null = null;

function apiKey(): string {
  return Platform.OS === 'ios' ? env.revenueCatIos : Platform.OS === 'android' ? env.revenueCatAndroid : '';
}

/** Falso na web, no Expo Go e quando as chaves ainda não foram preenchidas. */
export function purchasesAvailable(): boolean {
  return Platform.OS !== 'web' && apiKey() !== '';
}

function load(): RC | null {
  if (!purchasesAvailable()) return null;
  if (!sdk) {
    try {
      // Carregado só quando precisa: o módulo nativo não existe na web nem no Expo Go.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      sdk = require('react-native-purchases').default as RC;
    } catch {
      return null;
    }
  }
  return sdk;
}

/** O identificador do cliente no RevenueCat é o id do login (não o do perfil). */
export async function configurePurchases(userId: string): Promise<void> {
  const P = load();
  if (!P || configuredFor === userId) return;
  if (configuredFor === null) P.configure({ apiKey: apiKey(), appUserID: userId });
  else await P.logIn(userId);
  configuredFor = userId;
}

export type PurchaseResult = 'ok' | 'cancelled' | 'unavailable';

async function findPackage(kind: ProfileKind, tier: PlanTier) {
  const P = load();
  if (!P) return null;
  const offerings = await P.getOfferings();
  const wanted = PRODUCT_IDS[kind][tier];
  const all = Object.values(offerings.all).flatMap((o) => o.availablePackages);
  // No Android o identificador vem como "produto:plano-base".
  return all.find((p) => p.product.identifier === wanted || p.product.identifier.startsWith(`${wanted}:`)) ?? null;
}

export async function purchase(kind: ProfileKind, tier: PlanTier): Promise<PurchaseResult> {
  const P = load();
  if (!P) return 'unavailable';
  const pkg = await findPackage(kind, tier);
  if (!pkg) return 'unavailable';
  try {
    await P.purchasePackage(pkg);
    return 'ok';
  } catch (e) {
    if ((e as { userCancelled?: boolean })?.userCancelled) return 'cancelled';
    throw e;
  }
}

export async function restorePurchases(): Promise<boolean> {
  const P = load();
  if (!P) return false;
  await P.restorePurchases();
  return true;
}

/** Preço de cada plano na moeda da loja do usuário. Vazio quando não dá para consultar. */
export async function storePrices(kind: ProfileKind): Promise<Partial<Record<PlanTier, string>>> {
  try {
    const out: Partial<Record<PlanTier, string>> = {};
    for (const tier of ['basic', 'ai'] as const) {
      const pkg = await findPackage(kind, tier);
      if (pkg) out[tier] = pkg.product.priceString;
    }
    return out;
  } catch {
    return {};
  }
}
