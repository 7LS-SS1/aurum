const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const { videoQueue } = require('../assets/frontend.js');
const future = new Date(Date.now()+600000).toISOString();
const ad = n => ({id:`video_ad:${n}`,state:'active',media:{kind:'video',url:`https://media.example/${n}.mp4`,targetUrl:'https://advertiser.example/',endsAt:future}});
const manifest = {expiresAt:future,slots:[ad(3),ad(1),ad(2),ad(4)]};
assert.deepEqual(videoQueue(manifest).map(a=>a.id),['video_ad:1','video_ad:2','video_ad:3']);
assert.equal(videoQueue({...manifest,expiresAt:'invalid'}).length,0);
assert.equal(videoQueue({...manifest,slots:[ad(1),ad(1)]}).length,0);
async function runtime() {
 const dom = new JSDOM('<div class="aurum-ads-gate" data-content-url="https://content.example/main.mp4" data-content-kind="video"><button class="aurum-ads-start">Play</button></div>',{url:'https://wordpress.example',runScripts:'outside-only'});
 const w=dom.window;
 w.aurumAdsEndpoint='/wp-json/aurum-ads/v1/manifest';
 w.fetch=async()=>({ok:true,json:async()=>manifest});
 w.AbortSignal.timeout=()=>undefined;
 w.HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
 w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
 try {
  w.eval(fs.readFileSync(require.resolve('../assets/frontend.js'),'utf8'));
  const gate=w.document.querySelector('.aurum-ads-gate');
  assert.equal(gate.querySelector('video'),null);
  gate.querySelector('button').click();
  await new Promise(r=>setTimeout(r,20));
  assert.equal(gate.querySelector('video').src,'https://media.example/1.mp4');
  const first=gate.querySelector('video');
  first.dispatchEvent(new w.Event('ended'));
  assert.equal(gate.querySelector('video').src,'https://media.example/2.mp4');
  // A late duplicate event from the old player must not skip the next position.
  first.dispatchEvent(new w.Event('ended'));
  assert.equal(gate.querySelector('video').src,'https://media.example/2.mp4');
  gate.querySelector('.aurum-ads-skip').click();
  assert.equal(gate.querySelector('video').src,'https://media.example/3.mp4');
  gate.querySelector('video').dispatchEvent(new w.Event('ended'));
  assert.equal(gate.querySelector('video').src,'https://content.example/main.mp4');
  assert.equal(gate.querySelector('.aurum-ads-skip'),null);
  console.log('AURUM_ADS_SEQUENCE_OK: ended -> next, skip -> next, duplicate event ignored, content last');
 } finally {w.close();}
}
runtime().catch(e=>{console.error(e);process.exitCode=1;});
