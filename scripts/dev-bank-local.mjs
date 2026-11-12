import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

// Never inherit production application configuration into this local fixture.
const env = { ...process.env };
for (const file of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  if (!existsSync(file)) continue;
  for (const match of readFileSync(file, 'utf8').matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) env[match[1]] = '';
}
for (const key of Object.keys(env)) if (/^(DATABASE|DIRECT_URL|AUTH_|NEXTAUTH|R2_|ADS_|BUNNY_|STRIPE_|TWOC2P_|TWILIO_|RESEND_|CLOUDFLARE_|UPSTASH_|REDIS_|SERVICE_|SYSTEM_API_KEY|MANAGEMENT_|PUBLIC_APP_|NEXT_PUBLIC_)/.test(key)) env[key] = '';
Object.assign(env, {
  DATABASE_URL: 'postgresql://postgres:bank-local-only@127.0.0.1:55448/aurum_bank_local',
  NODE_ENV: 'development', AUTH_URL: 'http://localhost:3323',
  AUTH_SECRET: 'local-bank-demo-only-secret-not-for-production-20261111',
  ENCRYPTION_KEY: '11'.repeat(32),
  ADS_UPLOAD_STORAGE: 'local', ADS_UPLOAD_DIR: path.resolve('artifacts/bank-local-uploads'),
  ADS_PAYMENT_MODE: '', ADS_PAYMENTS_ENABLED: 'false', SERVICE_EMAIL_ENABLED: 'false',
  MANAGEMENT_HOST_ENABLED: 'false', AURUM_PREVIEW_BUILD: 'true',
});
const command = process.argv[2];
const args = command === 'schema' ? ['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate']
  : command === 'test' ? ['scripts/test-bank-local.mjs']
  : ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3323'];
const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
child.on('exit', code => { process.exitCode = code ?? 1; });
