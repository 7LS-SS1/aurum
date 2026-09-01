<?php
/** Minimal CLI smoke tests; no live WordPress database is required. */

define( 'ABSPATH', __DIR__ . '/' );
$GLOBALS['registered_meta'] = array();
$GLOBALS['test_meta']       = array();

function plugin_dir_path( $file ) { return dirname( $file ) . DIRECTORY_SEPARATOR; }
function plugin_dir_url() { return 'https://example.test/wp-content/plugins/aurum-video-core/'; }
function add_action() {}
function add_filter() {}
function register_activation_hook() {}
function register_deactivation_hook() {}
function get_post_types() { return array( 'post' => 'post', 'video' => 'video' ); }
function post_type_exists( $type ) { return in_array( $type, array( 'post', 'video' ), true ); }
function apply_filters( $hook, $value ) { return $value; }
function register_post_meta( $post_type, $key, $args ) {
	$GLOBALS['registered_meta'][ $post_type ][ $key ] = $args;
	return true;
}
function current_user_can() { return true; }
function esc_url_raw( $url ) { return filter_var( $url, FILTER_VALIDATE_URL ) ? $url : ''; }
function sanitize_text_field( $value ) { return trim( strip_tags( (string) $value ) ); }
function wp_parse_url( $url, $component = -1 ) { return parse_url( $url, $component ); }
function get_post_meta( $post_id, $key ) { return $GLOBALS['test_meta'][ $post_id ][ $key ] ?? ''; }
function get_the_title() { return 'AURUM "Test" Video'; }
function esc_url( $value ) { return htmlspecialchars( $value, ENT_QUOTES, 'UTF-8' ); }
function esc_attr( $value ) { return htmlspecialchars( $value, ENT_QUOTES, 'UTF-8' ); }
function esc_html__( $value ) { return htmlspecialchars( $value, ENT_QUOTES, 'UTF-8' ); }

require dirname( __DIR__ ) . '/aurum-video-core.php';

function assert_true( $condition, $message ) {
	if ( ! $condition ) {
		fwrite( STDERR, "FAIL: {$message}\n" );
		exit( 1 );
	}
}

aurum_video_core_register_meta();
$expected_keys = array_keys( aurum_video_core_meta_fields() );
assert_true( 13 === count( $expected_keys ), 'all 13 canonical/legacy fields are declared' );
foreach ( array( 'post', 'video' ) as $post_type ) {
	assert_true( $expected_keys === array_keys( $GLOBALS['registered_meta'][ $post_type ] ), "meta registered on {$post_type}" );
	foreach ( $GLOBALS['registered_meta'][ $post_type ] as $args ) {
		assert_true( true === $args['single'] && true === $args['show_in_rest'], 'REST registration is single and visible' );
	}
}
assert_true( ! in_array( '_yoast_wpseo_title', $expected_keys, true ), 'Yoast private meta is not re-registered' );

$fallback = '<p>Copy stays.</p><!-- aurum-video --><div class="aurum-video"><a href="https://cdn.example.test/playlist.m3u8">Watch video</a></div>';
assert_true( 'https://cdn.example.test/playlist.m3u8' === aurum_video_core_extract_fallback_url( $fallback ), 'safe fallback URL extracted' );
assert_true( false === strpos( aurum_video_core_strip_fallback( $fallback ), 'Watch video' ), 'fallback removed' );
assert_true( false !== strpos( aurum_video_core_strip_fallback( $fallback ), 'Copy stays.' ), 'editorial copy preserved' );

$html = aurum_video_core_player_html(
	48,
	array(
		'video_url'     => 'https://cdn.example.test/playlist.m3u8',
		'iframe_url'    => '',
		'thumbnail_url' => 'https://cdn.example.test/poster.webp',
	)
);
assert_true( false !== strpos( $html, '<video ' ), 'standard video is server-rendered' );
assert_true( false !== strpos( $html, '<source ' ), 'source is present in initial HTML' );
assert_true( false !== strpos( $html, 'width="1280" height="720"' ), 'player reserves a 16:9 box' );
assert_true( false === strpos( $html, '<aurum-video-player' ), 'rendering does not depend on a custom element' );

$iframe = aurum_video_core_player_html(
	48,
	array(
		'video_url'     => '',
		'iframe_url'    => 'https://player.example.test/embed/48',
		'thumbnail_url' => '',
	)
);
assert_true( false !== strpos( $iframe, 'allow="autoplay; encrypted-media; fullscreen; picture-in-picture"' ), 'iframe permissions are explicit' );
assert_true( '' === aurum_video_core_safe_url( 'javascript:alert(1)' ), 'unsafe schemes are rejected' );

fwrite( STDOUT, "AURUM_VIDEO_CORE_SMOKE_OK\n" );
