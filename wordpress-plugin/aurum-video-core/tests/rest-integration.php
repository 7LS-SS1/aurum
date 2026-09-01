<?php
/**
 * Real WordPress REST integration test.
 *
 * Creates one temporary draft, verifies authenticated context=edit metadata,
 * and removes only that test draft in a finally block.
 *
 * WP_LOAD_PATH=/var/www/html/wp-load.php php tests/rest-integration.php
 */

if ( 'cli' !== PHP_SAPI ) {
	fwrite( STDERR, "CLI only\n" );
	exit( 1 );
}

$wp_load = getenv( 'WP_LOAD_PATH' );
if ( ! $wp_load || ! is_file( $wp_load ) ) {
	fwrite( STDERR, "Set WP_LOAD_PATH to wp-load.php\n" );
	exit( 1 );
}

require $wp_load;
require dirname( __DIR__ ) . '/aurum-video-core.php';

$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
if ( empty( $admins ) ) {
	fwrite( STDERR, "No local administrator is available for the REST integration test\n" );
	exit( 1 );
}
wp_set_current_user( (int) $admins[0] );
aurum_video_core_register_meta();

$expected = array(
	'aurum_movie_id'          => 'integration-movie-id',
	'aurum_provider'          => 'bunny',
	'aurum_video_url'         => 'https://cdn.example.test/integration/playlist.m3u8',
	'aurum_iframe_url'        => '',
	'aurum_thumbnail_url'     => 'https://cdn.example.test/integration/poster.webp',
	'aurum_preview_url'       => 'https://cdn.example.test/integration/preview.mp4',
	'aurum_jwplayer_media_id' => '',
	'video_provider'          => 'bunny',
	'video_url'               => 'https://cdn.example.test/integration/playlist.m3u8',
	'iframe_url'              => '',
	'thumbnail_url'           => 'https://cdn.example.test/integration/poster.webp',
	'preview_url'             => 'https://cdn.example.test/integration/preview.mp4',
	'jwplayer_media_id'       => '',
);

$post_id = 0;
try {
	$create = new WP_REST_Request( 'POST', '/wp/v2/posts' );
	$create->set_body_params(
		array(
			'title'   => 'AURUM Video Core REST integration test',
			'status'  => 'publish',
			'excerpt' => 'คำอธิบายต้นฉบับสำหรับทดสอบ VideoObject',
			'content' => '<!-- aurum-video --><div class="aurum-video"><a href="https://cdn.example.test/integration/playlist.m3u8">Watch video</a></div>',
			'meta'    => $expected,
		)
	);
	$created = rest_do_request( $create );
	if ( $created->is_error() ) {
		throw new RuntimeException( wp_json_encode( $created->as_error() ) );
	}
	$post_id = (int) $created->get_data()['id'];

	$read = new WP_REST_Request( 'GET', '/wp/v2/posts/' . $post_id );
	$read->set_param( 'context', 'edit' );
	$result = rest_do_request( $read );
	if ( $result->is_error() ) {
		throw new RuntimeException( wp_json_encode( $result->as_error() ) );
	}
	$actual = (array) $result->get_data()['meta'];
	foreach ( $expected as $key => $value ) {
		if ( (string) ( $actual[ $key ] ?? '' ) !== $value ) {
			throw new RuntimeException( "REST meta mismatch: {$key}" );
		}
	}
	$schema = aurum_video_core_schema_data( $post_id );
	foreach ( array( '@type', 'name', 'description', 'thumbnailUrl', 'uploadDate', 'contentUrl' ) as $required ) {
		if ( empty( $schema[ $required ] ) ) {
			throw new RuntimeException( "VideoObject missing: {$required}" );
		}
	}
	if ( 'VideoObject' !== $schema['@type'] || aurum_video_core_is_explicit( $post_id ) ) {
		throw new RuntimeException( 'VideoObject type or explicit classification is incorrect' );
	}
	$entry = aurum_video_core_sitemap_url_entry( $post_id );
	$xml   = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">' . $entry . '</urlset>';
	if ( ! simplexml_load_string( $xml ) || false === strpos( $entry, '<video:content_loc>' ) ) {
		throw new RuntimeException( 'Video sitemap XML is invalid or missing content_loc' );
	}

	fwrite( STDOUT, 'WORDPRESS_REST_META_SCHEMA_SITEMAP_INTEGRATION_OK post=' . $post_id . PHP_EOL );
} finally {
	if ( $post_id > 0 ) {
		wp_delete_post( $post_id, true );
	}
}
