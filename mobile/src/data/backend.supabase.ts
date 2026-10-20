import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { addMonths, startOfMonth, todayISO } from '@/lib/dates';
import { env } from '@/lib/env';
import type { Backend, ProfileWithSub, Workspace } from './backend';
import { AppError } from './backend';

let client: SupabaseClient | null = null;

function sb(): SupabaseClient {
  if (client) return client;
  client = createClient(env.supabaseUrl, env.supabaseKey, {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  // O token só renova sozinho com o app aberto: pausa em segundo plano e retoma ao voltar.
  AppState.addEventListener('change', (state) => {
    if (!client) return;
    if (state === 'active') client.auth.startAutoRefresh();
    else client.auth.stopAutoRefresh();
  });
  return client;
}

/** Traduz erros do Supabase para mensagens que a pessoa entende. */
function friendly(error: { message: string; code?: string } | null, fallback: string): AppError {
  const msg = error?.message ?? '';
  if (/invalid login credentials/i.test(msg)) return new AppError('E-mail ou senha incorretos.');
  if (/email not confirmed/i.test(msg)) return new AppError('Confirme o seu e-mail antes de entrar. Enviamos um link para a sua caixa de entrada.');
  if (/user already registered|already been registered/i.test(msg)) return new AppError('Já existe uma conta com este e-mail. Tente entrar.');
  if (/password should be at least|weak password/i.test(msg)) return new AppError('A senha precisa ter pelo menos 8 caracteres.');
  if (/database error saving new user/i.test(msg) || /profiles_document/i.test(msg) || error?.code === '23505') {
    return new AppError('Este CPF ou CNPJ é inválido ou já está cadastrado em outra conta.');
  }
  if (/rate limit|too many/i.test(msg)) return new AppError('Muitas tentativas. Aguarde um pouco e tente de novo.');
  if (/row-level security|violates row-level/i.test(msg)) return new AppError('Seu plano está vencido. Assine para continuar lançando.');
  if (/network|failed to fetch/i.test(msg)) return new AppError('Sem conexão. Confira a internet e tente de novo.');
  return new AppError(fallback);
}

function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }, fallback: string): T {
  if (res.error) throw friendly(res.error, fallback);
  return res.data as T;
}

