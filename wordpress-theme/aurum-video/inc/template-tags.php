<?php
/**
 * Template helper functions: reading AURUM's video meta, rendering the
 * player, and the grid-card partial shared by every archive-type template.
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Normalizes AURUM's video meta for a post: prefers the `aurum_*` prefixed
 * key, falls back to the legacy unprefixed alias, then to an empty string.
 *
 * @param int $post_id Post ID.
 * @return array{provider:string,iframe_url:string,video_url:string,thumbnail_url:string,preview_url:string,jwplayer_media_id:string}
 */
function aurum_get_video_meta( $post_id ) {
	$pick = function ( $preferred_key, $legacy_key ) use ( $post_id ) {
		$value = get_post_meta( $post_id, $preferred_key, true );
		if ( '' !== $value && null !== $value ) {
			return (string) $value;
		}
		$legacy = get_post_meta( $post_id, $legacy_key, true );
		return $legacy ? (string) $legacy : '';
	};

	return array(
		'provider'          => $pick( 'aurum_provider', 'video_provider' ),
		'iframe_url'        => $pick( 'aurum_iframe_url', 'iframe_url' ),
		'video_url'         => $pick( 'aurum_video_url', 'video_url' ),
		'thumbnail_url'     => $pick( 'aurum_thumbnail_url', 'thumbnail_url' ),
		'preview_url'       => $pick( 'aurum_preview_url', 'preview_url' ),
		'jwplayer_media_id' => $pick( 'aurum_jwplayer_media_id', 'jwplayer_media_id' ),
	);
}

/**
 * Removes the `<!-- aurum-video -->` embed block that distributor.ts injects
 * directly into post_content as a plain-HTML fallback — the theme renders
 * its own player from post meta instead, so this avoids showing the video
 * embed twice on the single post page.
 *
 * @param string $content Raw post content (before the_content filters).
 * @return string
 */
function aurum_strip_embedded_video_block( $content ) {
	$pattern = '/<!--\s*aurum-video\s*-->.*?<div class="aurum-video">.*?<\/div>/is';
	return preg_replace( $pattern, '', $content );
}

/**
 * Renders the video player for a single post: an <iframe> when an iframe URL
 * is available (JWPlayer, or any provider AURUM already resolved server-side
 * into an embeddable URL), otherwise a native <video> tag for a direct/HLS
 * source. Falls back to a plain message when neither is present.
 *
 * @param int $post_id Post ID.
 */
