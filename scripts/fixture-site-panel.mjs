// Inert, disabled local UI fixtures. No outbound requests or usable credentials.
import {PrismaClient} from '@prisma/client';
import {randomBytes,createCipheriv} from 'node:crypto';
const url=new URL(process.env.DATABASE_URL||'http://invalid');if(url.hostname!=='127.0.0.1'||url.pathname!=='/aurum_ads_test')throw Error('Local test DB only');
const db=new PrismaClient();
try {
 if(process.argv.includes('--cleanup')){
  await db.targetSite.deleteMany({where:{id:'ui-panel-video-fixture',baseUrl:'https://video-panel.invalid'}});
  await db.comicTargetSite.deleteMany({where:{id:'ui-panel-comic-fixture',baseUrl:'https://comic-panel.invalid'}});
 }else{
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',randomBytes(32),iv),enc=Buffer.concat([cipher.update('inert-test'),cipher.final()]);
  const data={credentialEnc:enc.toString('base64'),credentialIv:iv.toString('hex'),credentialTag:cipher.getAuthTag().toString('hex'),isActive:false};
  await db.targetSite.create({data:{...data,id:'ui-panel-video-fixture',name:'เว็บไซต์วิดีโอ · ทดสอบ UI',baseUrl:'https://video-panel.invalid'}});
  await db.comicTargetSite.create({data:{...data,id:'ui-panel-comic-fixture',name:'เว็บไซต์คอมมิค · ทดสอบ UI',baseUrl:'https://comic-panel.invalid'}});
 }
}finally{await db.$disconnect();}
