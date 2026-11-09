import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
const url=new URL(process.env.DATABASE_URL||'http://invalid');
if(url.hostname!=='127.0.0.1'||url.pathname!=='/aurum_ads_test')throw Error('Disposable DB only');
const db=new PrismaClient(),base='http://localhost:3007';
try {
const email=randomUUID()+'@example.test';
const signup=await fetch(base+'/api/public/auth/register',{method:'POST',headers:{origin:base,'Content-Type':'application/json'},body:JSON.stringify({email,password:'Attachment-test-only-2026',displayName:'Attachment test'})});assert.equal(signup.status,201);
const cookie=signup.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWMInXk3dOZdBggFADAiBy1VU9MRAAAAAElFTkSuQmCC','base64');
const upload=body=>fetch(base+'/api/public/ads-attachments',{method:'POST',headers:{cookie,origin:base,'Content-Type':'image/png','X-File-Name':encodeURIComponent('ป้ายทดสอบ.png')},body});
assert.equal((await upload(Buffer.from('<script>bad</script>'))).status,422);
assert.equal((await upload(Buffer.alloc(20*1024*1024+1))).status,413);
const res=await upload(png);assert.equal(res.status,200,await res.clone().text());const file=await res.json();
const download=base+'/api/public/ads-attachments?id='+file.id;
assert.notEqual((await fetch(download)).status,200);
const loaded=await fetch(download,{headers:{cookie}});assert.equal(loaded.status,200);assert.deepEqual(Buffer.from(await loaded.arrayBuffer()),png);
const websiteId=(await db.servicePageConfig.findUniqueOrThrow({where:{id:'ads-banner'}})).config.websites.find(s=>s.enabled).id;
const data={websiteId,requestId:randomUUID(),kind:'slots',slots:['home_top:L2'],days:30,expectedAmount:1500,name:'Buyer',email,contact:'@test',targetUrl:'https://brand.example.test',attachments:[{slot:'home_top:L2',fileId:file.id,targetUrl:'https://brand.example.test'}],note:'',acceptedTerms:true};
const order=await fetch(base+'/api/public/ads-orders',{method:'POST',headers:{cookie,origin:base,'Content-Type':'application/json',Authorization:'Bearer '+randomBytes(32).toString('hex')},body:JSON.stringify(data)});assert.equal(order.status,201,await order.clone().text());assert.equal((await order.json()).order.quote.attachments[0].name,'ป้ายทดสอบ.png');
console.log('ADS_ATTACHMENTS_OK: real PNG bytes, MIME rejection, size boundary, authenticated download and per-slot order snapshot');
}finally{await db.$disconnect();}
