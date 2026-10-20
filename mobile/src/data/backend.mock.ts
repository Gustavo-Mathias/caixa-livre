/**
 * Backend em memória, só para desenvolvimento (EXPO_PUBLIC_MOCK=1). Imita as regras do banco:
 * saldos mudam por lançamento e quem está sem plano não consegue escrever.
 */
import { hasAccess } from '@/domain/access';
import type { Profile, ProfileKind, Subscription, TxView } from '@/domain/types';
import { addMonths, todayISO } from '@/lib/dates';
import { checkDocument } from '@/lib/documents';
import type { AuthUser, Backend, NewTx, ProfileWithSub, Workspace } from './backend';
import { AppError } from './backend';
import { mockWorkspace } from './mock-seed';

type MockUser = { id: string; email: string; password: string; profiles: ProfileWithSub[] };

const users = new Map<string, MockUser>();
const spaces = new Map<string, Workspace>();
const listeners = new Set<(u: AuthUser | null) => void>();
let current: MockUser | null = null;
let seq = 1000;

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120));
const uid = (p: string) => `${p}${++seq}`;
const iso = (d: Date) => d.toISOString();
const emit = () => listeners.forEach((l) => l(current ? { id: current.id, email: current.email } : null));

function newProfile(user: MockUser, kind: ProfileKind, document: string, displayName: string): ProfileWithSub {
  const first = user.profiles.length === 0;
  const id = uid('prof-');
  const sub: Subscription = {
    profile_id: id,
    tier: 'basic',
    status: first ? 'trial' : 'expired',
    trial_ends_at: first ? iso(new Date(Date.now() + 7 * 86_400_000)) : null,
    current_period_end: null,
    store: null,
    product_id: null,
  };
  const p: Profile = { id, user_id: user.id, kind, document, display_name: displayName, legal_name: null };
  spaces.set(id, mockWorkspace(kind, id, todayISO()));
  const full = { ...p, subscription: sub };
  user.profiles.push(full);
  return full;
}

// Conta de demonstração: um login com os dois perfis.
(() => {
  const u: MockUser = { id: 'user-demo', email: 'demo@caixalivre.app', password: 'demo1234', profiles: [] };
  users.set(u.email, u);
  const pf = newProfile(u, 'pf', '52998224725', 'Camila Duarte');
  const pj = newProfile(u, 'pj', '11222333000181', 'Prado Estúdio Criativo');
  pf.subscription = { ...pf.subscription!, status: 'active', tier: 'basic', trial_ends_at: null, current_period_end: iso(new Date(Date.now() + 25 * 86_400_000)) };
  pj.subscription = { ...pj.subscription!, status: 'expired' };
})();

function profileOf(id: string): ProfileWithSub {
  const p = current?.profiles.find((x) => x.id === id);
  if (!p) throw new AppError('Perfil não encontrado.');
  return p;
}

function writable(profileId: string): Workspace {
  if (!hasAccess(profileOf(profileId).subscription)) throw new AppError('Seu plano está vencido. Assine para continuar lançando.');
  return spaces.get(profileId)!;
}

/** Equivalente ao gatilho do banco que mantém os saldos. */
function move(ws: Workspace, t: Pick<TxView, 'account_id' | 'to_account_id' | 'type' | 'amount_cents'>, sg: 1 | -1) {
  const a = ws.accounts.find((x) => x.id === t.account_id);
  const b = t.to_account_id ? ws.accounts.find((x) => x.id === t.to_account_id) : null;
  if (a) {
    if (a.kind === 'card') a.balance_cents += t.type === 'out' ? sg * t.amount_cents : t.type === 'in' ? -sg * t.amount_cents : 0;
    else a.balance_cents += t.type === 'in' ? sg * t.amount_cents : -sg * t.amount_cents;
  }
  if (t.type === 'transfer' && b) b.balance_cents += b.kind === 'card' ? -sg * t.amount_cents : sg * t.amount_cents;
}

function insertTx(ws: Workspace, profileId: string, t: Omit<NewTx, 'profileId'> & { billId?: string | null }) {
  const cat = ws.categories.find((c) => c.id === t.categoryId)!;
  const row: TxView = {
    id: uid('tx-'), profile_id: profileId, account_id: t.accountId, to_account_id: t.toAccountId ?? null, category_id: t.categoryId,
    type: t.type, amount_cents: t.amountCents, description: t.description.trim(), occurred_on: t.occurredOn, tag: t.tag ?? 'empresa',
    bill_id: t.billId ?? null, category_key: cat.key,
  };
  ws.txs.unshift(row);
  ws.txs.sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : a.occurred_on > b.occurred_on ? -1 : 0));
  move(ws, row, 1);
}

