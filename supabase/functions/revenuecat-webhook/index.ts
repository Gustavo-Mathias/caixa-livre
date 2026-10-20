/**
 * Recebe os avisos do RevenueCat e atualiza o plano do perfil em `subscriptions`.
 *
 * Configuração no painel do RevenueCat (Integrations > Webhooks):
 *   URL: https://<projeto>.supabase.co/functions/v1/revenuecat-webhook
 *   Authorization header: Bearer <o mesmo valor de REVENUECAT_WEBHOOK_SECRET>
 *
 * Segredos da função: REVENUECAT_WEBHOOK_SECRET e a chave secreta do projeto
 * (SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY).
 * O RevenueCat espera 200; qualquer outro código dispara novas tentativas por cerca de 80 minutos.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { patchFor, validSecret, type RcEvent } from '../_shared/revenuecat.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!validSecret(req.headers.get('Authorization'), Deno.env.get('REVENUECAT_WEBHOOK_SECRET'))) {
    return json({ error: 'unauthorized' }, 401);
  }

  let event: RcEvent;
  try {
    event = (await req.json()).event;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!event?.type) return json({ error: 'invalid_event' }, 400);

  const patch = patchFor(event);
  if (!patch) return json({ ok: true, ignored: event.type });
  if (!event.app_user_id) return json({ error: 'missing_app_user_id' }, 400);

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
  if (!url || !key) return json({ error: 'server_not_configured' }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false } });

  // O app_user_id é o id do login; o perfil certo (PF ou PJ) vem do produto comprado.
  const { data: profile, error: findError } = await admin
    .from('profiles')
    .select('id')
    .eq('user_id', event.app_user_id)
    .eq('kind', patch.kind)
    .maybeSingle();
  if (findError) return json({ error: 'lookup_failed' }, 500);
  if (!profile) return json({ error: 'profile_not_found' }, 404);

  // Avisos podem chegar fora de ordem: só aplica se for mais novo que o último já aplicado.
  const { error: updateError } = await admin
    .from('subscriptions')
    .update({
      tier: patch.tier,
      status: patch.status,
      current_period_end: patch.current_period_end,
      store: patch.store,
      product_id: patch.product_id,
      last_event_ms: patch.last_event_ms,
      updated_at: new Date().toISOString(),
    })
    .eq('profile_id', profile.id)
    .lt('last_event_ms', patch.last_event_ms);
  if (updateError) return json({ error: 'update_failed' }, 500);

  return json({ ok: true });
});
