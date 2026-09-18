<?php
/** Local WordPress integration: temporary drafts only, deleted in finally. */
if ( 'cli' !== PHP_SAPI ) { exit( 1 ); }
require getenv( 'WP_LOAD_PATH' ) ?: '/var/www/html/wp-load.php';
if ( ! function_exists( 'aurum_video_core_get_meta' ) ) {
	require dirname( __DIR__ ) . '/aurum-video-core.php';
} else {
	require_once dirname( __DIR__ ) . '/includes/editor-persistence.php';
}
aurum_video_core_register_meta();
$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
if ( ! $admins ) { throw new RuntimeException( 'No local administrator' ); }
wp_set_current_user( (int) $admins[0] );
$ids = array();
$checks = 0;
function editor_check( $condition, $message ) {
	global $checks;
	if ( ! $condition ) { throw new RuntimeException( $message ); }
	++$checks;
}
try {
	foreach ( array( 'video_url' => '<a href="https://media.example.test/v.mp4">Watch video</a>', 'iframe_url' => '<iframe src="https://player.example.test/embed/123"></iframe>' ) as $key => $embed ) {
		$id = wp_insert_post( array( 'post_type' => 'post', 'post_status' => 'draft', 'post_title' => 'AURUM editor test', 'post_content' => '<p>Original</p><!-- aurum-video --><div class="aurum-video">' . $embed . '</div>' ), true );
		if ( is_wp_error( $id ) ) { throw new RuntimeException( $id->get_error_message() ); }
		$ids[] = $id;
		$expected = 'video_url' === $key ? 'https://media.example.test/v.mp4' : 'https://player.example.test/embed/123';
		editor_check( get_post_meta( $id, 'aurum_' . $key, true ) === $expected, 'New legacy import persisted' );
		// Emulate an old import whose metadata was never registered.
		delete_post_meta( $id, 'aurum_' . $key );
		delete_post_meta( $id, $key );
		$_GET['post'] = $id;
		aurum_video_core_prepare_editor_media();
		editor_check( get_post_meta( $id, 'aurum_' . $key, true ) === $expected, 'Editor load persists media before REST preload' );
		$read = new WP_REST_Request( 'GET', '/wp/v2/posts/' . $id );
		$read->set_param( 'context', 'edit' );
		$loaded = rest_do_request( $read );
		editor_check( ! $loaded->is_error() && $loaded->get_data()['meta'][ 'aurum_' . $key ] === $expected, 'Editor REST preload receives durable media' );
		delete_post_meta( $id, 'aurum_' . $key );
		delete_post_meta( $id, $key );
		$req = new WP_REST_Request( 'POST', '/wp/v2/posts/' . $id );
		$req->set_body_params( array( 'title' => 'ชื่อใหม่ที่แก้ใน WordPress', 'slug' => 'edited-in-wp-' . $id, 'content' => '<p>คำอธิบายใหม่ทั้งหมด</p>', 'excerpt' => 'รายละเอียดใหม่' ) );
		$result = rest_do_request( $req );
		editor_check( ! $result->is_error(), 'REST editorial update succeeds' );
		$post = get_post( $id );
		editor_check( $post->post_title === 'ชื่อใหม่ที่แก้ใน WordPress' && $post->post_name === 'edited-in-wp-' . $id && $post->post_content === '<p>คำอธิบายใหม่ทั้งหมด</p>' && $post->post_excerpt === 'รายละเอียดใหม่', 'All editorial edits retained' );
		editor_check( get_post_meta( $id, 'aurum_' . $key, true ) === $expected && get_post_meta( $id, $key, true ) === $expected, 'Old source survives removal of fallback' );
		$html = aurum_video_core_player_html( $id, aurum_video_core_get_meta( $id ) );
		editor_check( strpos( $html, $expected ) !== false, 'Player still uses same source' );
		$again = rest_do_request( $req );
		editor_check( ! $again->is_error() && get_post_meta( $id, 'aurum_' . $key, true ) === $expected, 'Repeated save retains media' );
		update_post_meta( $id, 'aurum_' . $key, 'https://media.example.test/preferred' );
		wp_update_post( array( 'ID' => $id, 'post_content' => '<!-- aurum-video --><div class="aurum-video">' . $embed . '</div>' ) );
		editor_check( get_post_meta( $id, 'aurum_' . $key, true ) === 'https://media.example.test/preferred', 'Existing metadata wins over stale fallback' );
	}
	editor_check( array() === aurum_video_core_legacy_sources( '<p>https://media.example.test/v.mp4</p>' ), 'Unmarked prose is not imported' );
	editor_check( array() === aurum_video_core_legacy_sources( '<!-- aurum-video --><div class="aurum-video"><a href="javascript:alert(1)">bad</a></div>' ), 'Unsafe scheme rejected' );
	editor_check( array() === aurum_video_core_legacy_sources( '<!-- aurum-video --><div class="aurum-video"><a href="https://one.example/v.mp4">one</a><a href="https://two.example/v.mp4">two</a></div>' ), 'Conflicting sources not guessed' );
	echo 'EDITOR_INTEGRATION_OK checks=' . $checks . PHP_EOL;
} finally {
	foreach ( $ids as $id ) { wp_delete_post( $id, true ); }
}