export const mockBackend: Backend = {
  getUser: () => wait(current ? { id: current.id, email: current.email } : null),
  onAuthChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },

  async signIn(email, password) {
    const u = users.get(email.trim().toLowerCase());
    await wait(null);
    if (!u || u.password !== password) throw new AppError('E-mail ou senha incorretos.');
    current = u;
    emit();
  },

  async signUp({ email, password, kind, document, displayName }) {
    await wait(null);
    const e = email.trim().toLowerCase();
    if (users.has(e)) throw new AppError('Já existe uma conta com este e-mail. Tente entrar.');
    if (password.length < 8) throw new AppError('A senha precisa ter pelo menos 8 caracteres.');
    const dup = [...users.values()].some((u) => u.profiles.some((p) => p.document === document));
    if (!checkDocument(kind, document).ok || dup) throw new AppError('Este CPF ou CNPJ é inválido ou já está cadastrado em outra conta.');
    const u: MockUser = { id: uid('user-'), email: e, password, profiles: [] };
    users.set(e, u);
    newProfile(u, kind, document, displayName);
    current = u;
    emit();
    return { needsConfirmation: false };
  },

  async signOut() { current = null; emit(); await wait(null); },
  async resetPassword() { await wait(null); },
  async deleteAccount() {
    if (current) users.delete(current.email);
    current = null;
    emit();
    await wait(null);
  },

  async listProfiles() { return wait(current ? current.profiles.map((p) => ({ ...p, subscription: p.subscription ? { ...p.subscription } : null })) : []); },

  async addProfile({ kind, document, displayName }) {
    await wait(null);
    if (!current) throw new AppError('Sessão expirada. Entre de novo.');
    if (current.profiles.some((p) => p.kind === kind)) throw new AppError('Este login já tem um perfil deste tipo.');
    const dup = [...users.values()].some((u) => u.profiles.some((p) => p.document === document));
    if (!checkDocument(kind, document).ok || dup) throw new AppError('Este CPF ou CNPJ é inválido ou já está cadastrado em outra conta.');
    newProfile(current, kind, document, displayName);
  },

  async loadWorkspace(profileId) {
    profileOf(profileId);
    const ws = spaces.get(profileId)!;
    return wait(structuredClone(ws));
  },

  async addAccount(a) {
    const ws = writable(a.profileId);
    ws.accounts.push({
      id: uid('acc-'), profile_id: a.profileId, name: a.name.trim(), institution: a.institution?.trim() || null, kind: a.kind,
      balance_cents: a.kind === 'card' ? 0 : a.balanceCents ?? 0, credit_limit_cents: a.kind === 'card' ? a.limitCents ?? 0 : null,
      closing_day: a.kind === 'card' ? a.closingDay ?? null : null, due_day: a.kind === 'card' ? a.dueDay ?? null : null, archived: false,
    });
    await wait(null);
  },

  async setOpeningBalance(accountId, balanceCents) {
    for (const [pid, ws] of spaces) {
      const a = ws.accounts.find((x) => x.id === accountId);
      if (!a) continue;
      writable(pid);
      if (a.kind === 'card') throw new AppError('Cartão de crédito não tem saldo inicial.');
      if (ws.txs.some((t) => t.account_id === accountId || t.to_account_id === accountId)) throw new AppError('Esta conta já tem lançamentos. O saldo muda só por lançamento.');
      a.balance_cents = balanceCents;
      break;
    }
    await wait(null);
  },

  async addTransaction(t) {
    const ws = writable(t.profileId);
    insertTx(ws, t.profileId, t);
    await wait(null);
  },

  async deleteTransaction(id) {
    for (const [pid, ws] of spaces) {
      const i = ws.txs.findIndex((t) => t.id === id);
      if (i >= 0) { writable(pid); move(ws, ws.txs[i], -1); ws.txs.splice(i, 1); break; }
    }
    await wait(null);
  },

  async recategorize(id, category) {
    for (const [pid, ws] of spaces) {
      const t = ws.txs.find((x) => x.id === id);
      if (t) { writable(pid); t.category_id = category.id; t.category_key = category.key; if (category.key === 'retirada') t.tag = 'empresa'; break; }
    }
    await wait(null);
  },

  async settleBill(billId, accountId, paidOn) {
    for (const [pid, ws] of spaces) {
      const i = ws.bills.findIndex((b) => b.id === billId);
      if (i < 0) continue;
      writable(pid);
      const b = ws.bills[i];
      insertTx(ws, pid, { type: b.kind === 'pagar' ? 'out' : 'in', amountCents: b.amount_cents, description: b.description, categoryId: b.category_id, accountId, occurredOn: paidOn, billId: b.id });
      ws.bills.splice(i, 1);
      if (b.recur_monthly) ws.bills.push({ ...b, id: uid('bill-'), due_on: addMonths(b.due_on, 1) });
      ws.bills.sort((x, y) => (x.due_on < y.due_on ? -1 : 1));
      break;
    }
    await wait(null);
  },

  async saveBudgetPlan(profileId, incomeCents, buckets) {
    const ws = writable(profileId);
    const total = buckets.reduce((s, b) => s + b.pct, 0);
    if (total !== 100) throw new AppError(`A soma dos percentuais precisa ser 100 (está em ${total}).`);
    ws.plan = { profile_id: profileId, income_cents: incomeCents };
    for (const b of buckets) { const x = ws.buckets.find((k) => k.key === b.key); if (x) x.pct = b.pct; }
    await wait(null);
  },

  async contributeToGoal({ goalId, amountCents, fromAccountId, toAccountId, on }) {
    for (const [pid, ws] of spaces) {
      const g = ws.goals.find((x) => x.id === goalId);
      if (!g) continue;
      writable(pid);
      const cat = ws.categories.find((c) => c.key === g.bucket)!;
      insertTx(ws, pid, { type: 'transfer', amountCents, description: `Aporte · ${g.name}`, categoryId: cat.id, accountId: fromAccountId, toAccountId, occurredOn: on });
      g.saved_cents += amountCents;
      break;
    }
    await wait(null);
  },

  /** Só no modo demonstração: simula a compra da assinatura. */
  async devActivatePlan(profileId, tier) {
    const p = profileOf(profileId);
    p.subscription = {
      profile_id: profileId, tier, status: 'active', trial_ends_at: null, store: 'promotional', product_id: `${p.kind}_${tier}_monthly`,
      current_period_end: iso(new Date(Date.now() + 30 * 86_400_000)),
    };
    await wait(null);
  },
};
