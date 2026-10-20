import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { isValidCpf, isValidCnpj } from '../../mobile/src/lib/documents.ts';

const db = new PGlite();
let pass = 0;
const fails = [];
const ok = (cond, name, extra) => {
  if (cond) pass++;
  else fails.push(name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''));
};
const q = async (sql, params) => (await db.query(sql, params)).rows;
const throws = async (sql, name, params) => {
  try {
    await db.query(sql, params);
    fails.push(name + ' (deveria falhar)');
  } catch (e) {
    pass++;
    console.log('  esperado: ' + name + ' -> ' + e.message.split('\n')[0].slice(0, 140));
    return e.message;
  }
};

// --- Stub mínimo do Supabase (auth + papéis) ---
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);

// --- Migração real ---
const dir = new URL('../migrations/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') ;
for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(dir + f, 'utf8'));

const as = async (uid) => {
  await db.exec('reset role');
  if (uid) {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
    await db.exec('set role authenticated');
  }
};

// 1. CPF e CNPJ: SQL e TypeScript precisam concordar
const cpfs = [['529.982.247-25', true], ['52998224725', true], ['111.111.111-11', false], ['529.982.247-24', false], ['123', false]];
const cnpjs = [
  ['11.222.333/0001-81', true], ['11.444.777/0001-61', true], ['12.ABC.345/01DE-35', true],
  ['12.ABC.345/01DE-36', false], ['12ABC34501DE35', true], ['00000000000000', false], ['11.222.333/0001-80', false],
];
for (const [d, exp] of cpfs) {
  ok((await q('select public.is_valid_cpf($1) v', [d]))[0].v === exp, `sql cpf ${d}`);
  ok(isValidCpf(d) === exp, `ts cpf ${d}`);
}
for (const [d, exp] of cnpjs) {
  ok((await q('select public.is_valid_cnpj($1) v', [d]))[0].v === exp, `sql cnpj ${d}`);
  ok(isValidCnpj(d) === exp, `ts cnpj ${d}`);
}

// 2. Cadastro: o perfil nasce do metadata do sign-up
const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'a@ex.com', $2)`,
  [A, JSON.stringify({ kind: 'pf', document: '529.982.247-25', display_name: 'Camila Duarte' })]);
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'b@ex.com', $2)`,
  [B, JSON.stringify({ kind: 'pj', document: '11.222.333/0001-81', display_name: 'Loja do B' })]);
const profA = (await q(`select * from public.profiles where user_id = $1`, [A]))[0];
const profB = (await q(`select * from public.profiles where user_id = $1`, [B]))[0];
ok(profA && profA.kind === 'pf' && profA.document === '52998224725', 'perfil PF criado e normalizado', profA);
ok(profB && profB.kind === 'pj', 'perfil PJ criado');
ok((await q('select count(*)::int n from public.categories where profile_id=$1', [profA.id]))[0].n === 15, 'categorias PF');
ok((await q('select count(*)::int n from public.categories where profile_id=$1', [profB.id]))[0].n === 14, 'categorias PJ');
ok((await q('select sum(pct)::int s from public.budget_buckets where profile_id=$1', [profA.id]))[0].s === 100, 'divisão PF soma 100');
ok((await q('select count(*)::int n from public.budget_buckets where profile_id=$1', [profB.id]))[0].n === 0, 'PJ sem divisão da renda');
const subA = (await q('select * from public.subscriptions where profile_id=$1', [profA.id]))[0];
ok(subA.status === 'trial' && subA.trial_ends_at, 'primeiro perfil em teste', subA);
await throws(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'c@ex.com', '{"kind":"pf","document":"111.111.111-11","display_name":"Fulano"}')`, 'CPF inválido barra o cadastro');
await throws(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'd@ex.com', '{"kind":"pf","document":"529.982.247-25","display_name":"Outro"}')`, 'CPF duplicado barra o cadastro');

