import assert from 'node:assert/strict';
import { test } from 'node:test';
import { patchFor, planFromProduct, validSecret } from './revenuecat.ts';

test('produto -> tipo de perfil e plano', () => {
  assert.deepEqual(planFromProduct('pf_basic_monthly'), { kind: 'pf', tier: 'basic' });
  assert.deepEqual(planFromProduct('pj_ai_monthly:plano-base'), { kind: 'pj', tier: 'ai' });
  assert.equal(planFromProduct('outro_produto'), null);
  assert.equal(planFromProduct(undefined), null);
});

test('compra e renovação ativam o plano até o fim do período', () => {
  const p = patchFor({ type: 'INITIAL_PURCHASE', product_id: 'pj_basic_monthly', expiration_at_ms: Date.UTC(2026, 10, 20), store: 'APP_STORE', event_timestamp_ms: 5 });
  assert.equal(p?.status, 'active');
  assert.equal(p?.kind, 'pj');
  assert.equal(p?.store, 'app_store');
  assert.equal(p?.current_period_end, '2026-11-20T00:00:00.000Z');
  assert.equal(patchFor({ type: 'RENEWAL', product_id: 'pf_ai_monthly', expiration_at_ms: 1 })?.tier, 'ai');
});

test('cancelar só desliga a renovação; expirar tira o acesso', () => {
  assert.equal(patchFor({ type: 'CANCELLATION', product_id: 'pf_basic_monthly', expiration_at_ms: 9 })?.status, 'canceled');
  assert.equal(patchFor({ type: 'EXPIRATION', product_id: 'pf_basic_monthly', expiration_at_ms: 9 })?.status, 'expired');
  assert.equal(patchFor({ type: 'BILLING_ISSUE', product_id: 'pf_basic_monthly', expiration_at_ms: 9 })?.status, 'grace');
});

test('troca de plano usa o produto novo', () => {
  const p = patchFor({ type: 'PRODUCT_CHANGE', product_id: 'pf_basic_monthly', new_product_id: 'pf_ai_monthly', expiration_at_ms: 9 });
  assert.equal(p?.tier, 'ai');
  assert.equal(p?.product_id, 'pf_ai_monthly');
});

test('eventos que não mudam o acesso são ignorados', () => {
  for (const type of ['TEST', 'TRANSFER', 'SUBSCRIPTION_PAUSED', 'ALGO_NOVO']) {
    assert.equal(patchFor({ type, product_id: 'pf_basic_monthly' }), null);
  }
  assert.equal(patchFor({ type: 'RENEWAL', product_id: 'produto_desconhecido' }), null);
});

test('segredo do webhook', () => {
  assert.equal(validSecret('Bearer abc123', 'abc123'), true);
  assert.equal(validSecret('abc123', 'abc123'), true);
  assert.equal(validSecret('abc124', 'abc123'), false);
  assert.equal(validSecret(null, 'abc123'), false);
  assert.equal(validSecret('abc123', undefined), false);
  assert.equal(validSecret('abc', 'abc123'), false);
});
