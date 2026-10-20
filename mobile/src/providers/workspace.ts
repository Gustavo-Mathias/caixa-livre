import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';

import { backend, type NewTx, type Workspace } from '@/data';
import { hasAccess, hasAi } from '@/domain/access';
import { todayISO } from '@/lib/dates';
import { useSession } from './session';
import { useToast } from './toast';

const EMPTY: Workspace = { accounts: [], categories: [], txs: [], bills: [], buckets: [], plan: null, goals: [] };

/** Dados do perfil ativo, mais a situação do plano e as ações de escrita. */
export function useWorkspace() {
  const { profile } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const profileId = profile?.id ?? '';

  const query = useQuery({
    queryKey: ['ws', profileId],
    queryFn: () => backend.loadWorkspace(profileId),
    enabled: !!profileId,
  });

  const today = todayISO();
  const ws = query.data ?? EMPTY;
  const access = hasAccess(profile?.subscription);
  const ai = hasAi(profile?.subscription);

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['ws', profileId] }), [qc, profileId]);

  const run = useCallback(async (fn: () => Promise<void>, okMessage?: string): Promise<boolean> => {
    try {
      await fn();
      await refresh();
      if (okMessage) toast(okMessage);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Algo deu errado. Tente de novo.', 'error');
      return false;
    }
  }, [refresh, toast]);

  /** Quem está sem plano só consulta: ao tentar escrever, vai para a tela de assinatura. */
  const guard = useCallback((action: () => void) => {
    if (!access) { router.push('/paywall'); return; }
    action();
  }, [access, router]);

  const actions = useMemo(() => ({
    addTransaction: (t: Omit<NewTx, 'profileId'>) => run(() => backend.addTransaction({ ...t, profileId }), 'Lançamento salvo'),
    deleteTransaction: (id: string) => run(() => backend.deleteTransaction(id), 'Lançamento excluído'),
    recategorize: (id: string, c: { id: string; key: string }) => run(() => backend.recategorize(id, c), 'Categoria atualizada'),
    settleBill: (billId: string, accountId: string, paidOn: string) => run(() => backend.settleBill(billId, accountId, paidOn), 'Registrado'),
    saveBudgetPlan: (income: number, buckets: { key: string; pct: number }[]) => run(() => backend.saveBudgetPlan(profileId, income, buckets), 'Divisão da renda atualizada'),
    contribute: (a: { goalId: string; amountCents: number; fromAccountId: string; toAccountId: string }) =>
      run(() => backend.contributeToGoal({ ...a, on: todayISO() }), 'Aporte feito'),
  }), [run, profileId]);

  const byId = useMemo(() => ({
    account: (id: string | null) => ws.accounts.find((a) => a.id === id),
    category: (id: string) => ws.categories.find((c) => c.id === id),
    categoryByKey: (key: string) => ws.categories.find((c) => c.key === key),
  }), [ws]);

  return { profile, ws, today, access, ai, loading: query.isLoading, error: query.error as Error | null, refetch: query.refetch, guard, actions, byId };
}
