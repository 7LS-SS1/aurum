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

	document.querySelectorAll('video[data-src]').forEach(attachSource);

	var toggle = document.querySelector('.aurum-nav-toggle');
	var nav = document.querySelector('.aurum-nav');
	if (toggle && nav) {
		toggle.addEventListener('click', function () {
			nav.classList.toggle('is-open');
		});
	}

	/**
	 * Custom control bar — same design/behavior as the AURUM Next.js app's own
	 * VideoPlayer component (progress seek, play/pause, ±10s skip, volume,
	 * time, speed menu, fullscreen, theater mode). Only applies to the
	 * direct/HLS video path; JWPlayer/iframe embeds ship their own controls.
	 */
	function formatTime(seconds) {
		seconds = Math.floor(seconds || 0);
		var m = Math.floor(seconds / 60);
		var s = seconds % 60;
		return m + ':' + (s < 10 ? '0' : '') + s;
	}

	function initVideoStage(stage) {
		var video = stage.querySelector('video');
		if (!video) return;

		var poster = stage.querySelector('[data-role="poster"]');
		var bigPlay = stage.querySelector('[data-role="big-play"]');
		var controls = stage.querySelector('[data-role="controls"]');
		var playBtn = stage.querySelector('[data-role="play-btn"]');
		var playIcon = stage.querySelector('[data-role="play-icon"]');
		var skipBack = stage.querySelector('[data-role="skip-back"]');
		var skipFwd = stage.querySelector('[data-role="skip-fwd"]');
		var muteBtn = stage.querySelector('[data-role="mute-btn"]');
		var volIcon = stage.querySelector('[data-role="vol-icon"]');
		var volumeInput = stage.querySelector('[data-role="volume"]');
		var progress = stage.querySelector('[data-role="progress"]');
		var filled = stage.querySelector('[data-role="filled"]');
		var knob = stage.querySelector('[data-role="knob"]');
		var curEl = stage.querySelector('[data-role="cur"]');
		var durEl = stage.querySelector('[data-role="dur"]');
		var speedToggle = stage.querySelector('[data-role="speed-toggle"]');
		var speedMenu = stage.querySelector('[data-role="speed-menu"]');
		var theaterToggle = stage.querySelector('[data-role="theater-toggle"]');
		var fullscreenToggle = stage.querySelector('[data-role="fullscreen-toggle"]');

		var PLAY_PATH = 'M8 5v14l11-7z';
		var PAUSE_PATH = 'M6 4h4v16H6zM14 4h4v16h-4z';
		var VOL_ON = '<path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" />';
		var VOL_OFF = '<path d="M11 5 6 9H2v6h4l5 4z" /><path d="M22 9l-6 6M16 9l6 6" fill="none" stroke="currentColor" stroke-width="2" />';

		function togglePlay() {
			if (video.paused) {
				video.play().catch(function () {});
			} else {
				video.pause();
			}
		}

		function setPlayIcon(playing) {
			if (playIcon) playIcon.outerHTML = '<svg data-role="play-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="' + (playing ? PAUSE_PATH : PLAY_PATH) + '" /></svg>';
			playIcon = stage.querySelector('[data-role="play-icon"]');
		}

		video.addEventListener('play', function () {
			setPlayIcon(true);
			if (poster) poster.classList.add('hidden');
		});
		video.addEventListener('pause', function () {
			setPlayIcon(false);
		});
		video.addEventListener('ended', function () {
			setPlayIcon(false);
			if (poster) poster.classList.remove('hidden');
		});
		video.addEventListener('timeupdate', function () {
			if (!video.duration) return;
			var pct = (video.currentTime / video.duration) * 100;
			if (filled) filled.style.width = pct + '%';
			if (knob) knob.style.left = pct + '%';
			if (curEl) curEl.textContent = formatTime(video.currentTime);
		});
		video.addEventListener('loadedmetadata', function () {
			if (durEl) durEl.textContent = formatTime(video.duration);
		});

		if (bigPlay) bigPlay.addEventListener('click', togglePlay);
		if (playBtn) playBtn.addEventListener('click', togglePlay);

		if (skipBack) {
			skipBack.addEventListener('click', function () {
				video.currentTime = Math.max(0, video.currentTime - 10);
			});
		}
		if (skipFwd) {
			skipFwd.addEventListener('click', function () {
				video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
			});
		}

		if (progress) {
			progress.addEventListener('click', function (e) {
				if (!video.duration) return;
				var rect = progress.getBoundingClientRect();
				var pct = (e.clientX - rect.left) / rect.width;
				video.currentTime = pct * video.duration;
			});
		}

		function updateVolIcon() {
			if (!volIcon) return;
			volIcon.outerHTML = '<svg data-role="vol-icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">' + (video.muted || video.volume === 0 ? VOL_OFF : VOL_ON) + '</svg>';
			volIcon = stage.querySelector('[data-role="vol-icon"]');
		}
		if (muteBtn) {
			muteBtn.addEventListener('click', function () {
				video.muted = !video.muted;
				if (volumeInput) volumeInput.value = video.muted ? 0 : video.volume;
				updateVolIcon();
			});
		}
		if (volumeInput) {
			volumeInput.addEventListener('input', function () {
				var v = parseFloat(volumeInput.value);
				video.volume = v;
				video.muted = v === 0;
				updateVolIcon();
			});
		}

		if (speedToggle && speedMenu) {
			speedToggle.addEventListener('click', function (e) {
				e.stopPropagation();
				speedMenu.classList.toggle('open');
			});
			speedMenu.querySelectorAll('[data-speed]').forEach(function (btn) {
				btn.addEventListener('click', function () {
					video.playbackRate = parseFloat(btn.getAttribute('data-speed'));
					speedMenu.querySelectorAll('button').forEach(function (b) {
						b.classList.remove('sel');
					});
					btn.classList.add('sel');
					speedMenu.classList.remove('open');
				});
			});
			document.addEventListener('click', function () {
				speedMenu.classList.remove('open');
			});
		}

		if (theaterToggle) {
			theaterToggle.addEventListener('click', function () {
				stage.classList.toggle('theater');
			});
		}
		if (fullscreenToggle) {
			fullscreenToggle.addEventListener('click', function () {
				if (!document.fullscreenElement) {
					(stage.requestFullscreen || stage.webkitRequestFullscreen || function () {}).call(stage);
				} else {
					document.exitFullscreen();
				}
			});
		}

		// Touch devices have no :hover — tapping the stage toggles the bar.
		stage.addEventListener('click', function (e) {
			if (e.target === video && controls) {
				controls.classList.toggle('show');
			}
		});
	}

	document.querySelectorAll('[data-role="video-stage"]').forEach(initVideoStage);

	// Everything below only runs on the single video page — aurumData is
	// localized (wp_localize_script) exclusively there, see functions.php.
	if (typeof window.aurumData === 'undefined') return;

	var restUrl = window.aurumData.restUrl;
	var postId = window.aurumData.postId;

	function postJson(path) {
		return fetch(restUrl + path, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'X-WP-Nonce': window.aurumData.nonce },
		}).then(function (res) {
			return res.json();
		});
	}

	// View beacon — fired once per page load; the server also rate-limits by
	// IP+post so a refresh within the window doesn't inflate the count.
	postJson('/posts/' + postId + '/view').then(function (data) {
		var el = document.querySelector('[data-role="view-count-number"]');
		if (el && typeof data.views === 'number') {
			el.textContent = new Intl.NumberFormat().format(data.views);
		}
	}).catch(function () {});

	// Like / dislike buttons.
	document.querySelectorAll('.aurum-reaction-btn[data-reaction]').forEach(function (btn) {
		btn.addEventListener('click', function () {
			postJson('/posts/' + postId + '/reaction?type=' + btn.getAttribute('data-reaction'))
				.then(function (data) {
					var likeEl = document.querySelector('[data-role="like-count"]');
					var dislikeEl = document.querySelector('[data-role="dislike-count"]');
					if (likeEl) likeEl.textContent = new Intl.NumberFormat().format(data.likes);
					if (dislikeEl) dislikeEl.textContent = new Intl.NumberFormat().format(data.dislikes);
					document.querySelectorAll('.aurum-reaction-btn').forEach(function (b) {
						b.classList.toggle('is-active', b.getAttribute('data-reaction') === data.reaction);
					});
				})
				.catch(function () {});
		});
	});

	// Share popup.
	var shareToggle = document.querySelector('[data-role="share-toggle"]');
	var shareMenu = document.querySelector('[data-role="share-menu"]');
	if (shareToggle && shareMenu) {
		shareToggle.addEventListener('click', function (e) {
			e.stopPropagation();
			shareMenu.hidden = !shareMenu.hidden;
		});
		document.addEventListener('click', function () {
			shareMenu.hidden = true;
		});
		shareMenu.querySelectorAll('[data-share]').forEach(function (el) {
			el.addEventListener('click', function (e) {
				e.preventDefault();
				var url = window.location.href;
				var type = el.getAttribute('data-share');
				var shareLinks = {
					facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url),
					line: 'https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(url),
					x: 'https://twitter.com/intent/tweet?url=' + encodeURIComponent(url),
				};
				if (type === 'copy') {
					if (navigator.clipboard && navigator.clipboard.writeText) {
						navigator.clipboard.writeText(url);
					}
				} else if (shareLinks[type]) {
					window.open(shareLinks[type], '_blank', 'width=600,height=520');
				}
				shareMenu.hidden = true;
			});
		});
	}

	// Expandable description.
	var descToggle = document.querySelector('[data-role="desc-toggle"]');
	var descBody = document.querySelector('[data-role="desc-body"]');
	if (descToggle && descBody) {
		descToggle.addEventListener('click', function () {
			var open = descBody.classList.toggle('is-open');
			descToggle.textContent = open ? 'แสดงน้อยลง' : '...เพิ่มเติม';
		});
	}
})();
