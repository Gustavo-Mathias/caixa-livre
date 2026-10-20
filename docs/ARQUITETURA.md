# Arquitetura

## Visão geral

```
App (Expo / React Native)
  ├─ Supabase Auth ........ login por e-mail e senha
  ├─ Supabase Postgres .... dados, protegidos por RLS (cada linha pertence a um perfil)
  ├─ Edge Function delete-account ........ exclui login e dados
  └─ RevenueCat ........... compra na App Store / Google Play
         └─ webhook ──► Edge Function revenuecat-webhook ──► tabela subscriptions
```

O app **nunca decide** quem tem plano: ele compra, o RevenueCat avisa o servidor e o servidor grava em `subscriptions`.
O banco confere o plano em toda escrita (RLS), então um app adulterado não consegue lançar sem plano.

## Perfis e planos

- Um login tem no máximo **1 perfil pessoa física** (CPF) e **1 perfil empresa** (CNPJ).
- O perfil nasce no cadastro: o app envia `kind`, `document` e `display_name` em `options.data` do `signUp`, e o gatilho
  `on_auth_user_created` cria o perfil. CPF e CNPJ são validados no banco (`is_valid_cpf`, `is_valid_cnpj`) e no app, com a mesma regra.
- O **primeiro** perfil do login ganha 7 dias de teste (`private.trial_days()`). O segundo perfil começa sem acesso e precisa de plano.
- Sem plano, a pessoa **continua lendo** os próprios dados e perde só a escrita.
- Produtos de assinatura (grupos separados para o mesmo Apple ID poder assinar PF e PJ):

| Produto | Perfil | Plano | Preço de tabela |
|---|---|---|---|
| `pf_basic_monthly` | pessoa física | Essencial | R$ 19,90 |
| `pf_ai_monthly` | pessoa física | Com IA | R$ 29,90 |
| `pj_basic_monthly` | empresa | Essencial | R$ 19,90 |
| `pj_ai_monthly` | empresa | Com IA | R$ 29,90 |

  O `app_user_id` do RevenueCat é o id do login. O perfil certo sai do prefixo do produto (`pf_` ou `pj_`).
  Limite atual: 1 perfil de cada tipo por login. Mais de um CNPJ por login exigiria um produto por empresa.

## Dinheiro

- Valores em **centavos** (`bigint`). Nada de ponto flutuante.
- O **saldo só muda por lançamento** (gatilho `transactions_balance`). O app não edita `balance_cents`. O saldo inicial é definido uma vez,
  enquanto a conta não tem lançamentos (`set_opening_balance`).
- Cartão de crédito: `balance_cents` guarda a dívida (compras menos pagamentos). A fatura aberta é o que foi comprado no ciclo atual.
  Pagar fatura é uma transferência da conta para o cartão.
- Quitar conta a pagar/receber (`settle_bill`), aportar em meta (`contribute_to_goal`) e salvar a divisão da renda (`save_budget_plan`)
  são funções do banco, atômicas.
- A divisão da renda precisa somar 100% (verificado no fim da transação por um *constraint trigger*).

## Segurança

- RLS em todas as tabelas. Leitura: dono do perfil. Escrita: dono do perfil **e** plano ativo.
- `subscriptions` só é escrita pelo servidor (chave secreta). O usuário não consegue ativar o próprio plano.
- Documento e tipo do perfil não mudam depois do cadastro (permissão de coluna).
- Exclusão de conta: `delete-account` confere o token e apaga o login; tudo mais apaga em cascata (testado).
- Dados sensíveis (CPF/CNPJ, lançamentos): ver `docs/PUBLICACAO.md` para LGPD.

## Onde cada regra de negócio mora

| Regra | Arquivo |
|---|---|
| CPF/CNPJ (inclui alfanumérico) | `mobile/src/lib/documents.ts` e `supabase/migrations/..._core.sql` |
| Livre para gastar, divisão da renda, cartão, DAS, DRE, fôlego | `mobile/src/domain/finance.ts` |
| Quem tem acesso | `mobile/src/domain/access.ts` e `private.has_access` |
| Eventos do RevenueCat → plano | `supabase/functions/_shared/revenuecat.ts` |

## O que ainda não existe

- **Assistente com IA.** A aba mostra "em breve" e o plano de R$ 29,90 fica escondido.
- **Integração bancária / Open Finance.** Os lançamentos são manuais.
- Importação de extrato (OFX/CSV), notificações de vencimento, bloqueio por biometria.
- Mais de um CNPJ por login.
