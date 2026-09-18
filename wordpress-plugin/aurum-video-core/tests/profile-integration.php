<?php
/** Read-only bootstraps verify fallback ownership independently of active site plugins/themes. */
if ( 'cli' !== PHP_SAPI ) { exit( 1 ); }
$mode = $argv[1] ?? 'auto';
require '/var/www/html/wp-includes/plugin.php';
add_filter( 'pre_option_active_plugins', function () { return array( 'aurum-video-core/aurum-video-core.php' ); } );
add_filter( 'pre_option_template', function () { return '__aurum_test_no_theme__'; } );
add_filter( 'pre_option_stylesheet', function () { return '__aurum_test_no_theme__'; } );
add_filter( 'pre_option_aurum_video_core_settings', function () use ( $mode ) { return array( 'profile' => 'auto' === $mode ? 'auto' : 'video' ); } );
if ( 'owned' === $mode ) {
	add_action( 'init', function () {
		register_post_type( 'video', array( 'public' => true, 'show_in_rest' => true, 'rest_base' => 'legacy_video', 'rewrite' => array( 'slug' => 'legacy-watch' ) ) );
		register_taxonomy( 'video_category', 'video', array( 'public' => true, 'show_in_rest' => true, 'rest_base' => 'legacy_categories', 'rewrite' => array( 'slug' => 'legacy-categories' ) ) );
		register_taxonomy( 'video_tag', 'video', array( 'public' => true, 'show_in_rest' => true, 'rest_base' => 'legacy_tags' ) );
	}, 10 );
}
require '/var/www/html/wp-load.php';
$checks = 0;
function profile_check( $ok, $message ) { global $checks; if ( ! $ok ) { throw new RuntimeException( $message ); } ++$checks; }
if ( 'auto' === $mode ) {
	profile_check( ! post_type_exists( 'video' ), 'default auto must not introduce a CPT' );
	profile_check( 'posts' === aurum_video_core_profile()['restBase'], 'default post profile' );
} else {
	$profile = aurum_video_core_profile();
	profile_check( post_type_exists( 'video' ) && $profile['ready'], 'video and taxonomies ready' );
	profile_check( is_object_in_taxonomy( 'video', 'aurum_video_actor' ), 'actor taxonomy attaches to fallback' );
	profile_check( isset( get_registered_meta_keys( 'post', 'video' )['aurum_movie_id'] ), 'canonical metadata attaches to fallback' );
	profile_check( 'owned' === $mode ? 'legacy_video' === $profile['restBase'] : 'video' === $profile['restBase'], 'REST base preserves ownership' );
	profile_check( 'owned' === $mode ? 'legacy-watch' === get_post_type_object( 'video' )->rewrite['slug'] : 'videos' === get_post_type_object( 'video' )->rewrite['slug'], 'permalink ownership' );
	if ( 'owned' === $mode ) {
		profile_check( 'legacy_categories' === $profile['taxonomies']['category']['restBase'], 'category REST base preserved' );
		profile_check( 'legacy-categories' === get_taxonomy( 'video_category' )->rewrite['slug'], 'category permalink preserved' );
		profile_check( 'legacy_tags' === $profile['taxonomies']['tag']['restBase'], 'tag REST base preserved' );
	}
}
echo 'AURUM_PROFILE_OK mode=' . $mode . ' checks=' . $checks . "\n";
