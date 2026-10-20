import { PfPlan } from '@/features/pf/screens';
import { PjManage } from '@/features/pj/screens';
import { useSession } from '@/providers/session';

export default function Plan() {
  const { profile } = useSession();
  return profile?.kind === 'pj' ? <PjManage /> : <PfPlan />;
}
