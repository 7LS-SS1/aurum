/**
 * Attaches the video source to the <video data-src="..."> tag rendered by
 * aurum_render_video_player() — mirrors the same HLS-detection logic used in
 * the AURUM Next.js app's VideoPlayer component: native HLS on Safari, hls.js
 * everywhere else, plain assignment for non-HLS sources.
 */
(function () {
	function attachSource(video) {
		var src = video.getAttribute('data-src');
		if (!src) return;

		var isHls = src.indexOf('.m3u8') !== -1;
		var canPlayNative = video.canPlayType('application/vnd.apple.mpegurl');

		if (!isHls || canPlayNative) {
			video.src = src;
			return;
		}

		if (window.Hls && window.Hls.isSupported()) {
			var hls = new window.Hls();
			hls.loadSource(src);
			hls.attachMedia(video);
		} else {
			video.src = src; // last-resort fallback
		}
	}

	document.querySelectorAll('.aurum-video-stage video[data-src]').forEach(attachSource);

	var toggle = document.querySelector('.aurum-nav-toggle');
	var nav = document.querySelector('.aurum-nav');
	if (toggle && nav) {
		toggle.addEventListener('click', function () {
			nav.classList.toggle('is-open');
		});
	}
})();
