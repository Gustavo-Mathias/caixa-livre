import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';

import { backend } from '@/data';
import { PLAN_NAME, PLAN_PRICE_CENTS, hasAccess, planSummary, trialDaysLeft } from '@/domain/access';
import type { PlanTier } from '@/domain/types';
import { KIND_COPY } from '@/features/auth/profile-form';
import { ModalHeader } from '@/features/common/modal';
import { env } from '@/lib/env';
import { formatBRL } from '@/lib/money';
import { purchase, purchasesAvailable, restorePurchases, storePrices } from '@/lib/purchases';
import { useSession } from '@/providers/session';
import { useToast } from '@/providers/toast';
import { Button, Notice, Screen, Txt } from '@/ui/kit';
import { Icon } from '@/ui/icons';
import { fonts, radius, space, useTheme } from '@/ui/theme';

const FEATURES: Record<'pf' | 'pj', Record<PlanTier, string[]>> = {
  pf: {
    basic: ['Quanto está livre para gastar hoje', 'Divisão da renda em percentuais', 'Cartão, metas e lançamentos sem limite'],
    ai: ['Tudo do plano Essencial', 'Assistente que responde com os seus números', 'Pergunte em português, a qualquer hora'],
  },
  pj: {
    basic: ['Caixa, fôlego e contas a pagar e a receber', 'Impostos do Simples e resultado do mês', 'Separação entre gastos da empresa e do sócio'],
    ai: ['Tudo do plano Essencial', 'Assistente que responde com os números da empresa', 'Pergunte em português, a qualquer hora'],
  },
};

export default function Paywall() {
  const router = useRouter();
  const t = useTheme();
  const toast = useToast();
  const { profile, refreshProfiles } = useSession();
  const [tier, setTier] = useState<PlanTier>(profile?.subscription?.tier ?? 'basic');
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState<Partial<Record<PlanTier, string>>>({});

  useEffect(() => { if (profile && purchasesAvailable()) storePrices(profile.kind).then(setPrices); }, [profile]);
  if (!profile) return null;

  const kind = profile.kind;
  const sub = profile.subscription;
  const active = hasAccess(sub);
  const left = trialDaysLeft(sub);
  const tiers: PlanTier[] = env.aiEnabled ? ['basic', 'ai'] : ['basic'];
  const price = (p: PlanTier) => prices[p] ?? formatBRL(PLAN_PRICE_CENTS[p]);
  const isCurrent = active && sub?.tier === tier;

  /** A compra confirma na loja; o acesso só liga quando o servidor recebe o aviso. Esperamos um pouco por ele. */
  const waitForAccess = async () => {
    for (let i = 0; i < 10; i++) {
      const list = await backend.listProfiles();
      if (hasAccess(list.find((p) => p.id === profile.id)?.subscription)) return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  };

  const subscribe = async () => {
    setBusy(true);
    try {
      if (env.mock && backend.devActivatePlan) {
        await backend.devActivatePlan(profile.id, tier);
        await refreshProfiles();
        toast('Plano ativado (modo demonstração).');
        router.back();
        return;
      }
      const r = await purchase(kind, tier);
      if (r === 'unavailable') { toast('As assinaturas não estão disponíveis neste aparelho.', 'error'); return; }
      if (r === 'cancelled') return;
      const ok = await waitForAccess();
      await refreshProfiles();
      if (ok) { toast('Plano ativado. Obrigado!'); router.back(); }
      else toast('Compra recebida. O plano pode levar alguns minutos para aparecer.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível concluir a compra.', 'error');
    } finally { setBusy(false); }
  };

  const restore = async () => {
    try {
      const ok = await restorePurchases();
      if (!ok) { toast('Não há compras para restaurar neste aparelho.'); return; }
      await refreshProfiles();
      toast('Compras restauradas.');
    } catch { toast('Não foi possível restaurar agora.', 'error'); }
  };

  const manage = () => Linking.openURL(Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions').catch(() => {});
  const open = (u: string) => { if (u) Linking.openURL(u).catch(() => {}); };

  return (
    <Screen>
      <ModalHeader title={kind === 'pj' ? 'Plano da empresa' : 'Plano pessoal'} subtitle={`${profile.display_name} · ${KIND_COPY[kind].docLabel}`} />

      {active ? (
        <Notice tone="accent" title="Plano atual">{planSummary(sub)}</Notice>
      ) : (
        <Notice tone={left === 0 || sub?.status === 'expired' ? 'warn' : 'accent'} title={left && left > 0 ? `Teste grátis: ${left === 1 ? 'falta 1 dia' : `faltam ${left} dias`}` : 'Assine para continuar lançando'}>
          {left && left > 0 ? 'Escolha o plano que quiser quando o teste terminar.' : 'Os seus dados continuam disponíveis para consulta. Para lançar de novo, assine um plano.'}
        </Notice>
      )}

      <View style={{ gap: space.md, marginTop: space.lg }}>
        {tiers.map((p) => {
          const on = tier === p;
          return (
            <Pressable key={p} onPress={() => setTier(p)} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={{ borderRadius: radius.lg, borderWidth: on ? 2 : 1, borderColor: on ? t.accent : t.line2, backgroundColor: t.surface, padding: space.lg, gap: space.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Txt variant="heading">{PLAN_NAME[p]}</Txt>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                  <Txt style={{ fontFamily: fonts.displayBold, fontSize: 22 }}>{price(p)}</Txt>
                  <Txt variant="small" color="ink2">/mês</Txt>
                </View>
              </View>
              {FEATURES[kind][p].map((f) => (
                <View key={f} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
                  <View style={{ paddingTop: 2 }}><Icon name="check" size={16} color={t.ok} strokeWidth={2.2} /></View>
                  <Txt variant="small" style={{ flex: 1 }}>{f}</Txt>
                </View>
              ))}
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: space.lg, gap: space.md }}>
        <Button
          title={isCurrent ? 'Este é o seu plano' : active ? `Mudar para ${PLAN_NAME[tier]}` : `Assinar por ${price(tier)}/mês`}
          onPress={subscribe}
          loading={busy}
          disabled={isCurrent}
        />
        {left && left > 0 ? <Button title="Continuar no teste grátis" variant="secondary" onPress={() => router.back()} /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.xl }}>
          <Pressable onPress={restore} accessibilityRole="button" hitSlop={8}><Txt variant="small" color="accent" style={{ fontFamily: fonts.bodyMedium }}>Restaurar compras</Txt></Pressable>
          {active ? <Pressable onPress={manage} accessibilityRole="button" hitSlop={8}><Txt variant="small" color="accent" style={{ fontFamily: fonts.bodyMedium }}>Gerenciar assinatura</Txt></Pressable> : null}
        </View>
      </View>

      <Txt variant="caption" color="ink3" style={{ marginTop: space.xl, lineHeight: 17 }}>
        A assinatura é mensal e renova sozinha até ser cancelada. A cobrança é feita na sua conta da {Platform.OS === 'ios' ? 'App Store' : 'Google Play'}.
        Para cancelar, abra os ajustes de assinaturas da loja pelo menos 24 horas antes da renovação. Cada perfil (pessoa física ou empresa) tem o seu próprio plano.
      </Txt>
      <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.sm }}>
        <Pressable onPress={() => open(env.termsUrl)} accessibilityRole="link"><Txt variant="caption" color="accent">Termos de Uso</Txt></Pressable>
        <Pressable onPress={() => open(env.privacyUrl)} accessibilityRole="link"><Txt variant="caption" color="accent">Política de Privacidade</Txt></Pressable>
      </View>
    </Screen>
  );
}
