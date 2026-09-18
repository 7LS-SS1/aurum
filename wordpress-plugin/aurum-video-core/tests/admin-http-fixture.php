<?php
/** Disposable local-only account/draft for real HTTP and browser admin verification. */
if ( 'cli' !== PHP_SAPI ) { exit( 1 ); }
$_SERVER['HTTP_HOST'] = 'localhost:8080'; $_SERVER['SERVER_NAME'] = 'localhost'; $_SERVER['REQUEST_URI'] = '/';
require '/var/www/html/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/user.php';
$path = '/tmp/aurum-admin-qa-state.json';
$mode = $argv[1] ?? 'setup';
if ( 'verify' === $mode ) {
	$state = json_decode( file_get_contents( $path ), true ); $id = $state['post_id'];
	if ( 'ชื่อใหม่จากหน้าจอ CSV' !== get_post_field( 'post_title', $id ) || 'รายละเอียดใหม่ ภาษาไทย "AURUM"' !== get_post_meta( $id, 'rank_math_description', true ) || get_post_field( 'post_content', $id ) !== get_post_meta( $id, 'rank_math_description', true ) ) { throw new RuntimeException( 'Browser import verification failed' ); }
	$history = get_option( 'aurum_video_core_history', array() );
	$events = array_column( array_filter( $history, function ( $entry ) use ( $id ) { return $id === $entry['post_id']; } ), 'event' );
	if ( ! in_array( 'rest_created', $events, true ) || ! in_array( 'csv_updated', $events, true ) ) { throw new RuntimeException( 'Receipt audit missing' ); }
	echo "ADMIN_BROWSER_IMPORT_OK title/body/SEO/receipt\n"; exit;
}
if ( 'cleanup' === $mode ) {
	$state = is_file( $path ) ? json_decode( file_get_contents( $path ), true ) : null;
	if ( ! $state ) { echo "NO_FIXTURE\n"; exit; }
	wp_set_current_user( $state['user_id'] );
	wp_delete_post( $state['post_id'], true ); wp_delete_user( $state['user_id'] );
	foreach ( array( 'settings', 'history' ) as $kind ) {
		$key = 'aurum_video_core_' . $kind;
		if ( null === $state[ $kind ] ) { delete_option( $key ); } else { update_option( $key, $state[ $kind ], false ); }
	}
	global $wpdb;
	$prefix = '_transient_aurum_csv_' . $state['user_id'] . '_';
	$names = $wpdb->get_col( $wpdb->prepare( "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like( $prefix ) . '%' ) );
	foreach ( $names as $name ) { delete_transient( substr( $name, strlen( '_transient_' ) ) ); }
	@unlink( __DIR__ . '/.qa-upload.csv' ); unlink( $path ); echo "ADMIN_QA_CLEANUP_OK\n"; exit;
}
if ( is_file( $path ) ) { throw new RuntimeException( 'Clean up existing QA fixture first' ); }
$state = array( 'settings' => get_option( 'aurum_video_core_settings', null ), 'history' => get_option( 'aurum_video_core_history', null ) );
$state['username'] = 'aurum_qa_' . strtolower( wp_generate_password( 10, false, false ) );
$state['password'] = wp_generate_password( 28, false, false );
$state['user_id'] = wp_insert_user( array( 'user_login' => $state['username'], 'user_pass' => $state['password'], 'role' => 'administrator' ) );
if ( is_wp_error( $state['user_id'] ) ) { throw new RuntimeException( 'QA user failed' ); }
wp_set_current_user( $state['user_id'] );
$request = new WP_REST_Request( 'POST', '/wp/v2/posts' );
$request->set_body_params( array( 'status' => 'draft', 'title' => 'ทดสอบ AURUM CSV ภาษาไทย', 'content' => '<p>เนื้อหาเดิมของข้อมูลทดสอบ</p>',
	'meta' => array( 'aurum_movie_id' => 'admin-qa-' . wp_generate_uuid4(), 'aurum_video_url' => 'https://example.com/qa.mp4' ) ) );
$response = rest_do_request( $request ); $data = $response->get_data();
if ( $response->get_status() >= 400 || empty( $data['id'] ) ) { wp_delete_user( $state['user_id'] ); throw new RuntimeException( 'QA REST draft failed' ); }
$state['post_id'] = $data['id'];
file_put_contents( $path, wp_json_encode( $state ) ); chmod( $path, 0600 );
$row = aurum_video_core_csv_export_row( $state['post_id'] ); $row['title'] = 'ชื่อใหม่จากหน้าจอ CSV'; $row['meta_description'] = 'รายละเอียดใหม่ ภาษาไทย "AURUM"';
$stream = fopen( __DIR__ . '/.qa-upload.csv', 'wb' ); fwrite( $stream, "\xEF\xBB\xBF" );
$headers = aurum_video_core_csv_headers(); fputcsv( $stream, $headers, ',', '"', '' );
$cells = array(); foreach ( $headers as $field ) { $cells[] = aurum_video_core_csv_escape( $row[ $field ] ); }
fputcsv( $stream, $cells, ',', '"', '' ); fclose( $stream );
echo wp_json_encode( array_intersect_key( $state, array_flip( array( 'username', 'password', 'user_id', 'post_id' ) ) ) );
