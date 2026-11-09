// Run inside the built web image with --network none. No DB/provider credentials.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

assert.equal(process.cwd(), '/app', 'Container runtime only');
assert.ok(existsSync('/app/scripts/service-worker.mjs'), 'Scheduler missing from image');
assert.ok(!existsSync('/app/.env.local'), 'Local secrets must not be shipped');
assert.ok(!existsSync('/app/node_modules/ip'), 'Tracker dependency unexpectedly included in web image');
const cli = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', '--version'], { encoding: 'utf8', timeout: 30000 });
assert.equal(cli.status, 0, 'Prisma release CLI cannot load from the runtime image');
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: '3000', HOSTNAME: '127.0.0.1', DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:1/not_used', AUTH_SECRET: 'isolated-image-smoke-test-only-secret', ENCRYPTION_KEY: 'ab'.repeat(32), STRIPE_ENABLED: 'false', STRIPE_RECONCILIATION_ENABLED: 'false', SERVICE_EMAIL_ENABLED: 'false', SERVICE_WORKER_SECRET: '' },
  stdio: 'ignore',
});
try {
  let health;
  for (let i = 0; i < 40; i++) {
    try { health = await fetch('http://127.0.0.1:3000/api/health', { signal: AbortSignal.timeout(1000) }); if (health.ok) break; } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(health?.ok, 'Container server did not start');
  assert.equal((await health.json()).runtime, 'production');
  assert.equal((await fetch('http://127.0.0.1:3000/api/internal/service-worker', { method: 'POST' })).status, 401);
  assert.equal((await fetch('http://127.0.0.1:3000/api/stripe-orders')).status, 401);
  console.log('STRIPE_IMAGE_SMOKE_OK production boot, scheduler packaged, Prisma CLI, unauthenticated access denied, no tracker ip package');
} finally {
  server.kill('SIGTERM');
}
