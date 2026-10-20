import { PfHome } from '@/features/pf/screens';
import { PjHome } from '@/features/pj/screens';
import { useSession } from '@/providers/session';

export default function Home() {
  const { profile } = useSession();
  return profile?.kind === 'pj' ? <PjHome /> : <PfHome />;
}
