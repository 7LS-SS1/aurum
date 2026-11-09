import { spawn } from 'node:child_process';

const database = process.env.SIMULATION_DATABASE_URL || 'postgresql://postgres:local-ads-test@127.0.0.1:55439/aurum_ads_test';
const target = new URL(database);
if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/aurum_ads_test') throw Error('Payment demo requires the isolated local aurum_ads_test database. Remote databases are not allowed.');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--port', '3007'], {
  stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', DATABASE_URL: database, AUTH_URL: 'http://localhost:3007', ADS_PAYMENT_MODE: 'simulation', ADS_PAYMENTS_ENABLED: 'false', SERVICE_EMAIL_ENABLED: 'false', ADS_PROMPTPAY_MODE: '', TWOC2P_MERCHANT_ID: '', TWOC2P_SECRET_KEY: '', ADS_PAYMENT_HOSTS: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', TWILIO_API_KEY: '', TWILIO_API_SECRET: '' },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
