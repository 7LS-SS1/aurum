<?php
/**
 * Registers the video-related post meta fields AURUM sends in its
 * `POST /wp-json/wp/v2/posts` `meta` payload (see src/lib/distributor.ts in
 * the AURUM repo). WordPress's REST API silently drops any meta key that
 * isn't registered with `show_in_rest => true` — without this file, none of
 * the video data AURUM sends is actually persisted, regardless of how the
 * theme renders it.
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Meta keys AURUM writes, and whether each one is a URL (sanitized with
 * esc_url_raw) or a plain string (sanitized with sanitize_text_field).
 * The `aurum_*` prefixed keys are canonical; the unprefixed ones are legacy
 * aliases AURUM also sends for backward compatibility with older WP plugins.
 */
function aurum_video_meta_field_map() {
	return array(
		'aurum_provider'          => 'text',
		'aurum_video_url'         => 'url',
		'aurum_iframe_url'        => 'url',
		'aurum_thumbnail_url'     => 'url',
		'aurum_preview_url'       => 'url',
		'aurum_jwplayer_media_id' => 'text',
		'video_provider'          => 'text',
		'video_url'               => 'url',
		'iframe_url'              => 'url',
		'thumbnail_url'           => 'url',
		'preview_url'             => 'url',
		'jwplayer_media_id'       => 'text',
	);
}

function aurum_video_register_post_meta() {
	foreach ( aurum_video_meta_field_map() as $meta_key => $kind ) {
		register_post_meta(
			'post',
			$meta_key,
			array(
				'type'              => 'string',
				'single'            => true,
				'show_in_rest'      => true,
				'sanitize_callback' => 'url' === $kind ? 'esc_url_raw' : 'sanitize_text_field',
				'auth_callback'     => function () {
					return current_user_can( 'edit_posts' );
				},
			)
		);
	}
}
add_action( 'init', 'aurum_video_register_post_meta' );
