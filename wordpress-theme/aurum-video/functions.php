<?php
/**
 * AURUM Video theme setup.
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // No direct access.
}

// Bump this on every theme.zip re-upload — it's the cache-busting query
// string (?ver=...) on style.css/player assets, so browsers/host caches
// keep serving the old file after an update until this value changes.
define( 'AURUM_VIDEO_VERSION', '2.0.1' );

/**
 * Theme support + nav menu registration.
 */
function aurum_video_setup() {
	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'automatic-feed-links' );
	add_theme_support( 'responsive-embeds' );
	add_theme_support(
		'html5',
		array( 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script' )
	);
	add_theme_support( 'custom-logo' );

	register_nav_menus(
		array(
			'primary' => __( 'Primary Menu', 'aurum-video' ),
		)
	);
}
add_action( 'after_setup_theme', 'aurum_video_setup' );

/**
 * Styles + scripts.
 */
function aurum_video_enqueue_assets() {
	wp_enqueue_style( 'aurum-video-style', get_stylesheet_uri(), array(), AURUM_VIDEO_VERSION );

	if ( is_singular( 'post' ) ) {
		wp_enqueue_style(
			'aurum-video-player',
			get_template_directory_uri() . '/assets/player/aurum-video-player.css',
			array(),
			AURUM_VIDEO_VERSION
		);

		wp_enqueue_script(
			'aurum-video-player',
			get_template_directory_uri() . '/assets/player/aurum-video-player.js',
			array(),
			AURUM_VIDEO_VERSION,
			true
		);
	}

	wp_enqueue_script(
		'aurum-video-theme',
		get_template_directory_uri() . '/assets/js/aurum-player.js',
		array(),
		AURUM_VIDEO_VERSION,
		true
	);

	// Post ID + REST base URL for the view-beacon and like/dislike buttons in
	// aurum-player.js — only needed (and only sent) on the single video page.
	if ( is_singular( 'post' ) ) {
		wp_localize_script(
			'aurum-video-theme',
			'aurumData',
			array(
				'restUrl'  => esc_url_raw( rest_url( 'aurum/v1' ) ),
				'postId'   => get_the_ID(),
				'reaction' => aurum_get_visitor_reaction( get_the_ID() ),
				// Only actually enforced by WordPress when the visitor also
				// happens to have a logged-in wp-admin session cookie in the
				// same browser — anonymous visitors hit these public routes
				// fine either way, but WP's cookie-auth check runs before our
				// own permission_callback and rejects an unauthenticated
				// nonce for logged-in users otherwise.
				'nonce'    => wp_create_nonce( 'wp_rest' ),
			)
		);
	}
}
add_action( 'wp_enqueue_scripts', 'aurum_video_enqueue_assets' );

require get_template_directory() . '/inc/meta.php';
require get_template_directory() . '/inc/template-tags.php';
require get_template_directory() . '/inc/engagement.php';
require get_template_directory() . '/inc/video-info-metabox.php';
require get_template_directory() . '/inc/updater.php';
