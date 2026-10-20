/**
 * Regras puras do aviso (webhook) do RevenueCat. Sem Deno, sem rede: dá para testar com `node --test`.
 *
 * O app compra pela loja, o RevenueCat avisa aqui, e só então o plano do perfil muda.
 * O identificador do cliente no RevenueCat (app_user_id) é o id do login; o perfil sai do produto:
 *   pf_basic_monthly, pf_ai_monthly  -> perfil pessoa física
 *   pj_basic_monthly, pj_ai_monthly  -> perfil empresa
 */

export type RcEvent = {
  type: string;
  app_user_id?: string;
  product_id?: string;
  new_product_id?: string;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
  store?: string;
  environment?: string;
};

export type SubscriptionPatch = {
  kind: 'pf' | 'pj';
  tier: 'basic' | 'ai';
  status: 'active' | 'canceled' | 'grace' | 'expired';
  current_period_end: string | null;
  store: 'app_store' | 'play_store' | 'promotional' | null;
  product_id: string;
  last_event_ms: number;
};

/** "pj_ai_monthly" ou, no Android, "pj_ai_monthly:plano-base". */
export function planFromProduct(productId: string | undefined): { kind: 'pf' | 'pj'; tier: 'basic' | 'ai' } | null {
  const m = /^(pf|pj)_(basic|ai)_/.exec((productId ?? '').split(':')[0]);
  return m ? { kind: m[1] as 'pf' | 'pj', tier: m[2] as 'basic' | 'ai' } : null;
}

const STATUS: Record<string, SubscriptionPatch['status']> = {
  INITIAL_PURCHASE: 'active',
  RENEWAL: 'active',
  UNCANCELLATION: 'active',
  PRODUCT_CHANGE: 'active',
  NON_RENEWING_PURCHASE: 'active',
  CANCELLATION: 'canceled',
  BILLING_ISSUE: 'grace',
  EXPIRATION: 'expired',
};

const STORES: Record<string, SubscriptionPatch['store']> = {
  APP_STORE: 'app_store',
  MAC_APP_STORE: 'app_store',
  PLAY_STORE: 'play_store',
  PROMOTIONAL: 'promotional',
};

/** Devolve o que gravar em `subscriptions`, ou null quando o evento não muda o plano. */
export function patchFor(e: RcEvent): SubscriptionPatch | null {
  const productId = e.type === 'PRODUCT_CHANGE' ? e.new_product_id ?? e.product_id : e.product_id;
  const plan = planFromProduct(productId);
  if (!plan || !productId) return null;

  // SUBSCRIPTION_PAUSED, TRANSFER, TEST e eventos novos não mudam o acesso.
  const status = STATUS[e.type];
  if (!status) return null;

  return {
    ...plan,
    status,
    current_period_end: e.expiration_at_ms ? new Date(e.expiration_at_ms).toISOString() : null,
    store: STORES[e.store ?? ''] ?? null,
    product_id: productId,
    last_event_ms: e.event_timestamp_ms ?? Date.now(),
  };
}

/** Comparação em tempo constante do segredo configurado no painel do RevenueCat. */
export function validSecret(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const given = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}
