# Publicação na App Store e no Google Play

Este checklist separa o que o código já faz do que depende de contas, textos e decisões suas.
Regras das lojas mudam: onde está "confirmar", abra a página oficial antes de agir.

## 1. Decisões e contas (nada disto o código resolve)

- [ ] **Nome e marca.** Confira "Caixa Livre" no INPI e a disponibilidade do nome nas duas lojas.
- [ ] **Identificador do app.** Hoje está `br.com.caixalivre.app` (em `mobile/app.json`) só como exemplo.
  Troque por um domínio que você controla **antes do primeiro envio**: depois de publicado, não muda.
- [ ] **Conta Apple Developer** (assinatura anual, confirmar valor). Conta de **organização** pede CNPJ e número D-U-N-S (confirmar no cadastro da Apple).
- [ ] **Conta Google Play Console** (taxa única, confirmar valor).
  Relatos de terceiros dizem que contas **pessoais** criadas depois de 13/11/2023 precisam de um teste fechado com **12 testadores por 14 dias seguidos**
  antes de liberar a produção, e que contas de organização com D-U-N-S ficam isentas. Confirmar no Play Console antes de montar o cronograma.
- [ ] **Páginas públicas**: política de privacidade, termos de uso, e-mail de suporte. As duas lojas exigem. Preencha `EXPO_PUBLIC_PRIVACY_URL`,
  `EXPO_PUBLIC_TERMS_URL` e `EXPO_PUBLIC_SUPPORT_EMAIL`.
- [ ] **Ícone e splash definitivos.** Hoje são os do template do Expo (`mobile/assets/`). Precisam de arte própria (ícone 1024×1024 sem transparência,
  ícone adaptativo do Android, splash).

## 2. Servidor (Supabase)

- [ ] Criar o projeto (escolha a região mais próxima dos usuários) e aplicar `supabase/migrations/` (`supabase link` e `supabase db push`).
- [ ] **Rodar as migrações num projeto real e repetir os testes.** Até agora elas só rodaram num Postgres local de teste (PGlite) com um stub do `auth`.
- [ ] Auth: e-mail com confirmação ligado (`config.toml`), **SMTP próprio** (o envio padrão tem limite baixo), URL de retorno `caixalivre://`.
- [ ] Funções: `supabase functions deploy revenuecat-webhook` e `delete-account`. Segredos: `REVENUECAT_WEBHOOK_SECRET` e a chave secreta do projeto.
  **As duas funções ainda não foram executadas** (só a lógica pura do webhook tem teste).
- [ ] Criar uma **conta de revisão** já confirmada, com plano ativo, para a Apple e o Google testarem.

## 3. Assinaturas (RevenueCat + lojas)

- [ ] RevenueCat: projeto, app iOS e app Android, 4 produtos, offerings, webhook para
  `https://<projeto>.supabase.co/functions/v1/revenuecat-webhook` com `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`.
