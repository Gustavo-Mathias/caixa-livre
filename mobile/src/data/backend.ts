import type {
  Account, Bill, Bucket, BudgetPlan, Category, Goal, Profile, ProfileKind, Subscription, TxType, TxView,
} from '@/domain/types';

export type AuthUser = { id: string; email: string };

export type ProfileWithSub = Profile & { subscription: Subscription | null };

/** Tudo que as telas de um perfil precisam, carregado de uma vez (o volume é pequeno). */
export type Workspace = {
  accounts: Account[];
  categories: Category[];
  /** Últimos 13 meses, mais recentes primeiro. */
  txs: TxView[];
  bills: Bill[];
  buckets: Bucket[];
  plan: BudgetPlan | null;
  goals: Goal[];
};

export type NewTx = {
  profileId: string;
  type: TxType;
  amountCents: number;
  description: string;
  categoryId: string;
  accountId: string;
  toAccountId?: string | null;
  occurredOn: string;
  tag?: 'empresa' | 'pessoal';
};

export type NewAccount = {
  profileId: string;
  name: string;
  kind: 'bank' | 'save' | 'card';
  institution?: string;
  /** Saldo inicial (conta ou reserva). */
  balanceCents?: number;
  limitCents?: number;
  closingDay?: number;
  dueDay?: number;
};

export type SignUpInput = {
  email: string;
  password: string;
  kind: ProfileKind;
  /** CPF ou CNPJ já normalizado (sem pontuação). */
  document: string;
  displayName: string;
};

/** Erro com mensagem pronta para mostrar na tela. */
export class AppError extends Error {}

export interface Backend {
  getUser(): Promise<AuthUser | null>;
  onAuthChange(cb: (user: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(input: SignUpInput): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  /** Apaga o login e todos os dados. Exigido pela App Store e pelo Google Play. */
  deleteAccount(): Promise<void>;

  listProfiles(): Promise<ProfileWithSub[]>;
  addProfile(input: { kind: ProfileKind; document: string; displayName: string }): Promise<void>;

  loadWorkspace(profileId: string): Promise<Workspace>;
  addAccount(a: NewAccount): Promise<void>;
  /** Só funciona enquanto a conta não tem lançamentos. */
  setOpeningBalance(accountId: string, balanceCents: number): Promise<void>;
  addTransaction(t: NewTx): Promise<void>;
  deleteTransaction(id: string): Promise<void>;
  recategorize(id: string, category: { id: string; key: string }): Promise<void>;
  settleBill(billId: string, accountId: string, paidOn: string): Promise<void>;
  saveBudgetPlan(profileId: string, incomeCents: number, buckets: { key: string; pct: number }[]): Promise<void>;
  contributeToGoal(args: { goalId: string; amountCents: number; fromAccountId: string; toAccountId: string; on: string }): Promise<void>;

  /** Só existe no modo demonstração: simula a compra da assinatura. */
  devActivatePlan?(profileId: string, tier: 'basic' | 'ai'): Promise<void>;
}
