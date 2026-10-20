-- Caixa Livre · esquema inicial
--
-- Convenções
--   * Valores em centavos (bigint). Datas de lançamento em `date`.
--   * Toda tabela de dados tem profile_id; o acesso é sempre pelo dono do perfil (RLS).
--   * Um login pode ter 1 perfil pessoa física (CPF) e 1 perfil empresa (CNPJ). Cada perfil
--     tem a sua própria assinatura.
--   * Leitura continua liberada depois que a assinatura vence; escrita exige acesso ativo.

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- CPF e CNPJ (o CNPJ pode ser alfanumérico desde julho de 2026)
-- ---------------------------------------------------------------------------

create or replace function public.normalize_document(doc text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(doc, ''), '[^0-9A-Za-z]', '', 'g'))
$$;

create or replace function public.is_valid_cpf(doc text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  d text := public.normalize_document(doc);
  s int;
  i int;
  dv int;
begin
  if d !~ '^[0-9]{11}$' or d ~ '^(.)\1{10}$' then
    return false;
  end if;

  s := 0;
  for i in 1..9 loop
    s := s + substr(d, i, 1)::int * (11 - i);
  end loop;
  dv := case when s % 11 < 2 then 0 else 11 - (s % 11) end;
  if dv <> substr(d, 10, 1)::int then
    return false;
  end if;

  s := 0;
  for i in 1..10 loop
    s := s + substr(d, i, 1)::int * (12 - i);
  end loop;
  dv := case when s % 11 < 2 then 0 else 11 - (s % 11) end;
  return dv = substr(d, 11, 1)::int;
end
$$;

create or replace function public.is_valid_cnpj(doc text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  d text := public.normalize_document(doc);
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int;
  i int;
  dv int;
begin
  -- 12 primeiras posições aceitam letras e números; os 2 dígitos verificadores são números.
  if d !~ '^[0-9A-Z]{12}[0-9]{2}$' or d ~ '^(.)\1{13}$' then
    return false;
  end if;

  -- cada caractere vale o código ASCII menos 48 (A = 17, B = 18, ...)
  s := 0;
  for i in 1..12 loop
    s := s + (ascii(substr(d, i, 1)) - 48) * w1[i];
  end loop;
  dv := case when s % 11 < 2 then 0 else 11 - (s % 11) end;
  if dv <> substr(d, 13, 1)::int then
    return false;
  end if;

  s := 0;
  for i in 1..13 loop
    s := s + (ascii(substr(d, i, 1)) - 48) * w2[i];
  end loop;
  dv := case when s % 11 < 2 then 0 else 11 - (s % 11) end;
  return dv = substr(d, 14, 1)::int;
end
$$;

-- ---------------------------------------------------------------------------
-- Perfis e assinaturas
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('pf', 'pj')),
  document text not null,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  legal_name text,
  created_at timestamptz not null default now(),
  constraint profiles_document_normalized check (document = public.normalize_document(document)),
  constraint profiles_document_valid check (
    (kind = 'pf' and public.is_valid_cpf(document))
    or (kind = 'pj' and public.is_valid_cnpj(document))
  ),
  constraint profiles_document_key unique (document),
  constraint profiles_user_kind_key unique (user_id, kind)
);