// segundo perfil do mesmo login: precisa de plano
await as(A);
await db.query(`insert into public.profiles (user_id, kind, document, display_name) values ($1,'pj','11.444.777/0001-61'::text,'Empresa da Camila')`.replace(`'11.444.777/0001-61'::text`, `'11444777000161'`), [A]);
await as(null);
const profA2 = (await q(`select * from public.profiles where user_id=$1 and kind='pj'`, [A]))[0];
ok((await q('select status from public.subscriptions where profile_id=$1', [profA2.id]))[0].status === 'expired', 'segundo perfil começa sem acesso');
await as(A);
await throws(`insert into public.profiles (user_id, kind, document, display_name) values ('${A}','pj','12ABC34501DE35','Outra PJ')`, 'só 1 PJ por login');
await as(null);

// 3. RLS
await as(A);
const mine = await q('select user_id from public.profiles');
ok(mine.length === 2 && mine.every((r) => r.user_id === A), 'A só vê os próprios perfis', mine);
ok((await q('select count(*)::int n from public.accounts'))[0].n === 4, 'A só vê as próprias contas');
const accA = (await q('select id from public.accounts where profile_id=$1', [profA.id]))[0].id;
const accB_ = await (async () => { await as(null); const r = (await q('select id from public.accounts where profile_id=$1', [profB.id]))[0].id; await as(A); return r; })();
const catOut = async (pid, key) => (await q('select id from public.categories where profile_id=$1 and key=$2', [pid, key]))[0].id;
await throws(`insert into public.transactions (profile_id, account_id, category_id, type, amount_cents, description, occurred_on)
  values ('${profB.id}','${accB_}','${await (async()=>{await as(null);const c=await catOut(profB.id,'das');await as(A);return c})()}','out',100,'invasão','2026-10-01')`, 'A não escreve no perfil de B');

// 4. Lançamentos e saldos
const cMerc = await catOut(profA.id, 'mercado');
const cRend = await catOut(profA.id, 'salario');
const cFat = await catOut(profA.id, 'fatura');
await db.query(`insert into public.accounts (profile_id, name, kind, balance_cents) values ($1,'Banco','bank',100000)`, [profA.id]).catch(() => {});
const bank = (await q(`select id from public.accounts where profile_id=$1 and kind='bank' order by created_at limit 1`, [profA.id]))[0].id;
await db.query(`insert into public.accounts (profile_id, name, kind, credit_limit_cents, closing_day, due_day) values ($1,'Cartão','card',500000,26,5)`, [profA.id]);
const card = (await q(`select id from public.accounts where profile_id=$1 and kind='card'`, [profA.id]))[0].id;
const bal = async (id) => Number((await q('select balance_cents b from public.accounts where id=$1', [id]))[0].b);
// A está em teste: pode escrever
const start = await bal(bank);
const t1 = (await q(`insert into public.transactions (profile_id, account_id, category_id, type, amount_cents, description, occurred_on)
  values ($1,$2,$3,'out',25000,'Mercado','2026-10-10') returning id`, [profA.id, bank, cMerc]))[0].id;
ok((await bal(bank)) === start - 25000, 'despesa reduz o saldo');
await db.query(`insert into public.transactions (profile_id, account_id, category_id, type, amount_cents, description, occurred_on)
  values ($1,$2,$3,'in',500000,'Pró-labore','2026-10-05')`, [profA.id, bank, cRend]);
ok((await bal(bank)) === start - 25000 + 500000, 'receita aumenta o saldo');
await db.query(`insert into public.transactions (profile_id, account_id, category_id, type, amount_cents, description, occurred_on)
  values ($1,$2,$3,'out',80000,'Compra no cartão','2026-10-12')`, [profA.id, card, cMerc]);
ok((await bal(card)) === 80000, 'compra no cartão aumenta a dívida');
await db.query(`insert into public.transactions (profile_id, account_id, to_account_id, category_id, type, amount_cents, description, occurred_on)
  values ($1,$2,$3,$4,'transfer',30000,'Pagamento da fatura','2026-10-15')`, [profA.id, bank, card, cFat]);
