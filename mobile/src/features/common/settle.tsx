import { useCallback, useState } from 'react';

import { cardCycle, cardSummary } from '@/domain/finance';
import type { Account, Bill } from '@/domain/types';
import { addDays } from '@/lib/dates';
import { useWorkspace } from '@/providers/workspace';
import { SettleSheet } from './rows';

/** Fatura de cartão aparece junto com as contas a pagar, mas não é uma linha da tabela `bills`. */
export type InvoiceBill = Bill & { card: Account };

export function cardInvoices(accounts: Account[], txs: Parameters<typeof cardSummary>[1], today: string): InvoiceBill[] {
  return accounts.filter((a) => a.kind === 'card').flatMap((card) => {
    const s = cardSummary(card, txs, today);
    if (s.debt <= 0) return [];
    const closed = s.closedInvoice > 0;
    const prev = cardCycle(card, addDays(s.cycle.start, -1));
    return [{
      id: `card:${card.id}`, profile_id: card.profile_id, kind: 'pagar', party: null,
      description: closed ? `Fatura · ${card.name}` : `Fatura em aberto · ${card.name}`,
      amount_cents: closed ? s.closedInvoice : s.openInvoice,
      due_on: closed ? prev.due : s.cycle.due,
      category_id: '', account_id: null, recur_monthly: false, status: 'open', settled_on: null, card,
    }];
  });
}

/** Abre a folha de pagamento/recebimento e faz o lançamento certo para cada tipo de conta. */
export function useSettle() {
  const { ws, today, actions, guard } = useWorkspace();
  const [bill, setBill] = useState<Bill | null>(null);

  const confirm = useCallback(async (accountId: string): Promise<boolean> => {
    if (!bill) return false;
    if (bill.id.startsWith('card:')) {
      const card = ws.accounts.find((a) => `card:${a.id}` === bill.id);
      const cat = ws.categories.find((c) => c.key === 'fatura');
      if (!card || !cat) return false;
      return actions.addTransaction({
        type: 'transfer', amountCents: bill.amount_cents, description: `Pagamento · ${bill.description}`,
        categoryId: cat.id, accountId, toAccountId: card.id, occurredOn: today,
      });
    }
    return actions.settleBill(bill.id, accountId, today);
  }, [bill, ws, today, actions]);

  return {
    open: (b: Bill) => guard(() => setBill(b)),
    sheet: <SettleSheet bill={bill} ws={ws} today={today} onClose={() => setBill(null)} onConfirm={confirm} />,
  };
}
