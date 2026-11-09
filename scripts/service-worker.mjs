// Invoke from the hosting scheduler every five minutes. Do not put the secret in URLs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
const origin = new URL(process.env.SERVICE_WORKER_ORIGIN || 'http://127.0.0.1:3000');
let secret = process.env.SERVICE_WORKER_SECRET;
if (!secret && process.env.SERVICE_WORKER_SECRET_FILE && path.isAbsolute(process.env.SERVICE_WORKER_SECRET_FILE)) {
  try { secret = readFileSync(process.env.SERVICE_WORKER_SECRET_FILE, 'utf8').trim(); }
  catch { throw new Error('Service worker secret file is unavailable'); }
}
if (!secret || secret.length < 32 || secret.length > 4096) throw new Error('SERVICE_WORKER_SECRET or its file must be configured');
if (origin.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(origin.hostname)) throw new Error('HTTPS required outside localhost');
const response = await fetch(new URL('/api/internal/service-worker', origin), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(290000), headers: { authorization: `Bearer ${secret}` } });
if (!response.ok) throw new Error(`Service worker failed: HTTP ${response.status}`);
const result = await response.json();
console.log(JSON.stringify(result));
// HTTP 200 means the job completed, but individual provider checks may still fail.
// Surface degraded runs to cron/Coolify as failures instead of a false green run.
if (result.paymentFailures > 0 || result.stripe?.failed > 0 || result.stripe?.configurationError || result.mail?.uncertain > 0) {
  throw new Error('Service worker completed with provider failures or uncertain delivery; inspect admin operations');
}
