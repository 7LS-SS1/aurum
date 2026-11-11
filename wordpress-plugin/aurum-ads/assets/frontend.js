/* AURUM Ads: the content player is only created after the ordered ad queue. */
(function () {
  "use strict";
  const safeUrl = value => { try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; } };
  function activeSlots(data) {
    if (!data || Date.parse(data.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(data.expiresAt))) return [];
    const slots = Array.isArray(data.slots) ? data.slots : [];
    return slots.filter(s => s.state === "active" && s.media && Date.parse(s.media.endsAt) > Date.now() && safeUrl(s.media.url) && safeUrl(s.media.targetUrl) && slots.filter(other => other.id === s.id).length === 1);
  }
  function videoQueue(data) {
    return activeSlots(data).filter(s => /^video_ad:[123]$/.test(s.id) && s.media.kind === "video").sort((a,b) => Number(a.id.split(":")[1])-Number(b.id.split(":")[1])).slice(0,3);
  }
  // Also used by the local runtime tests, without requiring a browser.
  if (typeof module !== "undefined" && module.exports) { module.exports = { activeSlots, videoQueue }; return; }
  function insertZones() {
    const options = window.aurumAdsPlacement || {};
    const ensure = (name, target, position) => {
      if (!target || document.querySelector('[data-aurum-ads-zone="' + name + '"]')) return;
      const node = document.createElement("div"); node.className = "aurum-ads-zone"; node.dataset.aurumAdsZone = name;
      target.insertAdjacentElement(position, node);
    };
    if (options.home) {
      const main = document.querySelector('main, #main, .site-main, [role="main"]');
      ensure("home_top", main, "afterbegin"); ensure("home_bottom", main, "beforeend");
    }
    if (options.single) {
      const candidates = document.querySelectorAll('[data-ads-banner-video-target], .aurum-ads-gate, .video-player, .player-wrapper, .video-wrapper, .player-container, .wp-block-video, .wp-video, .video-js, .plyr, .player, main video, main iframe');
      const player = Array.from(candidates).find(node => !node.closest('.aurum-ads-zone, .rtb-banner, [data-preview], [data-video-preview], .card__poster, .card__preview, .post-thumbnail, .video-preview, .video-thumbnail, .thumbnail, .preview'));
      ensure("video_top", player, "beforebegin"); ensure("video_bottom", player, "afterend");
    }
  }
  async function manifest() {
    const r = await fetch(window.aurumAdsEndpoint, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("ads_unavailable");
    return r.json();
  }
  function banners(data) {
    const slots = activeSlots(data);
    document.querySelectorAll("[data-aurum-ads-zone]").forEach(zone => {
      if (zone.dataset.dismissed) return;
      zone.replaceChildren();
      const placement = zone.dataset.aurumAdsZone;
      slots.filter(s => s.id.split(":")[0] === placement && s.media.kind === "image").forEach(s => {
        const link = document.createElement("a"), image = document.createElement("img");
        link.href = safeUrl(s.media.targetUrl); link.target = "_blank"; link.rel = "sponsored noopener noreferrer";
        image.src = safeUrl(s.media.url); image.alt = "โฆษณา"; image.loading = "lazy";
        link.append(image); zone.append(link);
      });
      if (zone.children.length && /^(popup|fixed_)/.test(placement)) {
        const close = document.createElement("button"); close.type = "button"; close.className = "aurum-ads-close"; close.textContent = "×"; close.setAttribute("aria-label", "ปิดโฆษณา");
        close.onclick = () => { zone.dataset.dismissed = "1"; zone.replaceChildren(); }; zone.append(close);
      }
    });
  }
  async function start(gate) {
    if (gate.dataset.started) return;
    gate.dataset.started = "1";
    const startButton = gate.querySelector("button"); startButton.disabled = true; startButton.textContent = "กำลังเตรียมวิดีโอ…";
    let queue = [];
    try { queue = videoQueue(await manifest()); } catch { /* Content remains accessible when ads are unavailable. */ }
    const content = () => {
      gate.replaceChildren();
      const iframe = gate.dataset.contentKind === "iframe";
      const player = document.createElement(iframe ? "iframe" : "video");
      const url = safeUrl(gate.dataset.contentUrl);
      if (!url) { gate.textContent = "URL วิดีโอไม่ถูกต้อง"; return; }
      player.src = url;
      if (iframe) { player.title = "วิดีโอหลัก"; player.allowFullscreen = true; player.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture"; }
      else { player.controls = true; player.playsInline = true; player.poster = safeUrl(gate.dataset.poster) || ""; }
      gate.append(player);
      if (!iframe) player.play().catch(() => {});
      gate.dispatchEvent(new CustomEvent("aurum-ads-complete", { bubbles: true }));
    };
    let index = 0;
    function next() {
      if (!gate.isConnected) return;
      const slot = queue[index++];
      if (!slot) { content(); return; }
      if (Date.parse(slot.media.endsAt) <= Date.now()) { next(); return; }
      gate.replaceChildren();
      const ad = document.createElement("video"), skip = document.createElement("button"), label = document.createElement("span"), link = document.createElement("a");
      ad.controls = true; ad.playsInline = true; ad.preload = "auto"; ad.src = safeUrl(slot.media.url);
      label.className = "aurum-ads-label"; label.textContent = "โฆษณาลำดับ " + slot.id.split(":")[1];
      skip.type = "button"; skip.className = "aurum-ads-skip"; skip.textContent = "ข้าม →";
      link.className = "aurum-ads-visit"; link.textContent = "ดูรายละเอียด ↗"; link.href = safeUrl(slot.media.targetUrl); link.target = "_blank"; link.rel = "sponsored noopener noreferrer";
      gate.append(ad, label, link, skip);
      let finished = false;
      let timer;
      const advance = () => {
        if (finished) return; finished = true; clearTimeout(timer);
        ad.removeEventListener("ended", advance); ad.removeEventListener("error", advance);
        ad.pause(); ad.removeAttribute("src"); ad.load(); next();
      };
      timer = setTimeout(advance, 20000);
      ad.addEventListener("playing", () => clearTimeout(timer), { once: true });
      ad.addEventListener("ended", advance); ad.addEventListener("error", advance); skip.onclick = advance;
      ad.play().catch(() => { clearTimeout(timer); label.textContent += " · กดเล่นเพื่อเริ่ม"; });
    }
    next();
  }
  document.querySelectorAll(".aurum-ads-gate").forEach(gate => gate.querySelector(".aurum-ads-start")?.addEventListener("click", () => start(gate)));
  async function refresh() { insertZones(); try { banners(await manifest()); } catch { banners(null); } }
  void refresh();
  setInterval(refresh, 30000);
})();
