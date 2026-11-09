(function () {
  'use strict';
  var c = window.AurumMeasuredAnalytics;
  if (!c || navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  var visitor;
  try {
    var saved = JSON.parse(localStorage.getItem('aurum-analytics-visitor') || 'null');
    visitor = saved && saved.until > Date.now() ? saved.id : crypto.randomUUID();
    if (!saved || saved.until <= Date.now()) localStorage.setItem('aurum-analytics-visitor', JSON.stringify({id: visitor, until: Date.now() + 30 * 86400000}));
  } catch (_) { return; } // No storage permission: no tracking, not a newly invented visitor every page.
  document.cookie = 'aurum_analytics_visitor=' + visitor + ';path=/;max-age=2592000;SameSite=Lax' + (location.protocol === 'https:' ? ';Secure' : '');
  function send(kind) {
    return fetch(c.endpoint, {method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:kind,postId:c.postId,visitor:visitor})}).catch(function(){});
  }
  var visited=false;
  function visit(){if(!visited && document.visibilityState==='visible'){visited=true;send('visitor');}}
  visit();document.addEventListener('visibilitychange',visit);
  if (!c.postId) return;
  var sent=false;
  function bind(video) {
    if(video.dataset.aurumMeasured)return;
    video.dataset.aurumMeasured='1';
    var last=0, watched=0;
    video.addEventListener('timeupdate',function(){
      var now=performance.now();
      if(last && !video.paused && !video.seeking && document.visibilityState==='visible')watched+=Math.min((now-last)/1000,1);
      last=now;
      if(!sent && watched>=10){sent=true;send('view');}
    });
    ['pause','seeking','waiting'].forEach(function(name){video.addEventListener(name,function(){last=0;});});
    document.addEventListener('visibilitychange',function(){last=0;});
  }
  // Main players only. Never count hover previews, ads, iframe clicks or page loads as plays.
  function scan(){document.querySelectorAll('video[data-aurum-video], .video-player video, #video-player video, .wp-video video').forEach(function(v){if(!v.closest('[data-ad], .ad, .ads, .video-preview') && !v.loop)bind(v);});}
  scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
}());
