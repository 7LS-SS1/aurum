<?php
/**
 * Server-rendered player and progressive HLS enhancement.
 *
 * @package AurumVideoCore
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @return string */
function aurum_video_core_pick_meta( $post_id, $canonical, $legacy ) {
	$value = get_post_meta( $post_id, $canonical, true );
	if ( is_string( $value ) && '' !== trim( $value ) ) {
		return trim( $value );
	}
	$value = get_post_meta( $post_id, $legacy, true );
	return is_string( $value ) ? trim( $value ) : '';
}

/**
 * @return array{provider:string,video_url:string,iframe_url:string,thumbnail_url:string,preview_url:string,jwplayer_media_id:string}
 */
function aurum_video_core_get_meta( $post_id ) {
	return array(
		'provider'          => aurum_video_core_pick_meta( $post_id, 'aurum_provider', 'video_provider' ),
		'video_url'         => aurum_video_core_pick_meta( $post_id, 'aurum_video_url', 'video_url' ),
		'iframe_url'        => aurum_video_core_pick_meta( $post_id, 'aurum_iframe_url', 'iframe_url' ),
		'thumbnail_url'     => aurum_video_core_pick_meta( $post_id, 'aurum_thumbnail_url', 'thumbnail_url' ),
		'preview_url'       => aurum_video_core_pick_meta( $post_id, 'aurum_preview_url', 'preview_url' ),
		'jwplayer_media_id' => aurum_video_core_pick_meta( $post_id, 'aurum_jwplayer_media_id', 'jwplayer_media_id' ),
	);
}

/** Accepts only absolute HTTP(S) media URLs. */
function aurum_video_core_safe_url( $url ) {
	$url    = esc_url_raw( (string) $url, array( 'http', 'https' ) );
	$scheme = strtolower( (string) wp_parse_url( $url, PHP_URL_SCHEME ) );
	return in_array( $scheme, array( 'http', 'https' ), true ) ? $url : '';
}

/** Removes the legacy AURUM fallback block without touching surrounding copy. */
function aurum_video_core_strip_fallback( $content ) {
	$pattern = '/<!--\s*aurum-video\s*-->\s*<div\b[^>]*class=(?:"[^"]*\baurum-video\b[^"]*"|\'[^\']*\baurum-video\b[^\']*\')[^>]*>.*?<\/div>/is';
	return (string) preg_replace( $pattern, '', (string) $content );
}

/** Extracts a legacy link only from a marked AURUM block. */
function aurum_video_core_extract_fallback_url( $content ) {
	$pattern = '/<!--\s*aurum-video\s*-->\s*<div\b[^>]*class=(?:"[^"]*\baurum-video\b[^"]*"|\'[^\']*\baurum-video\b[^\']*\')[^>]*>.*?<a\b[^>]*href=(?:"([^"]+)"|\'([^\']+)\')[^>]*>.*?<\/a>.*?<\/div>/is';
	if ( ! preg_match( $pattern, (string) $content, $matches ) ) {
		return '';
	}
	return aurum_video_core_safe_url( ! empty( $matches[1] ) ? $matches[1] : $matches[2] );
}

/** Identifies themes that already print their own player before the_content. */
function aurum_video_core_theme_renders_player( $post_id ) {
	if ( function_exists( 'misiav_get_video_url' ) && misiav_get_video_url( $post_id ) ) {
		return true;
	}
	if ( function_exists( 'aurum_render_video_player' ) ) {
		return true;
	}
	return (bool) apply_filters( 'aurum_video_core_theme_renders_player', false, $post_id );
}

/** @return bool */
function aurum_video_core_is_hls( $url ) {
	$path = strtolower( (string) wp_parse_url( $url, PHP_URL_PATH ) );
	return '.m3u8' === substr( $path, -5 );
}

