(function () {
  "use strict";

  var CSS = "__AURUM_PLAYER_CSS__";
  var SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  var ICONS = {
    play: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>',
    forward: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>',
    volume: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    muted: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M22 9l-6 6M16 9l6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    speed: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22a9 9 0 1 0-9-9"/><path d="M12 7v5l3 2"/><path d="M3 13H1"/></svg>',
    full: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/></svg>'
  };

  function boolAttr(el, name) {
    return (el.hasAttribute(name) && el.getAttribute(name) !== "false") || el[name] === true;
  }

  function formatTime(seconds) {
    seconds = Math.floor(seconds || 0);
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var rest = seconds % 60;
    if (hours) return hours + ":" + String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0");
    return minutes + ":" + String(rest).padStart(2, "0");
  }

  function isHlsUrl(src) {
    return /\.m3u8($|\?)/i.test(src || "");
  }

  function emit(host, name, detail) {
    host.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail: detail || {} }));
  }

  class AurumVideoPlayer extends HTMLElement {
    static get observedAttributes() {
      return ["src", "poster", "title", "autoplay", "muted", "preload"];
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.hls = null;
      this.lastTap = { time: 0, x: 0 };
      this.onKeyDown = this.onKeyDown.bind(this);
    }

    connectedCallback() {
      this.render();
      this.bind();
      this.loadSource();
      document.addEventListener("keydown", this.onKeyDown);
    }

    disconnectedCallback() {
      document.removeEventListener("keydown", this.onKeyDown);
      this.destroyHls();
    }

    attributeChangedCallback() {
      if (!this.video) return;
      this.syncAttributes();
      if (arguments[0] === "src") this.loadSource();
      if (arguments[0] === "poster") this.updatePoster();
      if (arguments[0] === "title") this.updateTitle();
    }

    render() {
      this.shadowRoot.innerHTML =
        "<style>" + CSS + "</style>" +
        '<div class="avp-stage is-paused" tabindex="0" part="stage">' +
        '  <video class="avp-video" part="video" playsinline></video>' +
        '  <div class="avp-poster" part="poster">' +
        '    <button class="avp-big-play" type="button" aria-label="Play video">' + ICONS.play + "</button>" +
        "  </div>" +
        '  <div class="avp-state" role="status"></div>' +
        '  <div class="avp-controls" part="controls">' +
        '    <div class="avp-progress" role="slider" tabindex="0" aria-label="Seek video" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="avp-track"><div class="avp-fill"></div></div><div class="avp-knob"></div></div>' +
        '    <div class="avp-row">' +
        '      <button class="avp-btn avp-play" type="button" aria-label="Play or pause">' + ICONS.play + "</button>" +
        '      <button class="avp-btn avp-back" type="button" aria-label="Back 10 seconds">' + ICONS.back + "</button>" +
        '      <button class="avp-btn avp-forward" type="button" aria-label="Forward 10 seconds">' + ICONS.forward + "</button>" +
        '      <div class="avp-volume"><button class="avp-btn avp-mute" type="button" aria-label="Mute">' + ICONS.volume + '</button><input class="avp-volume-range" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume"></div>' +
        '      <span class="avp-time"><span class="avp-current">0:00</span> / <span class="avp-duration">0:00</span></span>' +
        '      <span class="avp-title"></span>' +
        '      <div class="avp-menu"><button class="avp-btn avp-speed" type="button" aria-label="Playback speed">' + ICONS.speed + '</button><div class="avp-menu-pop"><span>Speed</span>' +
        SPEEDS.map(function (speed) {
          return '<button type="button" data-speed="' + speed + '" class="' + (speed === 1 ? "is-selected" : "") + '">' + (speed === 1 ? "Normal" : speed + "x") + "</button>";
        }).join("") +
        "      </div></div>" +
        '      <button class="avp-btn avp-full" type="button" aria-label="Fullscreen">' + ICONS.full + "</button>" +
        "    </div>" +
        "  </div>" +
        "</div>";

      this.stage = this.shadowRoot.querySelector(".avp-stage");
      this.video = this.shadowRoot.querySelector("video");
      this.poster = this.shadowRoot.querySelector(".avp-poster");
      this.state = this.shadowRoot.querySelector(".avp-state");
      this.playButton = this.shadowRoot.querySelector(".avp-play");
      this.bigPlay = this.shadowRoot.querySelector(".avp-big-play");
      this.muteButton = this.shadowRoot.querySelector(".avp-mute");
      this.volumeRange = this.shadowRoot.querySelector(".avp-volume-range");
      this.progress = this.shadowRoot.querySelector(".avp-progress");
      this.fill = this.shadowRoot.querySelector(".avp-fill");
      this.knob = this.shadowRoot.querySelector(".avp-knob");
      this.current = this.shadowRoot.querySelector(".avp-current");
      this.duration = this.shadowRoot.querySelector(".avp-duration");
      this.titleEl = this.shadowRoot.querySelector(".avp-title");
      this.speedMenu = this.shadowRoot.querySelector(".avp-menu-pop");
      this.syncAttributes();
      this.updatePoster();
      this.updateTitle();
    }

    bind() {
      this.bigPlay.addEventListener("click", () => { this.togglePlay(); });
      this.playButton.addEventListener("click", () => { this.togglePlay(); });
      this.shadowRoot.querySelector(".avp-back").addEventListener("click", () => { this.skip(-10); });
      this.shadowRoot.querySelector(".avp-forward").addEventListener("click", () => { this.skip(10); });
      this.muteButton.addEventListener("click", () => { this.toggleMute(); });
      this.volumeRange.addEventListener("input", () => { this.setVolume(parseFloat(this.volumeRange.value)); });
      this.progress.addEventListener("click", (event) => { this.seekFromEvent(event); });
      this.progress.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft") { event.preventDefault(); this.skip(-5); }
        if (event.key === "ArrowRight") { event.preventDefault(); this.skip(5); }
      });
      this.shadowRoot.querySelector(".avp-speed").addEventListener("click", (event) => {
        event.stopPropagation();
        this.speedMenu.classList.toggle("is-open");
      });
      this.speedMenu.querySelectorAll("[data-speed]").forEach((button) => {
        button.addEventListener("click", () => { this.setSpeed(parseFloat(button.getAttribute("data-speed"))); });
      });
      this.shadowRoot.querySelector(".avp-full").addEventListener("click", () => { this.toggleFullscreen(); });
      this.stage.addEventListener("click", (event) => {
        if (event.target === this.video) this.stage.classList.toggle("is-controls-visible");
      });
      this.stage.addEventListener("dblclick", (event) => { this.skipByPosition(event.clientX); });
      this.stage.addEventListener("touchend", (event) => { this.handleTap(event); }, { passive: true });
      document.addEventListener("click", () => { if (this.speedMenu) this.speedMenu.classList.remove("is-open"); });

      this.video.addEventListener("play", () => {
        this.stage.classList.remove("is-paused");
        this.poster.classList.add("is-hidden");
        this.playButton.innerHTML = ICONS.pause;
        emit(this, "aurum:play");
      });
      this.video.addEventListener("pause", () => {
        this.stage.classList.add("is-paused");
        this.playButton.innerHTML = ICONS.play;
        emit(this, "aurum:pause");
      });
      this.video.addEventListener("ended", () => {
        this.stage.classList.add("is-paused");
        this.poster.classList.remove("is-hidden");
        this.playButton.innerHTML = ICONS.play;
        emit(this, "aurum:ended");
      });
      this.video.addEventListener("loadedmetadata", () => { this.updateTime(); });
      this.video.addEventListener("durationchange", () => { this.updateTime(); });
      this.video.addEventListener("timeupdate", () => {
        this.updateTime();
        emit(this, "aurum:timeupdate", { currentTime: this.video.currentTime, duration: this.video.duration || 0 });
      });
      this.video.addEventListener("waiting", () => { this.showState("Loading..."); });
      this.video.addEventListener("canplay", () => { this.hideState(); });
      this.video.addEventListener("error", () => {
        this.showState("Video could not be loaded");
        emit(this, "aurum:error", { error: this.video.error });
      });
    }

    syncAttributes() {
      this.video.preload = this.getAttribute("preload") || "metadata";
      this.video.autoplay = boolAttr(this, "autoplay");
      this.video.muted = boolAttr(this, "muted");
      this.volumeRange.value = this.video.muted ? "0" : String(this.video.volume || 1);
      this.updateMuteIcon();
    }

    updatePoster() {
      var poster = this.getAttribute("poster");
      var existing = this.poster.querySelector("img");
      if (existing) existing.remove();
      if (poster) {
        var img = document.createElement("img");
        img.alt = "";
        img.src = poster;
        this.poster.prepend(img);
        this.video.poster = poster;
      } else {
        this.video.removeAttribute("poster");
      }
    }

    updateTitle() {
      var title = this.getAttribute("title") || "";
      this.titleEl.textContent = title;
      if (title) this.video.setAttribute("aria-label", title);
    }

    loadSource() {
      var src = this.getAttribute("src") || "";
      this.destroyHls();
      this.hideState();
      this.video.removeAttribute("src");
      this.video.load();
      if (!src) {
        this.showState("No video source");
        return;
      }
      if (!isHlsUrl(src) || this.video.canPlayType("application/vnd.apple.mpegurl")) {
        this.video.src = src;
        return;
      }
      if (window.Hls && window.Hls.isSupported()) {
        this.hls = new window.Hls();
        this.hls.loadSource(src);
        this.hls.attachMedia(this.video);
        return;
      }
      this.video.src = src;
    }

    destroyHls() {
      if (this.hls) {
        this.hls.destroy();
        this.hls = null;
      }
    }

    togglePlay() {
      if (this.video.paused) this.video.play().catch(() => {});
      else this.video.pause();
    }

    skip(delta) {
      var duration = this.video.duration || 0;
      this.video.currentTime = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, this.video.currentTime + delta));
    }

    skipByPosition(x) {
      var rect = this.stage.getBoundingClientRect();
      this.skip(x < rect.left + rect.width / 2 ? -10 : 10);
    }

    handleTap(event) {
      if (!event.changedTouches || !event.changedTouches[0]) return;
      var now = Date.now();
      var x = event.changedTouches[0].clientX;
      if (now - this.lastTap.time < 320 && Math.abs(x - this.lastTap.x) < 80) {
        this.skipByPosition(x);
        this.lastTap = { time: 0, x: 0 };
      } else {
        this.lastTap = { time: now, x: x };
      }
    }

    seekFromEvent(event) {
      if (!this.video.duration) return;
      var rect = this.progress.getBoundingClientRect();
      var pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      this.video.currentTime = pct * this.video.duration;
    }

    setVolume(value) {
      this.video.volume = Math.max(0, Math.min(1, value));
      this.video.muted = this.video.volume === 0;
      this.updateMuteIcon();
    }

    toggleMute() {
      this.video.muted = !this.video.muted;
      this.volumeRange.value = this.video.muted ? "0" : String(this.video.volume || 1);
      this.updateMuteIcon();
    }

    updateMuteIcon() {
      if (!this.muteButton) return;
      this.muteButton.innerHTML = this.video.muted || this.video.volume === 0 ? ICONS.muted : ICONS.volume;
    }

    setSpeed(speed) {
      this.video.playbackRate = speed;
      this.speedMenu.querySelectorAll("[data-speed]").forEach(function (button) {
        button.classList.toggle("is-selected", parseFloat(button.getAttribute("data-speed")) === speed);
      });
      this.speedMenu.classList.remove("is-open");
    }

    toggleFullscreen() {
      if (!document.fullscreenElement && this.stage.requestFullscreen) this.stage.requestFullscreen().catch(() => {});
      else if (document.exitFullscreen) document.exitFullscreen();
    }

    updateTime() {
      var duration = this.video.duration || 0;
      var current = this.video.currentTime || 0;
      var pct = duration ? current / duration * 100 : 0;
      this.fill.style.width = pct + "%";
      this.knob.style.left = pct + "%";
      this.current.textContent = formatTime(current);
      this.duration.textContent = formatTime(duration);
      this.progress.setAttribute("aria-valuenow", String(Math.round(pct)));
    }

    onKeyDown(event) {
      if (!this.stage || !this.shadowRoot.activeElement && !this.matches(":hover")) return;
      var tag = (event.target && event.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (event.key === " " || event.key.toLowerCase() === "k") { event.preventDefault(); this.togglePlay(); }
      if (event.key.toLowerCase() === "j" || event.key === "ArrowLeft") { event.preventDefault(); this.skip(-10); }
      if (event.key.toLowerCase() === "l" || event.key === "ArrowRight") { event.preventDefault(); this.skip(10); }
      if (event.key.toLowerCase() === "m") { event.preventDefault(); this.toggleMute(); }
      if (event.key.toLowerCase() === "f") { event.preventDefault(); this.toggleFullscreen(); }
    }

    showState(message) {
      this.state.textContent = message;
      this.state.classList.add("is-visible");
    }

    hideState() {
      this.state.textContent = "";
      this.state.classList.remove("is-visible");
    }
  }

  if (!customElements.get("aurum-video-player")) {
    customElements.define("aurum-video-player", AurumVideoPlayer);
  }
})();
