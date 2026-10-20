import type { PlanTier, ProfileKind, Subscription } from './types.ts';

/** Preços de tabela, em centavos. Os valores cobrados de verdade vêm da App Store e do Google Play. */
export const PLAN_PRICE_CENTS: Record<PlanTier, number> = { basic: 1990, ai: 2990 };

export const PLAN_NAME: Record<PlanTier, string> = { basic: 'Essencial', ai: 'Com assistente de IA' };

/** Produtos de assinatura. PF e PJ ficam em grupos separados para o mesmo Apple ID poder assinar os dois. */
export const PRODUCT_IDS: Record<ProfileKind, Record<PlanTier, string>> = {
  pf: { basic: 'pf_basic_monthly', ai: 'pf_ai_monthly' },
  pj: { basic: 'pj_basic_monthly', ai: 'pj_ai_monthly' },
};

export function hasAccess(sub: Subscription | null | undefined, now: Date = new Date()): boolean {
  if (!sub) return false;
  const t = now.getTime();
  if (sub.status === 'trial') return !!sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() > t;
  if (sub.status === 'active' || sub.status === 'grace' || sub.status === 'canceled') {
    return !!sub.current_period_end && new Date(sub.current_period_end).getTime() > t;
  }
  return false;
}

export function hasAi(sub: Subscription | null | undefined, now: Date = new Date()): boolean {
  return hasAccess(sub, now) && sub?.tier === 'ai';
}

export function trialDaysLeft(sub: Subscription | null | undefined, now: Date = new Date()): number | null {
  if (!sub || sub.status !== 'trial' || !sub.trial_ends_at) return null;
  const ms = new Date(sub.trial_ends_at).getTime() - now.getTime();
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}

/** Texto curto da situação do plano, para a tela de configurações. */
export function planSummary(sub: Subscription | null | undefined, now: Date = new Date()): string {
  if (!sub) return 'Sem plano';
  const left = trialDaysLeft(sub, now);
  if (left !== null) return left > 0 ? `Teste grátis · ${left === 1 ? 'falta 1 dia' : `faltam ${left} dias`}` : 'Teste encerrado';
  if (hasAccess(sub, now)) {
    const end = sub.current_period_end ? new Date(sub.current_period_end) : null;
    const when = end ? ` até ${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}` : '';
    return `${PLAN_NAME[sub.tier]}${sub.status === 'canceled' ? ' · não renova' : ''}${when}`;
  }
  return 'Plano vencido';
}
