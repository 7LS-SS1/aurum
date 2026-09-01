(function () {
  "use strict";

  var hlsLoader;

  function loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (hlsLoader) return hlsLoader;
    var config = window.AURUM_VIDEO_CORE || {};
    if (!config.hlsUrl) return Promise.reject(new Error("Missing HLS.js URL"));
    hlsLoader = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = config.hlsUrl;
      script.async = true;
      script.onload = function () { resolve(window.Hls); };
      script.onerror = function () { reject(new Error("Could not load HLS.js")); };
      document.head.appendChild(script);
    });
    return hlsLoader;
  }

  function hlsSource(video) {
    var source = video.querySelector('source[src]');
    if (!source) return "";
    var src = source.getAttribute("src") || "";
    try {
      return new URL(src, document.baseURI).pathname.toLowerCase().endsWith(".m3u8") ? src : "";
    } catch {
      return "";
    }
  }

  function enhance(video) {
    var src = hlsSource(video);
    if (!src || video.canPlayType("application/vnd.apple.mpegurl")) return;

    var activating = false;
    var activate = function (shouldPlay) {
      if (activating || video.__aurumHls) return;
      activating = true;
      video.pause();
      loadHls().then(function (Hls) {
        if (!Hls || !Hls.isSupported()) throw new Error("HLS.js is not supported");
        while (video.firstChild) video.removeChild(video.firstChild);
        video.removeAttribute("src");
        video.load();

        var hls = new Hls({
          autoStartLoad: true,
          startFragPrefetch: false,
          maxBufferLength: 30,
          maxMaxBufferLength: 60
        });
        video.__aurumHls = hls;
        hls.attachMedia(video);
        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
          hls.loadSource(src);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          if (shouldPlay) video.play().catch(function () {});
        });
      }).catch(function () {
        activating = false;
      });
    };

    // HLS.js and media bytes are not requested until explicit play intent.
    video.addEventListener("pointerdown", function (event) {
      if (event.button === 0) activate(true);
    }, { once: true, passive: true });
    video.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") activate(true);
    }, { once: true });
    video.addEventListener("play", function () { activate(true); }, { once: true });
  }

  document.querySelectorAll('video[data-aurum-video], .video-player video').forEach(enhance);
}());