ok((await bal(card)) === 50000, 'pagamento reduz a dívida do cartão');
ok((await bal(bank)) === start - 25000 + 500000 - 30000, 'pagamento sai do saldo');
await db.query(`delete from public.transactions where id=$1`, [t1]);
ok((await bal(bank)) === start + 500000 - 30000, 'excluir lançamento devolve o saldo');
await throws(`update public.accounts set balance_cents = 999999999 where id='${bank}'`, 'app não altera o saldo direto');
await throws(`update public.profiles set document = '11222333000181' where user_id='${A}' and kind='pf'`, 'documento não muda');
await throws(`insert into public.transactions (profile_id, account_id, to_account_id, category_id, type, amount_cents, description, occurred_on)
  values ('${profA.id}','${bank}','${bank}','${cFat}','transfer',100,'x','2026-10-15')`, 'transferência para a mesma conta');

// 5. Conta a pagar recorrente
const bill = (await q(`insert into public.bills (profile_id, kind, description, amount_cents, due_on, category_id, recur_monthly)
  values ($1,'pagar','Aluguel',210000,'2026-10-10',$2,true) returning id`, [profA.id, await catOut(profA.id, 'moradia')]))[0].id;
const before = await bal(bank);
await db.query('select public.settle_bill($1,$2,$3)', [bill, bank, '2026-10-10']);
ok((await bal(bank)) === before - 210000, 'quitar conta cria o lançamento e baixa o saldo');
const open = await q(`select due_on::text d from public.bills where profile_id=$1 and status='open'`, [profA.id]);
ok(open.length === 1 && open[0].d === '2026-11-10', 'conta recorrente gera a próxima', open);
await throws(`select public.settle_bill('${bill}','${bank}')`, 'não quita duas vezes');

// 6. Divisão da renda
await throws(`select public.save_budget_plan('${profA.id}', 800000, '[{"key":"desp","pct":50},{"key":"estudo","pct":5},{"key":"livre","pct":10},{"key":"curto","pct":10},{"key":"longo","pct":20}]'::jsonb)`, 'soma diferente de 100 é recusada');
await db.query(`select public.save_budget_plan($1, 800000, '[{"key":"desp","pct":50},{"key":"estudo","pct":10},{"key":"livre","pct":10},{"key":"curto","pct":10},{"key":"longo","pct":20}]'::jsonb)`, [profA.id]);
ok((await q(`select pct from public.budget_buckets where profile_id=$1 and key='estudo'`, [profA.id]))[0].pct === 10, 'divisão salva');
ok(Number((await q('select income_cents c from public.budget_plans where profile_id=$1', [profA.id]))[0].c) === 800000, 'renda planejada salva');
await throws(`update public.budget_buckets set pct = 90 where profile_id='${profA.id}' and key='desp'`, 'edição direta que quebra os 100% é barrada');

// 7. Acesso por assinatura: sem plano, lê mas não escreve
await as(null);
await db.query(`update public.subscriptions set status='expired' where profile_id=$1`, [profA.id]);
await as(A);
ok((await q('select count(*)::int n from public.transactions'))[0].n > 0, 'sem plano ainda lê os dados');
await throws(`insert into public.transactions (profile_id, account_id, category_id, type, amount_cents, description, occurred_on)
  values ('${profA.id}','${bank}','${cMerc}','out',100,'bloqueado','2026-10-18')`, 'sem plano não escreve');
await throws(`update public.subscriptions set status='active', current_period_end = now() + interval '1 year' where profile_id='${profA.id}'`, 'usuário não ativa a própria assinatura');
await as(null);
await db.query(`update public.subscriptions set status='active', tier='ai', current_period_end = now() + interval '30 days' where profile_id=$1`, [profA.id]);
await as(A);
await db.query(`insert into public.transactions (profile_id, account_id, category_id, type, amount_cents, description, occurred_on)
  values ($1,$2,$3,'out',100,'liberado','2026-10-18')`, [profA.id, bank, cMerc]);
