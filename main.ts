// Deno Deploy entry point for `cloudflare/greedy`.
//
// The webhook contract and its HMAC live in ./src/webhook.ts (pure and runtime-agnostic — it uses
// only WebCrypto, so the file is shared verbatim with the Cloudflare starter); the engine wiring
// lives in ./src/strategy.ts. This file is the HTTP glue.
//
// Note the warm-up below. A cold V8 isolate spends ~17 ms JIT-compiling the engine bundle on its
// first search and ~0.4 ms on every one after — a 40x difference that on Cloudflare's free plan
// exceeded the 10 ms per-request budget and failed 17% of turns. Deno Deploy documents no
// per-request CPU cap, so it would merely be slow here; running one throwaway search at module
// scope moves that cost into isolate start-up, before any turn is on the clock.
import { handleDelivery } from './src/webhook.ts';
import { chooseMoves, WARMUP_DFEN } from './src/strategy.ts';

const warmupStarted = performance.now();
chooseMoves(WARMUP_DFEN);
console.log(`[cloudflare/greedy] engine warm in ${(performance.now() - warmupStarted).toFixed(1)} ms`);

const SECRET = Deno.env.get('DICECHESS_WEBHOOK_SECRET') ?? '';
if (!SECRET) console.warn('[cloudflare/greedy] DICECHESS_WEBHOOK_SECRET is unset — turns will be rejected');

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json(200, { status: 'ok', bot: 'cloudflare/greedy' });

  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const now = Math.floor(Date.now() / 1000);
  const { status, body } = await handleDelivery(headers, rawBody, SECRET, chooseMoves, now);
  return json(status, body);
});
