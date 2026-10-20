# Caixa Livre

App de finanças para celular (iOS e Android) com dois perfis no mesmo login:

- **Pessoa física** (cadastro com CPF): livre para gastar, divisão da renda em percentuais, cartão e metas.
- **Empresa** (cadastro com CNPJ, inclusive o alfanumérico): caixa e fôlego, contas a pagar e a receber, impostos do Simples e resultado do mês, com separação entre gastos da empresa e do sócio.

Cada perfil tem o seu plano: **Essencial R$ 19,90/mês** e **Com assistente de IA R$ 29,90/mês**.
O plano com IA só é vendido quando `EXPO_PUBLIC_AI_ENABLED=1`, e isso só deve ser ligado quando o assistente existir de verdade.

## Estrutura

| Pasta | O que é |
|---|---|
| `mobile/` | App Expo (React Native, TypeScript, Expo Router) |
| `supabase/migrations/` | Banco: tabelas, regras de segurança por usuário (RLS), gatilhos de saldo |
| `supabase/functions/` | Funções de servidor: webhook das assinaturas e exclusão de conta |
| `docs/` | Arquitetura e checklist de publicação nas lojas |

## Rodar o app

Use Node 22 ou 24 (LTS). O React Native 0.88 não declara suporte ao Node 25.

```bash
cd mobile
npm install
cp .env.example .env.local   # preencha, ou use EXPO_PUBLIC_MOCK=1 para demonstração
npx expo start
```

Com `EXPO_PUBLIC_MOCK=1` o app roda com dados de exemplo em memória (login `demo@caixalivre.app`, senha `demo1234`), sem servidor.
Assinaturas de verdade exigem um *development build* (`npx expo run:ios` ou `eas build --profile development`), porque o Expo Go não carrega o módulo nativo.

## Testes

```bash
cd mobile && npm test                      # CPF/CNPJ, dinheiro, datas e cálculos financeiros
node --test supabase/functions/_shared/revenuecat.test.ts   # regras do webhook das assinaturas
cd mobile && npx tsc --noEmit && npx expo lint
```

```bash
cd supabase/tests && npm install && npm test   # 69 verificações do banco
```

O banco é testado rodando as migrações num Postgres real (PGlite) com um stub do schema `auth` do Supabase:
cadastro, CPF/CNPJ, isolamento entre usuários, saldos, quitação de contas, divisão da renda, plano vencido e exclusão em cascata.
Ainda **não** foi rodado contra um projeto Supabase de verdade.

## Colocar no ar

Veja [docs/ARQUITETURA.md](docs/ARQUITETURA.md) e [docs/PUBLICACAO.md](docs/PUBLICACAO.md).
