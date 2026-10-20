/** Tipos do domínio. Espelham as tabelas do Supabase (supabase/migrations). */

export type ProfileKind = 'pf' | 'pj';
export type PlanTier = 'basic' | 'ai';
export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'canceled' | 'expired';
export type TxType = 'in' | 'out' | 'transfer';
export type AccountKind = 'bank' | 'save' | 'card';

export type Profile = {
  id: string;
  user_id: string;
  kind: ProfileKind;
  document: string;
  display_name: string;
  legal_name: string | null;
};

export type Subscription = {
  profile_id: string;
  tier: PlanTier;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  store: 'app_store' | 'play_store' | 'promotional' | null;
  product_id: string | null;
};

export type Account = {
  id: string;
  profile_id: string;
  name: string;
  institution: string | null;
  kind: AccountKind;
  balance_cents: number;
  credit_limit_cents: number | null;
  closing_day: number | null;
  due_day: number | null;
  archived: boolean;
};

export type Category = {
  id: string;
  profile_id: string;
  key: string;
  name: string;
  kind: TxType;
  icon: string;
  hidden_in_form: boolean;
  sort: number;
};

export type Tx = {
  id: string;
  profile_id: string;
  account_id: string;
  to_account_id: string | null;
  category_id: string;
  type: TxType;
  amount_cents: number;
  description: string;
  occurred_on: string;
  tag: 'empresa' | 'pessoal';
  bill_id: string | null;
};

/** Lançamento já com a chave da categoria, que é o que os cálculos usam. */
export type TxView = Tx & { category_key: string };

export type Bill = {
  id: string;
  profile_id: string;
  kind: 'pagar' | 'receber';
  description: string;
  party: string | null;
  amount_cents: number;
  due_on: string;
  category_id: string;
  account_id: string | null;
  recur_monthly: boolean;
  status: 'open' | 'settled';
  settled_on: string | null;
};

export type Bucket = {
  id: string;
  profile_id: string;
  key: string;
  name: string;
  pct: number;
  kind: 'spend' | 'invest';
  category_keys: string[];
  sort: number;
};

export type BudgetPlan = { profile_id: string; income_cents: number };

export type Goal = {
  id: string;
  profile_id: string;
  name: string;
  target_cents: number;
  saved_cents: number;
  deadline: string;
  bucket: 'curto' | 'longo';
  icon: string;
};
