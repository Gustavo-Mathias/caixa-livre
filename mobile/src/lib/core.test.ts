import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkDocument, isValidCnpj, isValidCpf, maskDocument, normalizeDocument } from './documents.ts';
import { formatBRL, parseBRL } from './money.ts';
import { addMonths, diffDays, monthKey } from './dates.ts';
import {
  bucketSpent, bucketState, bucketTarget, cardCycle, cardSummary, dasEstimate, freeToSpend, goalPlan, simplesRate,
} from '../domain/finance.ts';
import type { Account, Bill, TxView } from '../domain/types.ts';

test('CPF', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('52998224725'), true);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCpf('529.982.247-24'), false);
});

test('CNPJ numérico e alfanumérico', () => {
  assert.equal(isValidCnpj('11.222.333/0001-81'), true);
  assert.equal(isValidCnpj('12.ABC.345/01DE-35'), true);
  assert.equal(isValidCnpj('12abc34501de35'), true, 'aceita minúsculas');
  assert.equal(isValidCnpj('12.ABC.345/01DE-36'), false);
  assert.equal(isValidCnpj('00000000000000'), false);
});

test('máscara de documento', () => {
  assert.equal(maskDocument('pf', '52998224725'), '529.982.247-25');
  assert.equal(maskDocument('pf', '5299'), '529.9');
  assert.equal(maskDocument('pj', '12abc34501de35'), '12.ABC.345/01DE-35');
  assert.equal(maskDocument('pj', '12ABC34501DEXX'), '12.ABC.345/01DE', 'dígitos verificadores só aceitam número');
  assert.equal(normalizeDocument('12.abc.345/01de-35'), '12ABC34501DE35');
});

test('mensagens de validação', () => {
  assert.deepEqual(checkDocument('pf', ''), { ok: false, message: 'Informe o CPF.' });
  assert.equal(checkDocument('pj', '11.222.333/0001-8').ok, false);
  assert.deepEqual(checkDocument('pf', '529.982.247-25'), { ok: true, value: '52998224725' });
});

test('dinheiro', () => {
  assert.equal(formatBRL(123456), 'R$ 1.234,56');
  assert.equal(formatBRL(-5), '−R$ 0,05');
  assert.equal(formatBRL(100000000), 'R$ 1.000.000,00');
  assert.equal(formatBRL(50000, { sign: true }), '+R$ 500,00');
  assert.equal(parseBRL('1.234,56'), 123456);
  assert.equal(parseBRL('1234,5'), 123450);
  assert.equal(parseBRL('12.5'), 1250);
  assert.equal(parseBRL('1.234.567'), 123456700);
  assert.equal(parseBRL('abc'), null);
});

test('datas', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(diffDays('2026-10-20', '2026-10-19'), 1);
  assert.equal(monthKey('2026-01-15', -1), '2025-12');
});

const mkTx = (o: Partial<TxView>): TxView => ({
  id: Math.random().toString(36), profile_id: 'p', account_id: 'a', to_account_id: null, category_id: 'c',
  type: 'out', amount_cents: 100, description: 'x', occurred_on: '2026-10-10', tag: 'empresa', bill_id: null, category_key: 'mercado', ...o,
});

test('ciclo do cartão (fecha dia 26, vence dia 5)', () => {
  assert.deepEqual(cardCycle({ closing_day: 26, due_day: 5 }, '2026-10-19'), { start: '2026-09-27', end: '2026-10-26', due: '2026-11-05' });
  assert.deepEqual(cardCycle({ closing_day: 26, due_day: 5 }, '2026-10-27'), { start: '2026-10-27', end: '2026-11-26', due: '2026-12-05' });
  assert.deepEqual(cardCycle({ closing_day: 20, due_day: 28 }, '2026-10-19'), { start: '2026-09-21', end: '2026-10-20', due: '2026-10-28' });
});

test('fatura aberta x fechada', () => {
  const card = { id: 'cd', balance_cents: 90_000, credit_limit_cents: 500_000, closing_day: 26, due_day: 5 } as Account;
  const txs = [
    mkTx({ account_id: 'cd', amount_cents: 30_000, occurred_on: '2026-10-05' }), // ciclo atual
    mkTx({ account_id: 'cd', amount_cents: 60_000, occurred_on: '2026-09-10' }), // fatura fechada
  ];
  const s = cardSummary(card, txs, '2026-10-19');
  assert.equal(s.openInvoice, 30_000);
  assert.equal(s.closedInvoice, 60_000);
  assert.equal(s.available, 410_000);
});

test('livre para gastar', () => {
  const bills = [
    { kind: 'pagar', status: 'open', due_on: '2026-10-25', amount_cents: 100_000 },
    { kind: 'pagar', status: 'open', due_on: '2026-11-03', amount_cents: 999_999 },
    { kind: 'receber', status: 'open', due_on: '2026-10-22', amount_cents: 500_000 },
  ] as Bill[];
  const cards = [{ balance_cents: 50_000 }] as Account[];
  const r = freeToSpend({ balanceCents: 300_000, bills, cards, txs: [], today: '2026-10-19' });
  assert.equal(r.free, 150_000);
  assert.equal(r.daysLeft, 13);
  assert.equal(r.perDay, Math.round(150_000 / 13));
});

test('divisão da renda', () => {
  const desp = { key: 'desp', pct: 55, kind: 'spend' as const, category_keys: ['moradia', 'mercado'] };
  const curto = { key: 'curto', pct: 10, kind: 'invest' as const, category_keys: ['curto'] };
  const txs = [
    mkTx({ category_key: 'moradia', amount_cents: 300_000 }),
    mkTx({ category_key: 'mercado', amount_cents: 50_000 }),
    mkTx({ category_key: 'curto', type: 'transfer', amount_cents: 50_000 }),
  ];
  assert.equal(bucketTarget(800_000, desp), 440_000);
  assert.equal(bucketSpent(txs, '2026-10', desp), 350_000);
  assert.equal(bucketSpent(txs, '2026-10', curto), 50_000);
  assert.equal(bucketState(desp, 350_000, 440_000), 'ok');
  assert.equal(bucketState(desp, 420_000, 440_000), 'warn');
  assert.equal(bucketState(desp, 450_000, 440_000), 'over');
  assert.equal(bucketState(curto, 50_000, 80_000), 'short');
});

test('meta com prazo', () => {
  const g = goalPlan({ target_cents: 1_200_000, saved_cents: 420_000, deadline: '2027-04-19' }, '2026-10-19');
  assert.equal(g.remaining, 780_000);
  assert.equal(g.months, 6);
  assert.equal(g.suggested, 130_000);
});

test('Simples Nacional, Anexo III', () => {
  assert.equal(simplesRate(100_000).band, 1);
  assert.equal(simplesRate(100_000).effective, 0.06);
  const r = simplesRate(336_000);
  assert.equal(r.band, 2);
  assert.ok(Math.abs(r.effective - 0.0841) < 0.0005, String(r.effective));
  assert.equal(simplesRate(5_000_000).band, 6);
});

test('estimativa do DAS', () => {
  const txs: TxView[] = [];
  for (let i = 1; i <= 12; i++) {
    const key = monthKey('2026-10-19', -i);
    txs.push(mkTx({ type: 'in', category_key: 'receita', amount_cents: 2_800_000, occurred_on: `${key}-15` }));
  }
  const d = dasEstimate(txs, '2026-10-19');
  assert.equal(d.rate.band, 2);
  assert.equal(d.rbt12Cents, 33_600_000);
  assert.ok(Math.abs(d.amountCents - 235_500) <= 1_000, String(d.amountCents));
});
