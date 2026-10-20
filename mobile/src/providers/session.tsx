import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { backend, type AuthUser, type ProfileWithSub } from '@/data';
import { KindContext } from '@/ui/theme';
import { PrivacyContext } from '@/ui/kit';

type SessionState = {
  /** Ainda descobrindo se há login salvo (só na abertura do app). */
  booting: boolean;
  /** Carregando os perfis de quem acabou de entrar. */
  profilesLoading: boolean;
  user: AuthUser | null;
  profiles: ProfileWithSub[];
  profile: ProfileWithSub | null;
  setActiveProfile: (id: string) => void;
  refreshProfiles: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession fora do SessionProvider');
  return v;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    backend.getUser().then((u) => { if (alive) { setUser(u); setBooting(false); } }).catch(() => alive && setBooting(false));
    const off = backend.onAuthChange((u) => {
      if (!alive) return;
      setUser(u);
      if (!u) { setActiveId(null); qc.clear(); }
    });
    return () => { alive = false; off(); };
  }, [qc]);

  const profilesQuery = useQuery({
    queryKey: ['profiles', user?.id],
    queryFn: () => backend.listProfiles(),
    enabled: !!user,
  });

  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);
  const profile = useMemo(() => profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null, [profiles, activeId]);

  const refreshProfiles = useCallback(async () => { await qc.invalidateQueries({ queryKey: ['profiles'] }); }, [qc]);
  const signOut = useCallback(async () => { await backend.signOut(); }, []);

  const value = useMemo<SessionState>(() => ({
    booting, profilesLoading: !!user && profilesQuery.isLoading,
    user, profiles, profile, setActiveProfile: setActiveId, refreshProfiles, signOut,
  }), [booting, user, profilesQuery.isLoading, profiles, profile, refreshProfiles, signOut]);

  const privacy = useMemo(() => ({ hidden, toggle: () => setHidden((h) => !h) }), [hidden]);

  return (
    <SessionContext.Provider value={value}>
      <PrivacyContext.Provider value={privacy}>
        <KindContext.Provider value={profile?.kind ?? 'pf'}>{children}</KindContext.Provider>
      </PrivacyContext.Provider>
    </SessionContext.Provider>
  );
}
