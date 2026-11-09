/** One destination per tick; registry changes are picked up automatically. */
const origin=new URL(process.env.SITE_ANALYTICS_ORIGIN||'http://localhost:3318');
if(origin.protocol!=='https:' && !['localhost','127.0.0.1'].includes(origin.hostname))throw Error('HTTPS required');
if(!process.env.SYSTEM_API_KEY)throw Error('SYSTEM_API_KEY required');
let stopped=false;let current;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true;current?.abort();});
while(!stopped){
 current=new AbortController();const timeout=setTimeout(()=>current.abort(),65000);
 try{const response=await fetch(new URL('/api/cron/site-analytics',origin),{method:'POST',headers:{'x-system-key':process.env.SYSTEM_API_KEY},signal:current.signal,redirect:'error'});console.log('Analytics collector HTTP',response.status);}
 catch{if(!stopped)console.error('Analytics collector unavailable; retry next tick');}
 finally{clearTimeout(timeout);}
 for(let n=0;n<60&&!stopped;n++)await new Promise(resolve=>setTimeout(resolve,1000));
}
