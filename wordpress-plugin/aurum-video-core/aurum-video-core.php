<?php
/**
 * Plugin Name: AURUM Video Core
 * Description: Theme-independent AURUM video metadata, server-rendered playback, diagnostics, and video SEO.
 * Version: 1.0.1
 * Requires at least: 6.5
 * Requires PHP: 7.4
 * Author: AURUM
 * Text Domain: aurum-video-core
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'AURUM_VIDEO_CORE_VERSION', '1.0.1' );
define( 'AURUM_VIDEO_CORE_FILE', __FILE__ );
define( 'AURUM_VIDEO_CORE_DIR', plugin_dir_path( __FILE__ ) );
define( 'AURUM_VIDEO_CORE_URL', plugin_dir_url( __FILE__ ) );

require_once AURUM_VIDEO_CORE_DIR . 'includes/meta.php';
require_once AURUM_VIDEO_CORE_DIR . 'includes/player.php';
require_once AURUM_VIDEO_CORE_DIR . 'includes/seo.php';

register_activation_hook( __FILE__, 'aurum_video_core_activate' );
register_deactivation_hook( __FILE__, 'aurum_video_core_deactivate' );

/** Flushes only after the video-sitemap rewrite has been registered. */
function aurum_video_core_activate() {
	aurum_video_core_register_sitemap_rewrites();
	flush_rewrite_rules();
}

/** Removes the plugin's rewrite rules from WordPress's cached rule set. */
function aurum_video_core_deactivate() {
	flush_rewrite_rules();
}