create table public.subscriptions (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  tier text not null default 'basic' check (tier in ('basic', 'ai')),
  status text not null default 'trial' check (status in ('trial', 'active', 'grace', 'canceled', 'expired')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  store text check (store in ('app_store', 'play_store', 'promotional')),
  product_id text,
  -- horário (ms) do último aviso das lojas já aplicado; avisos mais antigos são ignorados
  last_event_ms bigint not null default 0,
  updated_at timestamptz not null default now()
);

create function private.trial_days()
returns int
language sql
immutable
as $$ select 7 $$;

create function private.owns_profile(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles pr
    where pr.id = p and pr.user_id = (select auth.uid())
  )
$$;

-- Acesso ativo: período de teste em andamento, ou assinatura vigente
-- (inclui "canceled", que é só a renovação desligada até o fim do período).
create function private.has_access(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.profile_id = p
      and (
        (s.status = 'trial' and s.trial_ends_at > now())
        or (s.status in ('active', 'grace', 'canceled') and s.current_period_end > now())
      )
  )
$$;

create function private.has_ai(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_access(p)
    and exists (select 1 from public.subscriptions s where s.profile_id = p and s.tier = 'ai')
$$;

grant execute on function private.owns_profile(uuid), private.has_access(uuid), private.has_ai(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Dados financeiros
-- ---------------------------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  institution text,
  kind text not null check (kind in ('bank', 'save', 'card')),
  -- bank/save: saldo disponível. card: dívida em aberto (compras menos pagamentos).
  balance_cents bigint not null default 0,
  credit_limit_cents bigint check (credit_limit_cents is null or credit_limit_cents >= 0),
  closing_day smallint check (closing_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, profile_id),
  constraint accounts_card_fields check (
    kind <> 'card'
    or (credit_limit_cents is not null and closing_day is not null and due_day is not null)
  )
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  key text not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('in', 'out', 'transfer')),
  icon text not null default 'dots',
  hidden_in_form boolean not null default false,
  sort smallint not null default 0,
  unique (id, profile_id),
  unique (profile_id, key)
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('pagar', 'receber')),
  description text not null check (char_length(btrim(description)) between 1 and 200),
  party text,
  amount_cents bigint not null check (amount_cents > 0),
  due_on date not null,
  category_id uuid not null,
  account_id uuid,
  recur_monthly boolean not null default false,
  status text not null default 'open' check (status in ('open', 'settled')),
  settled_on date,
  created_at timestamptz not null default now(),
  unique (id, profile_id),
  foreign key (category_id, profile_id) references public.categories (id, profile_id),
  foreign key (account_id, profile_id) references public.accounts (id, profile_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null,
  to_account_id uuid,
  category_id uuid not null,
  type text not null check (type in ('in', 'out', 'transfer')),
  amount_cents bigint not null check (amount_cents > 0),
  description text not null check (char_length(btrim(description)) between 1 and 200),
  occurred_on date not null,
  -- só faz sentido no perfil empresa: 'pessoal' = gasto do sócio pago pelo CNPJ
  tag text not null default 'empresa' check (tag in ('empresa', 'pessoal')),
  bill_id uuid references public.bills (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (account_id, profile_id) references public.accounts (id, profile_id),
  foreign key (to_account_id, profile_id) references public.accounts (id, profile_id),
  foreign key (category_id, profile_id) references public.categories (id, profile_id),
  constraint transactions_transfer_target check (type = 'transfer' or to_account_id is null),
  constraint transactions_transfer_differs check (to_account_id is null or to_account_id <> account_id)
);

create index transactions_profile_date_idx on public.transactions (profile_id, occurred_on desc);
create index bills_profile_open_idx on public.bills (profile_id, status, due_on);

-- Divisão da renda (pessoa física)
create table public.budget_plans (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  income_cents bigint not null default 0 check (income_cents >= 0),
  updated_at timestamptz not null default now()
);

create table public.budget_buckets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  key text not null,
  name text not null,
  pct smallint not null check (pct between 0 and 100),
  kind text not null check (kind in ('spend', 'invest')),
  category_keys text[] not null default '{}',
  sort smallint not null default 0,
  unique (profile_id, key)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  target_cents bigint not null check (target_cents > 0),
  saved_cents bigint not null default 0 check (saved_cents >= 0),
  deadline date not null,
  bucket text not null check (bucket in ('curto', 'longo')),
  icon text not null default 'target',
  created_at timestamptz not null default now()
);

-- A divisão da renda precisa fechar em 100% (verificado ao fim da transação).
create function private.check_buckets_sum()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p uuid := coalesce(new.profile_id, old.profile_id);
  total int;
begin
  select coalesce(sum(pct), 0) into total from public.budget_buckets where profile_id = p;
  if total not in (0, 100) then
    raise exception 'A soma dos percentuais da divisão da renda precisa ser 100 (está em %)', total
      using errcode = '23514';
  end if;
  return null;
end
$$;

create constraint trigger budget_buckets_sum
  after insert or update or delete on public.budget_buckets
  deferrable initially deferred
  for each row execute function private.check_buckets_sum();

-- ---------------------------------------------------------------------------
-- Saldos: mantidos por gatilho, nunca pelo aplicativo
-- ---------------------------------------------------------------------------

create function private.move_balance(a uuid, b uuid, t text, amt bigint, sg int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.accounts
     set balance_cents = balance_cents + case
       when kind = 'card' then (case t when 'out' then sg * amt when 'in' then -sg * amt else 0 end)
       else (case t when 'in' then sg * amt else -sg * amt end)
     end
   where id = a;

  if t = 'transfer' and b is not null then
    update public.accounts
       set balance_cents = balance_cents + case when kind = 'card' then -sg * amt else sg * amt end
     where id = b;
  end if;
end
$$;

create function private.apply_transaction_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.move_balance(old.account_id, old.to_account_id, old.type, old.amount_cents, -1);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.move_balance(new.account_id, new.to_account_id, new.type, new.amount_cents, 1);
  end if;
  return coalesce(new, old);
end
$$;

create trigger transactions_balance
  after insert or update or delete on public.transactions
  for each row execute function private.apply_transaction_balance();

-- ---------------------------------------------------------------------------
-- Cadastro: perfil criado a partir dos dados enviados no sign-up
-- ---------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  k text := m ->> 'kind';
begin
  if k in ('pf', 'pj') then
    insert into public.profiles (user_id, kind, document, display_name, legal_name)
    values (
      new.id,
      k,
      public.normalize_document(m ->> 'document'),
      btrim(coalesce(m ->> 'display_name', '')),
      nullif(btrim(coalesce(m ->> 'legal_name', '')), '')
    );
  end if;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Categorias, conta principal, divisão da renda e assinatura de cada perfil novo.
create function private.seed_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if new.kind = 'pf' then
    insert into public.categories (profile_id, key, name, kind, icon, hidden_in_form, sort) values
      (new.id, 'salario',  'Pró-labore',                    'in',       'brief',   false, 1),
      (new.id, 'extras',   'Trabalhos extras',              'in',       'wallet',  false, 2),
      (new.id, 'rend',     'Rendimentos',                   'in',       'trend',   false, 3),
      (new.id, 'moradia',  'Moradia',                       'out',      'home',    false, 4),
      (new.id, 'mercado',  'Mercado',                       'out',      'cart',    false, 5),
      (new.id, 'rest',     'Restaurantes',                  'out',      'fork',    false, 6),
      (new.id, 'transp',   'Transporte',                    'out',      'car',     false, 7),
      (new.id, 'saude',    'Saúde',                         'out',      'heart',   false, 8),
      (new.id, 'lazer',    'Lazer',                         'out',      'ticket',  false, 9),
      (new.id, 'assin',    'Assinaturas',                   'out',      'repeat',  false, 10),
      (new.id, 'educ',     'Educação',                      'out',      'book',    false, 11),
      (new.id, 'outros',   'Outros',                        'out',      'dots',    false, 12),
      (new.id, 'curto',    'Investimento de curto prazo',   'transfer', 'wallet',  false, 13),
      (new.id, 'longo',    'Investimento de longo prazo',   'transfer', 'trend',   false, 14),
      (new.id, 'fatura',   'Fatura do cartão',              'transfer', 'card',    true,  15);

    insert into public.accounts (profile_id, name, kind) values
      (new.id, 'Conta corrente', 'bank'),
      (new.id, 'Reserva', 'save');

    insert into public.budget_plans (profile_id) values (new.id);
    insert into public.budget_buckets (profile_id, key, name, pct, kind, category_keys, sort) values
      (new.id, 'desp',   'Despesas',                     55, 'spend',  array['moradia','mercado','saude','transp','outros'], 1),
      (new.id, 'estudo', 'Estudos',                       5, 'spend',  array['educ'],                                        2),
      (new.id, 'livre',  'Gastos livres',                10, 'spend',  array['rest','lazer','assin'],                        3),
      (new.id, 'curto',  'Investimento de curto prazo',  10, 'invest', array['curto'],                                       4),
      (new.id, 'longo',  'Investimento de longo prazo',  20, 'invest', array['longo'],                                       5);
  else
    insert into public.categories (profile_id, key, name, kind, icon, hidden_in_form, sort) values
      (new.id, 'receita',    'Receitas de clientes',        'in',       'wallet',   false, 1),
      (new.id, 'rendimento', 'Rendimentos',                 'in',       'trend',    false, 2),
      (new.id, 'folha',      'Pró-labore e folha',          'out',      'brief',    false, 3),
      (new.id, 'encargos',   'FGTS e INSS',                 'out',      'bank',     false, 4),
      (new.id, 'das',        'Imposto (DAS)',               'out',      'receipt',  false, 5),
      (new.id, 'aluguel',    'Aluguel e coworking',         'out',      'build',    false, 6),
      (new.id, 'software',   'Software e assinaturas',      'out',      'repeat',   false, 7),
      (new.id, 'marketing',  'Marketing e anúncios',        'out',      'mega',     false, 8),
      (new.id, 'freela',     'Freelancers e fornecedores',  'out',      'users',    false, 9),
      (new.id, 'contador',   'Contabilidade',               'out',      'book',     false, 10),
      (new.id, 'equip',      'Equipamentos',                'out',      'laptop',   false, 11),
      (new.id, 'retirada',   'Retirada do sócio',           'out',      'swap',     false, 12),
      (new.id, 'pessoal',    'Gasto pessoal no CNPJ',       'out',      'home',     true,  13),
      (new.id, 'fatura',     'Fatura do cartão',            'transfer', 'card',     true,  14);

    insert into public.accounts (profile_id, name, kind) values
      (new.id, 'Conta PJ', 'bank'),
      (new.id, 'Reserva da empresa', 'save');
  end if;

  -- Só o primeiro perfil do login ganha período de teste; o segundo precisa de plano.
  select count(*) into n from public.profiles where user_id = new.user_id;
  insert into public.subscriptions (profile_id, status, trial_ends_at)
  values (
    new.id,
    case when n = 1 then 'trial' else 'expired' end,
    case when n = 1 then now() + make_interval(days => private.trial_days()) end
  );

  return new;
end
$$;

create trigger profiles_seed
  after insert on public.profiles
  for each row execute function private.seed_profile();

-- ---------------------------------------------------------------------------
-- Funções chamadas pelo aplicativo
-- ---------------------------------------------------------------------------

-- Quita uma conta a pagar/receber: cria o lançamento e, se for recorrente, a próxima.
create function public.settle_bill(p_bill uuid, p_account uuid, p_paid_on date default current_date)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  b public.bills;
  t uuid;
begin
  select * into b from public.bills where id = p_bill and status = 'open' for update;
  if not found then
    raise exception 'Conta não encontrada ou já quitada' using errcode = 'P0002';
  end if;

  insert into public.transactions
    (profile_id, account_id, category_id, type, amount_cents, description, occurred_on, bill_id)
  values
    (b.profile_id, p_account, b.category_id, case b.kind when 'pagar' then 'out' else 'in' end,
     b.amount_cents, b.description, p_paid_on, b.id)
  returning id into t;

  update public.bills set status = 'settled', settled_on = p_paid_on where id = b.id;

  if b.recur_monthly then
    insert into public.bills
      (profile_id, kind, description, party, amount_cents, due_on, category_id, account_id, recur_monthly)
    values
      (b.profile_id, b.kind, b.description, b.party, b.amount_cents,
       (b.due_on + interval '1 month')::date, b.category_id, b.account_id, true);
  end if;

  return t;
end
$$;

-- Salva a renda planejada e os percentuais da divisão da renda (a soma precisa dar 100).
create function public.save_budget_plan(p_profile uuid, p_income bigint, p_buckets jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  total int;
begin
  select coalesce(sum(x.pct), 0) into total
    from jsonb_to_recordset(p_buckets) as x(key text, pct int);
  if total <> 100 then
    raise exception 'A soma dos percentuais precisa ser 100 (está em %)', total using errcode = '23514';
  end if;

  update public.budget_plans set income_cents = p_income, updated_at = now() where profile_id = p_profile;

  update public.budget_buckets b
     set pct = x.pct::smallint
    from jsonb_to_recordset(p_buckets) as x(key text, pct int)
   where b.profile_id = p_profile and b.key = x.key;
end
$$;


-- Aporte em meta: transfere da conta para a reserva e soma na meta, na mesma transação.
create function public.contribute_to_goal(p_goal uuid, p_amount bigint, p_from uuid, p_to uuid, p_on date default current_date)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  g public.goals;
  cat uuid;
  t uuid;
begin
  if p_amount <= 0 then
    raise exception 'O aporte precisa ser maior que zero' using errcode = '22023';
  end if;
  select * into g from public.goals where id = p_goal for update;
  if not found then
    raise exception 'Meta não encontrada' using errcode = 'P0002';
  end if;
  select id into cat from public.categories where profile_id = g.profile_id and key = g.bucket;

  insert into public.transactions
    (profile_id, account_id, to_account_id, category_id, type, amount_cents, description, occurred_on)
  values
    (g.profile_id, p_from, p_to, cat, 'transfer', p_amount, 'Aporte · ' || g.name, p_on)
  returning id into t;

  update public.goals set saved_cents = saved_cents + p_amount where id = g.id;
  return t;
end
$$;

revoke all on function public.contribute_to_goal(uuid, bigint, uuid, uuid, date) from public, anon;
grant execute on function public.contribute_to_goal(uuid, bigint, uuid, uuid, date) to authenticated;

revoke all on function public.settle_bill(uuid, uuid, date) from public, anon;
revoke all on function public.save_budget_plan(uuid, bigint, jsonb) from public, anon;
grant execute on function public.settle_bill(uuid, uuid, date) to authenticated;
grant execute on function public.save_budget_plan(uuid, bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Segurança por linha
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;

alter table public.profiles enable row level security;
create policy "dono lê o perfil" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "dono cria o perfil" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "dono edita o perfil" on public.profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono apaga o perfil" on public.profiles
  for delete to authenticated using (user_id = (select auth.uid()));
-- Documento e tipo não mudam depois do cadastro.
revoke update on public.profiles from authenticated;
grant update (display_name, legal_name) on public.profiles to authenticated;

alter table public.subscriptions enable row level security;
create policy "dono lê a assinatura" on public.subscriptions
  for select to authenticated using (private.owns_profile(profile_id));
-- Sem políticas de escrita: só o servidor (webhook das lojas) altera assinaturas.
revoke insert, update, delete on public.subscriptions from authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'categories', 'transactions', 'bills', 'budget_plans', 'budget_buckets', 'goals']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "dono lê" on public.%I for select to authenticated using (private.owns_profile(profile_id))', t);
    execute format(
      'create policy "dono cria com acesso ativo" on public.%I for insert to authenticated with check (private.owns_profile(profile_id) and private.has_access(profile_id))', t);
    execute format(
      'create policy "dono edita com acesso ativo" on public.%I for update to authenticated using (private.owns_profile(profile_id) and private.has_access(profile_id)) with check (private.owns_profile(profile_id))', t);
    execute format(
      'create policy "dono apaga com acesso ativo" on public.%I for delete to authenticated using (private.owns_profile(profile_id) and private.has_access(profile_id))', t);
  end loop;
end
$$;

-- O saldo só muda por lançamento (gatilho); o app edita só os demais campos da conta.
revoke update on public.accounts from authenticated;
grant update (name, institution, credit_limit_cents, closing_day, due_day, archived) on public.accounts to authenticated;

-- Saldo inicial de uma conta: só enquanto ela não tem nenhum lançamento.
-- Depois disso o saldo muda apenas por lançamento (gatilho), nunca por edição direta.
create function public.set_opening_balance(p_account uuid, p_balance bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.accounts;
begin
  select * into a from public.accounts where id = p_account;
  if not found or not private.owns_profile(a.profile_id) then
    raise exception 'Conta não encontrada' using errcode = 'P0002';
  end if;
  if not private.has_access(a.profile_id) then
    raise exception 'Seu plano está vencido' using errcode = '42501';
  end if;
  if a.kind = 'card' then
    raise exception 'Cartão de crédito não tem saldo inicial' using errcode = '22023';
  end if;
  if exists (select 1 from public.transactions t where t.account_id = p_account or t.to_account_id = p_account) then
    raise exception 'A conta já tem lançamentos: o saldo muda só por lançamento' using errcode = '22023';
  end if;
  update public.accounts set balance_cents = p_balance where id = p_account;
end
$$;

revoke all on function public.set_opening_balance(uuid, bigint) from public, anon;
grant execute on function public.set_opening_balance(uuid, bigint) to authenticated;