function aurum_render_video_player( $post_id ) {
	$meta = aurum_get_video_meta( $post_id );

	if ( ! empty( $meta['iframe_url'] ) ) {
		echo '<div class="aurum-video-stage">';
		printf(
			'<iframe src="%s" title="%s" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>',
			esc_url( $meta['iframe_url'] ),
			esc_attr( get_the_title( $post_id ) )
		);
		echo '</div>';
		return;
	}

	if ( empty( $meta['video_url'] ) ) {
		echo '<div class="aurum-video-stage"><div class="aurum-video-missing">' . esc_html__( 'ยังไม่มีวิดีโอสำหรับเรื่องนี้', 'aurum-video' ) . '</div></div>';
		return;
	}

	// Direct/HLS source — custom control bar (progress/play/skip/volume/speed/
	// theater/fullscreen), the same design as the AURUM Next.js app's own
	// VideoPlayer component (src/components/public/VideoPlayer.tsx), not the
	// browser's native <video controls>. JWPlayer/iframe embeds above already
	// ship their own controls, so this path only applies here.
	$poster = $meta['thumbnail_url'];
	?>
	<div class="video-stage" id="aurum-stage-<?php echo (int) $post_id; ?>" data-role="video-stage">
		<video
			id="aurum-video-<?php echo (int) $post_id; ?>"
			playsinline
			preload="metadata"
			<?php echo $poster ? 'poster="' . esc_url( $poster ) . '"' : ''; ?>
			data-src="<?php echo esc_url( $meta['video_url'] ); ?>"
		></video>

		<div class="poster-fb" data-role="poster">
			<button class="big-play" type="button" data-role="big-play" aria-label="<?php esc_attr_e( 'เล่น', 'aurum-video' ); ?>">
				<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
			</button>
		</div>

		<div class="controls" data-role="controls">
			<div class="progress" data-role="progress">
				<div class="filled" data-role="filled"></div>
				<div class="knob" data-role="knob"></div>
			</div>
			<div class="ctrl-row">
				<button class="cbtn" type="button" data-role="play-btn" aria-label="<?php esc_attr_e( 'เล่น/หยุด', 'aurum-video' ); ?>">
					<svg data-role="play-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
				</button>
				<button class="cbtn" type="button" data-role="skip-back" aria-label="<?php esc_attr_e( 'ถอย 10 วิ', 'aurum-video' ); ?>">
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>
				</button>
				<button class="cbtn" type="button" data-role="skip-fwd" aria-label="<?php esc_attr_e( 'ไป 10 วิ', 'aurum-video' ); ?>">
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 17l5-5-5-5M6 17l5-5-5-5" /></svg>
				</button>
				<div class="vol">
					<button class="cbtn" type="button" data-role="mute-btn" aria-label="<?php esc_attr_e( 'เสียง', 'aurum-video' ); ?>">
						<svg data-role="vol-icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
							<path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" />
						</svg>
					</button>
					<input type="range" data-role="volume" min="0" max="1" step="0.05" value="1" aria-label="<?php esc_attr_e( 'ระดับเสียง', 'aurum-video' ); ?>" />
				</div>
				<span class="time"><span data-role="cur">0:00</span> / <span data-role="dur">0:00</span></span>
				<span class="spacer"></span>
				<div class="menu">
					<button class="cbtn" type="button" data-role="speed-toggle" aria-label="<?php esc_attr_e( 'ความเร็ว', 'aurum-video' ); ?>" title="<?php esc_attr_e( 'ความเร็ว', 'aurum-video' ); ?>">
						<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M12 22a9 9 0 1 0-9-9" /><path d="M12 7v5l3 2" /><path d="M3 13H1" />
						</svg>
					</button>
					<div class="menu-pop" data-role="speed-menu">
						<div class="mt"><?php esc_html_e( 'ความเร็ว', 'aurum-video' ); ?></div>
						<button type="button" data-speed="0.5">0.5x</button>
						<button type="button" data-speed="0.75">0.75x</button>
						<button type="button" class="sel" data-speed="1"><?php esc_html_e( 'ปกติ', 'aurum-video' ); ?></button>
						<button type="button" data-speed="1.25">1.25x</button>
						<button type="button" data-speed="1.5">1.5x</button>
						<button type="button" data-speed="2">2x</button>
					</div>
				</div>
				<button class="cbtn" type="button" data-role="theater-toggle" aria-label="<?php esc_attr_e( 'โหมดโรงภาพยนตร์', 'aurum-video' ); ?>" title="<?php esc_attr_e( 'โหมดโรงภาพยนตร์', 'aurum-video' ); ?>">
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2" /></svg>
				</button>
				<button class="cbtn" type="button" data-role="fullscreen-toggle" aria-label="<?php esc_attr_e( 'เต็มจอ', 'aurum-video' ); ?>" title="<?php esc_attr_e( 'เต็มจอ', 'aurum-video' ); ?>">
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3" /></svg>
				</button>
			</div>
		</div>
	</div>
	<?php
}

/**
 * Renders one grid card for the loop templates (index/archive/category/tag/search).
 */
function aurum_video_card() {
	$post_id       = get_the_ID();
	$meta          = aurum_get_video_meta( $post_id );
	$thumbnail_url = has_post_thumbnail( $post_id )
		? get_the_post_thumbnail_url( $post_id, 'medium_large' )
		: $meta['thumbnail_url'];
	?>
	<a class="aurum-card" href="<?php the_permalink(); ?>">
		<div class="aurum-card-thumb">
			<?php if ( $thumbnail_url ) : ?>
				<img src="<?php echo esc_url( $thumbnail_url ); ?>" alt="<?php the_title_attribute(); ?>" loading="lazy" />
			<?php endif; ?>
		</div>
		<div class="aurum-card-title"><?php the_title(); ?></div>
		<div class="aurum-card-meta">
			<?php echo esc_html( get_the_date() ); ?>
			<?php
			$categories = get_the_category();
			if ( ! empty( $categories ) ) {
				echo ' &middot; ' . esc_html( $categories[0]->name );
			}
			?>
		</div>
	</a>
	<?php
}
