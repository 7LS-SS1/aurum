// Isolated browser harness: fixture API only, no database or WordPress access.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {ActorPushPanel} from './src/components/admin/ActorPushPanel';
    const actors = Array.from({length:12},(_,i)=>({id:'a'+(i+1),name:'นักแสดงทดสอบ '+(i+1)}));
    createRoot(document.getElementById('root')).render(<ActorPushPanel actors={actors} totalActors={actors.length} sites={[{id:'fixture-site',name:'WordPress ทดสอบจำลอง'}]} />);`, resolveDir: root, loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  alias: { '@/lib/api-client': path.join(root, 'src/lib/api-client.ts') },
  define: { 'process.env.NODE_ENV': '"development"' },
});
const attempts = new Map();
const calls = [];
let preflightFails = false;
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
  if (req.url === '/fixture-state') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({calls})); return; }
  if (req.url === '/fixture-reset') { attempts.clear(); calls.length = 0; preflightFails = false; res.end('ok'); return; }
  if (req.url === '/fixture-preflight-fail') { preflightFails = true; res.end('ok'); return; }
  if (req.url?.startsWith('/api/actors/sync')) {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') {
      calls.push({method:'GET'}); res.statusCode = preflightFails ? 502 : 200;
      res.end(JSON.stringify(preflightFails ? {error:'ปลายทางไม่มี API นักแสดง'} : {ready:true})); return;
    }
    let body = ''; for await (const chunk of req) body += chunk;
    const id = JSON.parse(body).actorIds[0];
    const attempt = (attempts.get(id) ?? 0) + 1; attempts.set(id, attempt); calls.push({method:'POST', id, attempt});
    const status = id === 'a2' && attempt === 1 ? 'failed' : attempt > 1 ? 'skipped' : 'created';
    setTimeout(() => res.end(JSON.stringify({results:[{actorId:id,status,message:status === 'failed' ? 'จำลองข้อผิดพลาด' : undefined}]})), 500);
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><html lang="th"><meta charset="utf-8"><title>Actor Push UI fixture</title><style>body{font:16px sans-serif;background:#171717;color:#eee;padding:24px}button,select{padding:10px;margin:4px}label{line-height:2}progress{height:16px}</style><div id="root"></div><script src="/bundle.js"></script></html>');
});
server.listen(4317, '127.0.0.1', () => console.log('ACTOR_UI_FIXTURE http://127.0.0.1:4317'));
