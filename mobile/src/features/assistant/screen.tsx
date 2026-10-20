import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { PLAN_NAME, PLAN_PRICE_CENTS } from '@/domain/access';
import { env } from '@/lib/env';
import { formatBRL } from '@/lib/money';
import { useWorkspace } from '@/providers/workspace';
import { Button, Card, IconBubble, Screen, Txt } from '@/ui/kit';
import { space } from '@/ui/theme';
import { AppHeader } from '../common/header';

/**
 * O assistente com IA ainda não existe: enquanto EXPO_PUBLIC_AI_ENABLED não estiver ligado, a aba só
 * avisa que ele vem aí e o plano com IA não é vendido. Isso evita cobrar por algo que não está pronto.
 */
export function AssistantScreen() {
  const { profile, ai } = useWorkspace();
  const router = useRouter();

  return (
    <Screen>
      <AppHeader />
      <Card style={{ gap: space.md, alignItems: 'flex-start' }}>
        <IconBubble name="spark" tone="accent" size={48} />
        {!env.aiEnabled ? (
          <>
            <Txt variant="title">Assistente com IA, em breve</Txt>
            <Txt color="ink2">
              Em breve você poderá perguntar em português coisas como “posso gastar R$ 500 hoje?” ou “quanto posso retirar da empresa?”
              e receber a resposta com os seus números.
            </Txt>
          </>
        ) : ai ? (
          <>
            <Txt variant="title">Assistente</Txt>
            <Txt color="ink2">Seu plano inclui o assistente. A conversa chega na próxima atualização.</Txt>
          </>
        ) : (
          <>
            <Txt variant="title">{PLAN_NAME.ai}</Txt>
            <Txt color="ink2">
              Pergunte em português sobre o seu dinheiro e receba a resposta com os seus números. Por {formatBRL(PLAN_PRICE_CENTS.ai)} ao mês
              {profile?.kind === 'pj' ? ', para a empresa' : ''}.
            </Txt>
            <View style={{ alignSelf: 'stretch' }}><Button title="Conhecer o plano" onPress={() => router.push('/paywall')} /></View>
          </>
        )}
      </Card>
    </Screen>
  );
}
