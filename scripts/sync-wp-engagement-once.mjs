// Run as an independent scheduled job, not inside the payment worker.
const origin = new URL(process.env.SITE_ANALYTICS_ORIGIN || 'http://127.0.0.1:3000');
if (origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('HTTPS required');
if (!process.env.SYSTEM_API_KEY) throw new Error('SYSTEM_API_KEY required');
const response = await fetch(new URL('/api/cron/sync-wp-engagement?take=10', origin), {
  method: 'POST', headers: { 'x-system-key': process.env.SYSTEM_API_KEY },
  signal: AbortSignal.timeout(225000), redirect: 'error',
});
if (!response.ok) throw new Error(`WordPress engagement sync returned HTTP ${response.status}`);
const result = await response.json();
console.log(JSON.stringify({ scanned: result.scanned, success: result.success, failed: result.failed, moviesUpdated: result.moviesUpdated }));
if (result.failed > 0) process.exitCode = 1;