pass++;
await as(null);
ok((await q('select private.has_ai($1) v', [profA.id]))[0].v === true, 'plano com IA reconhecido');

// 8. Aporte em meta
await as(null);
await db.query(`update public.subscriptions set status='active', tier='basic', current_period_end = now() + interval '30 days' where profile_id=$1`, [profA.id]);
await as(A);
const reserva = (await q(`select id from public.accounts where profile_id=$1 and kind='save'`, [profA.id]))[0].id;
const goal = (await q(`insert into public.goals (profile_id, name, target_cents, saved_cents, deadline, bucket) values ($1,'Viagem',800000,100000,'2026-12-12','curto') returning id`, [profA.id]))[0].id;
const bBank = await bal(bank), bRes = await bal(reserva);
await db.query('select public.contribute_to_goal($1,$2,$3,$4,$5)', [goal, 50000, bank, reserva, '2026-10-18']);
ok((await bal(bank)) === bBank - 50000 && (await bal(reserva)) === bRes + 50000, 'aporte move o dinheiro para a reserva');
ok(Number((await q('select saved_cents s from public.goals where id=$1', [goal]))[0].s) === 150000, 'aporte soma na meta');
ok((await q(`select count(*)::int n from public.transactions t join public.categories c on c.id=t.category_id where t.profile_id=$1 and c.key='curto'`, [profA.id]))[0].n === 1, 'aporte entra na categoria de curto prazo');
await throws(`select public.contribute_to_goal('${goal}', 0, '${bank}', '${reserva}')`, 'aporte zero é recusado');
await as(null);

// 9. Saldo inicial
await as(A);
const novaConta = (await q(`insert into public.accounts (profile_id, name, kind) values ($1,'Conta nova','bank') returning id`, [profA.id]))[0].id;
await db.query('select public.set_opening_balance($1,$2)', [novaConta, 123400]);
ok((await bal(novaConta)) === 123400, 'saldo inicial definido');
await db.query(`insert into public.transactions (profile_id, account_id, category_id, type, amount_cents, description, occurred_on) values ($1,$2,$3,'in',1000,'x','2026-10-18')`, [profA.id, novaConta, cRend]);
await throws(`select public.set_opening_balance('${novaConta}', 999)`, 'saldo inicial não muda depois de lançar');
await as(B);
await throws(`select public.set_opening_balance('${novaConta}', 999)`, 'saldo inicial de conta de outro usuário');
await as(null);

// 10. Excluir a conta apaga tudo em cascata
await as(null);
const counts = async (id) => (await q(`select
  (select count(*)::int from public.profiles where user_id=$1) p,
  (select count(*)::int from public.accounts a join public.profiles p on p.id=a.profile_id where p.user_id=$1) a,
  (select count(*)::int from public.transactions t join public.profiles p on p.id=t.profile_id where p.user_id=$1) t,
  (select count(*)::int from public.subscriptions s join public.profiles p on p.id=s.profile_id where p.user_id=$1) s`, [id]))[0];
const b0 = await counts(A);
ok(b0.p === 2 && b0.a > 0 && b0.t > 0 && b0.s === 2, 'A tinha dados antes de excluir', b0);
await db.query('delete from auth.users where id=$1', [A]);
const b1 = await counts(A);
ok(b1.p === 0 && b1.a === 0 && b1.t === 0 && b1.s === 0, 'excluir o login apaga perfis, contas, lançamentos e assinaturas', b1);
const bB = await counts(B);
ok(bB.p === 1 && bB.t > -1, 'dados de B continuam intactos', bB);

console.log(`\n${pass} verificações ok, ${fails.length} falhas`);
for (const f of fails) console.log('  ✗ ' + f);
process.exit(fails.length ? 1 : 0);