- [ ] App Store Connect: dois **grupos de assinatura** (`PF` e `PJ`), cada um com os planos Essencial e Com IA, mensais. Preços de R$ 19,90 e R$ 29,90 (conferir se existem como faixa).
- [ ] Google Play: assinaturas `pf_basic_monthly`, `pf_ai_monthly`, `pj_basic_monthly`, `pj_ai_monthly`, com um plano-base mensal cada.
- [ ] Preencher `EXPO_PUBLIC_REVENUECAT_IOS_KEY` e `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
- [ ] Testar compra em sandbox (iOS) e em teste licenciado (Android): comprar, renovar, cancelar, restaurar.
- [ ] **Plano com IA:** só ligue `EXPO_PUBLIC_AI_ENABLED=1` quando o assistente existir. Vender um recurso que não existe reprova na revisão e gera estorno.

### Comissão das lojas: decisão que muda o preço líquido

Com a compra integrada das lojas, a comissão sai de cada assinatura. Os programas para pequenos desenvolvedores costumam reduzir para 15% (confirmar).
No Brasil, a Apple passou a permitir pagamentos alternativos e links para pagar fora do app a partir de junho de 2026, com taxas próprias.
As fontes que encontrei divergem nos percentuais, então **não decida pelo número de um blog**: leia a página oficial da Apple para o Brasil.
A versão atual do app usa só a compra integrada, que é o caminho mais simples e mais seguro para passar na revisão.
Um checkout próprio (Pix, cartão) seria outra arquitetura e não está no escopo.

## 4. O que a revisão das lojas vai olhar (e o app já faz)

| Exigência | Situação |
|---|---|
| Quem cria conta precisa poder **excluir a conta dentro do app** | Feito: Configurações → Excluir minha conta. Explica que assinatura ativa não cancela sozinha. |
| Restaurar compras | Feito na tela de plano |
| Preço, renovação automática, como cancelar, links de termos e privacidade perto do botão de assinar | Feito |
| Não oferecer recurso que não existe | Plano com IA escondido por flag |
| Conta de teste para o revisor | Pendente (seção 2) |
| Declaração de dados coletados (privacidade) | Pendente: ver LGPD abaixo |
| App financeiro | O app só registra lançamentos que a pessoa digita. Não movimenta dinheiro, não empresta e não acessa banco. Descreva assim nos formulários. |

## 5. LGPD

- [ ] Política de privacidade em português dizendo quais dados são coletados (nome, e-mail, CPF/CNPJ, lançamentos), para quê, com quem são compartilhados
  (Supabase, RevenueCat, lojas) e por quanto tempo ficam guardados.
- [ ] Contato do encarregado (pode ser um e-mail).
- [ ] Exclusão: feita no app. **Exportação dos dados** (direito de portabilidade): ainda não existe no app.
- [ ] Confirmar onde ficam os dados (região do projeto Supabase) e registrar transferência internacional, se houver.
- [ ] CPF e CNPJ são dados pessoais: não registrar em logs e não enviar a serviços de análise.

## 6. Build e envio

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform all --profile production
npx eas-cli@latest submit --platform ios      # e depois android
```

- Use Node 22 ou 24 (LTS).
- Teste em aparelho real antes de enviar: iOS pelo TestFlight, Android pelo teste interno.
- Roteiro de teste: criar conta PF, criar conta PJ, lançar, pagar conta, assinar, restaurar, excluir a conta.

## 7. Pendências técnicas conhecidas

- Assistente com IA (e o limite mensal de perguntas que o plano de R$ 29,90 precisa para não dar prejuízo).
- Importação de extrato (OFX/CSV), alertas de vencimento, bloqueio por biometria.
- Mais de um CNPJ por login.
- O app nunca rodou em iOS/Android reais nesta etapa: foi conferido no navegador (modo demonstração), com tipos e lint limpos.

## Fontes consultadas

- [Account deletion nas regras da App Store (Apple)](https://developer.apple.com/support/offering-account-deletion-in-your-app)
- [Guideline 5.1.1, exclusão de conta (Apple)](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
- [Exclusão de conta e assinaturas (RevenueCat)](https://www.revenuecat.com/blog/engineering/app-store-account-deletion)
- [Regra dos 12 testadores no Google Play (terceiro)](https://www.testerscommunity.com/blog/google-play-closed-testing-requirements-2026)
- [Apple e pagamentos alternativos no Brasil (terceiro)](https://appcharge.com/blog/apple-brazil-framework-is-now-live-what-publishers-need-to-know)
- [Apple libera pagamentos externos no Brasil (TecMundo)](https://www.tecmundo.com.br/mercado/413975-apple-oficializa-lojas-externas-no-brasil-e-outros-meios-de-pagamento-na-app-store.htm)
- [Eventos do webhook do RevenueCat](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)
- [CNPJ alfanumérico (Receita Federal)](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/cnpj/cnpj-alfanumerico.pdf)