export const supabaseBackend: Backend = {
  async getUser() {
    const { data } = await sb().auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? '' } : null;
  },

  onAuthChange(cb) {
    const { data } = sb().auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      cb(u ? { id: u.id, email: u.email ?? '' } : null);
    });
    return () => data.subscription.unsubscribe();
  },

  async signIn(email, password) {
    const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw friendly(error, 'Não foi possível entrar. Tente de novo.');
  },

  async signUp({ email, password, kind, document, displayName }) {
    const { data, error } = await sb().auth.signUp({
      email: email.trim(),
      password,
      // O perfil é criado no banco a partir destes dados (gatilho em auth.users).
      options: { data: { kind, document, display_name: displayName.trim() } },
    });
    if (error) throw friendly(error, 'Não foi possível criar a conta. Tente de novo.');
    return { needsConfirmation: !data.session };
  },

  async signOut() {
    await sb().auth.signOut();
  },

  async resetPassword(email) {
    const { error } = await sb().auth.resetPasswordForEmail(email.trim());
    if (error) throw friendly(error, 'Não foi possível enviar o e-mail agora.');
  },

  async deleteAccount() {
    const { error } = await sb().functions.invoke('delete-account', { method: 'POST' });
    if (error) throw new AppError('Não foi possível excluir a conta agora. Tente de novo ou fale com o suporte.');
    await sb().auth.signOut();
  },

  async listProfiles() {
    const res = await sb().from('profiles').select('*, subscriptions(*)').order('created_at');
    const rows = must(res, 'Não foi possível carregar os seus perfis.') as any[];
    return rows.map((r): ProfileWithSub => {
      const s = Array.isArray(r.subscriptions) ? r.subscriptions[0] : r.subscriptions;
      const { subscriptions: _drop, ...profile } = r;
      return { ...profile, subscription: s ?? null };
    });
  },

  async addProfile({ kind, document, displayName }) {
    const { data: u } = await sb().auth.getUser();
    if (!u.user) throw new AppError('Sessão expirada. Entre de novo.');
    const { error } = await sb().from('profiles').insert({ user_id: u.user.id, kind, document, display_name: displayName.trim() });
    if (error) throw friendly(error, 'Não foi possível criar o perfil.');
  },

  async loadWorkspace(profileId): Promise<Workspace> {
    const since = addMonths(startOfMonth(todayISO(), 0), -12);
    const [accounts, categories, txs, bills, buckets, plan, goals] = await Promise.all([
      sb().from('accounts').select('*').eq('profile_id', profileId).eq('archived', false).order('created_at'),
      sb().from('categories').select('*').eq('profile_id', profileId).order('sort'),
      sb().from('transactions').select('*, categories(key)').eq('profile_id', profileId).gte('occurred_on', since)
        .order('occurred_on', { ascending: false }).order('created_at', { ascending: false }).limit(5000),
      sb().from('bills').select('*').eq('profile_id', profileId).eq('status', 'open').order('due_on'),
      sb().from('budget_buckets').select('*').eq('profile_id', profileId).order('sort'),
      sb().from('budget_plans').select('*').eq('profile_id', profileId).maybeSingle(),
      sb().from('goals').select('*').eq('profile_id', profileId).order('created_at'),
    ]);
    const fail = 'Não foi possível carregar os seus dados.';
    return {
      accounts: must(accounts, fail) as Workspace['accounts'],
      categories: must(categories, fail) as Workspace['categories'],
      txs: (must(txs, fail) as any[]).map(({ categories: c, ...t }) => ({ ...t, category_key: c?.key ?? '' })),
      bills: must(bills, fail) as Workspace['bills'],
      buckets: must(buckets, fail) as Workspace['buckets'],
      plan: must(plan, fail) as Workspace['plan'],
      goals: must(goals, fail) as Workspace['goals'],
    };
  },

  async addAccount(a) {
    const { error } = await sb().from('accounts').insert({
      profile_id: a.profileId,
      name: a.name.trim(),
      kind: a.kind,
      institution: a.institution?.trim() || null,
      balance_cents: a.kind === 'card' ? 0 : a.balanceCents ?? 0,
      credit_limit_cents: a.kind === 'card' ? a.limitCents ?? 0 : null,
      closing_day: a.kind === 'card' ? a.closingDay ?? null : null,
      due_day: a.kind === 'card' ? a.dueDay ?? null : null,
    });
    if (error) throw friendly(error, 'Não foi possível criar a conta.');
  },

  async setOpeningBalance(accountId, balanceCents) {
    const { error } = await sb().rpc('set_opening_balance', { p_account: accountId, p_balance: balanceCents });
    if (error) throw new AppError(/já tem lançamentos/i.test(error.message) ? 'Esta conta já tem lançamentos. O saldo muda só por lançamento.' : friendly(error, 'Não foi possível ajustar o saldo.').message);
  },

  async addTransaction(t) {
    const { error } = await sb().from('transactions').insert({
      profile_id: t.profileId,
      type: t.type,
      amount_cents: t.amountCents,
      description: t.description.trim(),
      category_id: t.categoryId,
      account_id: t.accountId,
      to_account_id: t.toAccountId ?? null,
      occurred_on: t.occurredOn,
      tag: t.tag ?? 'empresa',
    });
    if (error) throw friendly(error, 'Não foi possível salvar o lançamento.');
  },

  async deleteTransaction(id) {
    const { error } = await sb().from('transactions').delete().eq('id', id);
    if (error) throw friendly(error, 'Não foi possível excluir o lançamento.');
  },

  async recategorize(id, category) {
    const patch = { category_id: category.id, ...(category.key === 'retirada' ? { tag: 'empresa' } : {}) };
    const { error } = await sb().from('transactions').update(patch).eq('id', id);
    if (error) throw friendly(error, 'Não foi possível alterar a categoria.');
  },

  async settleBill(billId, accountId, paidOn) {
    const { error } = await sb().rpc('settle_bill', { p_bill: billId, p_account: accountId, p_paid_on: paidOn });
    if (error) throw friendly(error, 'Não foi possível registrar o pagamento.');
  },

  async saveBudgetPlan(profileId, incomeCents, buckets) {
    const { error } = await sb().rpc('save_budget_plan', { p_profile: profileId, p_income: incomeCents, p_buckets: buckets });
    if (error) throw friendly(error, 'Não foi possível salvar a divisão da renda.');
  },

  async contributeToGoal({ goalId, amountCents, fromAccountId, toAccountId, on }) {
    const { error } = await sb().rpc('contribute_to_goal', {
      p_goal: goalId, p_amount: amountCents, p_from: fromAccountId, p_to: toAccountId, p_on: on,
    });
    if (error) throw friendly(error, 'Não foi possível fazer o aporte.');
  },
};