/** Returns escaped, server-rendered player markup. */
function aurum_video_core_player_html( $post_id, $meta ) {
	$video_url = aurum_video_core_safe_url( isset( $meta['video_url'] ) ? $meta['video_url'] : '' );
	$iframe    = aurum_video_core_safe_url( isset( $meta['iframe_url'] ) ? $meta['iframe_url'] : '' );
	$poster    = aurum_video_core_safe_url( isset( $meta['thumbnail_url'] ) ? $meta['thumbnail_url'] : '' );
	$title     = get_the_title( $post_id );

	if ( $iframe ) {
		return sprintf(
			'<div class="aurum-video-core-player aurum-video-core-player--iframe"><iframe src="%1$s" title="%2$s" width="1280" height="720" loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>',
			esc_url( $iframe ),
			esc_attr( $title )
		);
	}

	if ( ! $video_url ) {
		return '';
	}

	$type = aurum_video_core_is_hls( $video_url ) ? 'application/vnd.apple.mpegurl' : 'video/mp4';
	return sprintf(
		'<div class="aurum-video-core-player"><video controls playsinline preload="metadata" width="1280" height="720"%1$s data-aurum-video="1"><source src="%2$s" type="%3$s"><p>%4$s <a href="%2$s">%5$s</a></p></video></div>',
		$poster ? ' poster="' . esc_url( $poster ) . '"' : '',
		esc_url( $video_url ),
		esc_attr( $type ),
		esc_html__( 'Your browser cannot play this video.', 'aurum-video-core' ),
		esc_html__( 'Open the video file', 'aurum-video-core' )
	);
}

/**
 * Strips duplicate fallbacks and supplies a player for non-integrated themes.
 *
 * A legacy URL may be used as a temporary, safe fallback. A persistent marker
 * makes those posts discoverable for the AURUM repair command.
 */
function aurum_video_core_filter_content( $content ) {
	if ( is_admin() || ! is_singular() || ! in_the_loop() || ! is_main_query() ) {
		return $content;
	}

	$post_id = get_the_ID();
	$meta    = aurum_video_core_get_meta( $post_id );
	$legacy  = '';

	if ( empty( $meta['video_url'] ) && empty( $meta['iframe_url'] ) ) {
		$legacy = aurum_video_core_extract_fallback_url( $content );
		if ( $legacy ) {
			$meta['video_url'] = $legacy;
			add_post_meta( $post_id, '_aurum_video_core_needs_backfill', gmdate( 'c' ), true );
			do_action( 'aurum_video_core_fallback_used', $post_id, $legacy );
		}
	}

	$clean = aurum_video_core_strip_fallback( $content );
	if ( aurum_video_core_theme_renders_player( $post_id ) && ! $legacy ) {
		return $clean;
	}

	$player = aurum_video_core_player_html( $post_id, $meta );
	return $player ? $player . $clean : $clean;
}
add_filter( 'the_content', 'aurum_video_core_filter_content', 8 );

/** Loads player code only on singular pages that contain AURUM media. */
function aurum_video_core_enqueue_assets() {
	if ( ! is_singular() ) {
		return;
	}

	$post_id = get_queried_object_id();
	$meta    = aurum_video_core_get_meta( $post_id );
	$content = (string) get_post_field( 'post_content', $post_id );
	$url     = $meta['video_url'] ? $meta['video_url'] : aurum_video_core_extract_fallback_url( $content );

	if ( empty( $url ) && empty( $meta['iframe_url'] ) ) {
		return;
	}

	wp_enqueue_style( 'aurum-video-core-player', AURUM_VIDEO_CORE_URL . 'assets/player.css', array(), AURUM_VIDEO_CORE_VERSION );
	if ( $url && aurum_video_core_is_hls( $url ) ) {
		wp_enqueue_script( 'aurum-video-core-player', AURUM_VIDEO_CORE_URL . 'assets/player.js', array(), AURUM_VIDEO_CORE_VERSION, true );
		wp_script_add_data( 'aurum-video-core-player', 'strategy', 'defer' );
		wp_add_inline_script(
			'aurum-video-core-player',
			'window.AURUM_VIDEO_CORE=' . wp_json_encode(
				array( 'hlsUrl' => AURUM_VIDEO_CORE_URL . 'assets/hls.light.min.js' )
			) . ';',
			'before'
		);
	}
}
add_action( 'wp_enqueue_scripts', 'aurum_video_core_enqueue_assets', 20 );
