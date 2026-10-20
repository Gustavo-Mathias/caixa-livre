import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { BrandMark } from '@/features/auth/parts';
import { Button, Screen, Txt } from '@/ui/kit';
import { Icon } from '@/ui/icons';
import { fonts, space } from '@/ui/theme';


const POINTS = [
  ['user', 'Pessoal e empresa separados', 'Um login, dois perfis. Cada um com o seu CPF ou CNPJ e o seu plano.'],
  ['target', 'Saiba quanto está livre', 'Veja o que dá para gastar hoje, sem fazer conta de cabeça.'],
  ['receipt', 'Contas e impostos em dia', 'A pagar, a receber e o DAS estimado da empresa.'],
] as const;

export default function Welcome() {
  const router = useRouter();
  return (
    <Screen bottomInset={32}>
      <View style={{ marginTop: space.xxl, gap: space.lg }}>
        <BrandMark />
        <Txt variant="display">Caixa Livre</Txt>
        <Txt variant="heading" color="ink2" style={{ fontFamily: fonts.body, lineHeight: 26 }}>
          O dinheiro da sua vida e o da sua empresa, cada um no seu lugar.
        </Txt>
      </View>

      <View style={{ marginTop: space.xxl, gap: space.xl }}>
        {POINTS.map(([icon, title, text]) => (
          <View key={title} style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ paddingTop: 2 }}><Icon name={icon} size={22} color="#8190AB" /></View>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontFamily: fonts.bodySemi }}>{title}</Txt>
              <Txt variant="small" color="ink2">{text}</Txt>
            </View>
          </View>
        ))}
      </View>

      <View style={{ marginTop: space.xxl, gap: space.md }}>
        <Button title="Criar conta" onPress={() => router.push('/sign-up')} />
        <Button title="Já tenho conta" variant="secondary" onPress={() => router.push('/sign-in')} />
      </View>
    </Screen>
  );
}
