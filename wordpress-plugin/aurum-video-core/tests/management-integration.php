<?php
/** Local database integration with temporary drafts/terms and option restoration. */
if ( 'cli' !== PHP_SAPI ) { exit( 1 ); }
$load = getenv( 'WP_LOAD_PATH' ) ?: '/var/www/html/wp-load.php';
$test_profile = $argv[1] ?? 'auto';
$_SERVER['SERVER_NAME'] = 'localhost'; $_SERVER['HTTP_HOST'] = 'localhost:8080'; $_SERVER['REQUEST_URI'] = '/';
require_once dirname( $load ) . '/wp-includes/plugin.php';
add_filter( 'option_active_plugins', function ( $plugins ) { $plugins[] = 'aurum-video-core/aurum-video-core.php'; return array_unique( $plugins ); } );
add_filter( 'pre_option_aurum_video_core_settings', function () use ( $test_profile ) { return array( 'profile' => $test_profile ); } );
require $load;
require_once ABSPATH . 'wp-admin/includes/template.php';
require_once ABSPATH . 'wp-admin/includes/screen.php';
$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
wp_set_current_user( (int) $admins[0] );
$ids = array(); $terms = array(); $paths = array(); $keys = array(); $checks = 0;
$old_history = get_option( 'aurum_video_core_history', null );
function mgmt_check( $condition, $message ) {
	global $checks;
	if ( ! $condition ) { throw new RuntimeException( $message ); }
	++$checks;
}
function mgmt_file( $rows, $headers = null ) {
	global $paths;
	$path = tempnam( sys_get_temp_dir(), 'aurum_csv_' ); $paths[] = $path;
	$stream = fopen( $path, 'wb' ); fwrite( $stream, "\xEF\xBB\xBF" );
	$headers = $headers ?: aurum_video_core_csv_headers(); fputcsv( $stream, $headers, ',', '"', '' );
	foreach ( $rows as $row ) { $cells = array(); foreach ( $headers as $key ) { $cells[] = aurum_video_core_csv_escape( $row[ $key ] ); } fputcsv( $stream, $cells, ',', '"', '' ); }
	fclose( $stream ); return $path;
}
try {
	$profile = aurum_video_core_profile();
	mgmt_check( 'video' === $test_profile ? 'video' === $profile['postType'] : 'post' === $profile['postType'], 'profile uses selected type' );
	mgmt_check( 'posts' === aurum_video_core_profile( 'post' )['restBase'], 'built-in post REST base' );
	if ( 'video' === $test_profile ) { mgmt_check( post_type_exists( 'video' ), 'video profile owns fallback CPT' ); }
	$types = array( 'post' ); if ( post_type_exists( 'video' ) ) { $types[] = 'video'; }
	foreach ( $types as $type ) {
		$map = aurum_video_core_csv_taxonomies( $type );
		foreach ( $map as $field => $tax ) {
			if ( ! taxonomy_exists( $tax ) || ! is_object_in_taxonomy( $type, $tax ) ) { continue; }
			$term = wp_insert_term( 'AURUM test ' . wp_generate_uuid4(), $tax );
			mgmt_check( ! is_wp_error( $term ), 'test term' ); $terms[] = array( $term['term_id'], $tax );
		}
		$id = wp_insert_post( array( 'post_type' => $type, 'post_status' => 'draft', 'post_title' => '=ชื่อทดสอบ "AURUM", ภาษาไทย',
			'post_content' => '<p>รายละเอียดเดิม</p>', 'post_excerpt' => 'ข้อความย่อ', 'meta_input' => array(
				'aurum_movie_id' => 'csv-' . wp_generate_uuid4(), 'aurum_video_url' => 'https://example.com/video.mp4?token=do-not-log',
				'rank_math_description' => 'SEO เดิม', 'rank_math_focus_keyword' => 'เดิม',
			) ), true );
		mgmt_check( ! is_wp_error( $id ), 'temporary draft' ); $ids[] = $id;
		$row = aurum_video_core_csv_export_row( $id ); $before = aurum_video_core_csv_state( $id );
		mgmt_check( ! is_wp_error( aurum_video_core_csv_prepare( $row ) ) && ! aurum_video_core_csv_prepare( $row )['changes'], 'unchanged export skips rich body' );
		$parsed = aurum_video_core_csv_parse( mgmt_file( array( $row ) ) );
		mgmt_check( ! is_wp_error( $parsed ) && $parsed[0]['title'] === $row['title'], 'UTF8 quoted formula round trip' );
		mgmt_check( false === strpos( file_get_contents( end( $paths ) ), 'do-not-log' ), 'CSV excludes playback token' );
		mgmt_check( is_wp_error( aurum_video_core_csv_parse( mgmt_file( array( $row, $row ) ) ) ), 'duplicate row rejected' );
		$bad = $row; $bad['aurum_movie_id'] = 'other';
		mgmt_check( is_wp_error( aurum_video_core_csv_prepare( $bad ) ), 'wrong identity rejected' );
		$bad = $row; $bad['site_url'] = 'https://other.example';
		mgmt_check( is_wp_error( aurum_video_core_csv_prepare( $bad ) ), 'wrong site rejected' );
		$bad = $row; $bad['snapshot'] .= ' ';
		mgmt_check( is_wp_error( aurum_video_core_csv_prepare( $bad ) ), 'tampered snapshot rejected' );
		$edit = $row; $edit['title'] = 'ชื่อใหม่'; $edit['meta_description'] = 'รายละเอียดใหม่ ภาษาไทย'; $edit['keywords'] = 'ทดสอบ, AURUM';
		$result = aurum_video_core_csv_apply_row( $edit );
		mgmt_check( ! is_wp_error( $result ) && 'updated' === $result['result'], 'CSV applies edits' );
		mgmt_check( 'รายละเอียดใหม่ ภาษาไทย' === get_post_field( 'post_content', $id ) && 'รายละเอียดใหม่ ภาษาไทย' === get_post_meta( $id, 'rank_math_description', true ), 'one description writes body and Rank Math' );
		mgmt_check( 'https://example.com/video.mp4?token=do-not-log' === get_post_meta( $id, 'aurum_video_url', true ), 'playback preserved' );
		mgmt_check( is_wp_error( aurum_video_core_csv_apply_row( $edit ) ), 'replay conflicts instead of overwriting' );
		$row = aurum_video_core_csv_export_row( $id ); $row['meta_description'] = 'ไทย "quote" C:\\AURUM\\video'; $row['keywords'] = 'C:\\test, "AURUM"';
		mgmt_check( ! is_wp_error( aurum_video_core_csv_apply_row( $row ) ) && $row['meta_description'] === get_post_meta( $id, 'rank_math_description', true ) && $row['keywords'] === get_post_meta( $id, 'rank_math_focus_keyword', true ), 'backslashes and quotes survive metadata writes' );
		$row = aurum_video_core_csv_export_row( $id );
		foreach ( $map as $field => $tax ) {
			foreach ( $terms as $term ) { if ( $tax === $term[1] ) { $row[ $field ] = get_term( $term[0], $tax )->slug; } }
		}
		mgmt_check( ! is_wp_error( aurum_video_core_csv_apply_row( $row ) ), 'existing taxonomy slugs assigned' );
		foreach ( $map as $field => $tax ) {
			if ( ! taxonomy_exists( $tax ) || ! is_object_in_taxonomy( $type, $tax ) ) { continue; }
			mgmt_check( 1 === count( wp_get_object_terms( $id, $tax ) ), 'exact taxonomy assignment' );
		}
		$row = aurum_video_core_csv_export_row( $id ); $before = aurum_video_core_csv_state( $id );
		$row['meta_description'] = 'ห้ามบันทึก SEO'; $row['title'] = 'ห้ามบันทึกชื่อ';
		foreach ( $map as $field => $tax ) { if ( taxonomy_exists( $tax ) && is_object_in_taxonomy( $type, $tax ) ) { $row[ $field ] = ''; } }
		$late_fail = function () { throw new RuntimeException( 'rollback after terms' ); };
		add_action( 'aurum_video_core_csv_after_terms_write', $late_fail );
		$result = aurum_video_core_csv_apply_row( $row ); remove_action( 'aurum_video_core_csv_after_terms_write', $late_fail );
		mgmt_check( is_wp_error( $result ) && $before === aurum_video_core_csv_state( $id ), 'late failure rolls back post, SEO and taxonomy relationships' );
		$row = aurum_video_core_csv_export_row( $id );
		foreach ( $map as $field => $tax ) { if ( taxonomy_exists( $tax ) && is_object_in_taxonomy( $type, $tax ) ) { $row[ $field ] = ''; } }
		mgmt_check( ! is_wp_error( aurum_video_core_csv_apply_row( $row ) ), 'explicit blank clears taxonomy assignments' );
		foreach ( $map as $field => $tax ) { if ( taxonomy_exists( $tax ) && is_object_in_taxonomy( $type, $tax ) ) { mgmt_check( ! wp_get_object_terms( $id, $tax ), 'taxonomy clear read back' ); } }
		$row = aurum_video_core_csv_export_row( $id ); $row['meta_description'] = ''; $result = aurum_video_core_csv_apply_row( $row );
		mgmt_check( ! is_wp_error( $result ) && '' === get_post_field( 'post_content', $id ) && '' === get_post_meta( $id, 'rank_math_description', true ), 'explicit blank clears both descriptions' );
		$row = aurum_video_core_csv_export_row( $id ); $row['title'] = 'เฉพาะชื่อ'; unset( $row['meta_description'] );
		mgmt_check( ! is_wp_error( aurum_video_core_csv_apply_row( $row ) ) && '' === get_post_field( 'post_content', $id ), 'omitted column preserves body' );
		$row = aurum_video_core_csv_export_row( $id ); $row['title'] = 'ชื่อที่จะชน';
		wp_update_post( array( 'ID' => $id, 'post_excerpt' => 'ผู้ดูแลแก้หลัง Preview' ) );
		mgmt_check( is_wp_error( aurum_video_core_csv_apply_row( $row ) ) && 'เฉพาะชื่อ' === get_post_field( 'post_title', $id ), 'change after preview fails closed' );
		$row = aurum_video_core_csv_export_row( $id ); $before = aurum_video_core_csv_state( $id ); $row['title'] = 'ห้ามบันทึก';
		$fail = function () { throw new RuntimeException( 'test rollback' ); };
		add_action( 'aurum_video_core_csv_after_post_write', $fail );
		$result = aurum_video_core_csv_apply_row( $row ); remove_action( 'aurum_video_core_csv_after_post_write', $fail );
		mgmt_check( is_wp_error( $result ) && $before === aurum_video_core_csv_state( $id ), 'injected failure rolls back post and SEO' );
		$row = aurum_video_core_csv_export_row( $id ); $row['actors'] = 'unknown-actor-' . wp_generate_uuid4();
		mgmt_check( is_wp_error( aurum_video_core_csv_prepare( $row ) ), 'unknown actor rejected before writes' );
		wp_set_current_user( 0 ); mgmt_check( is_wp_error( aurum_video_core_csv_prepare( $row ) ), 'anonymous cannot import' ); wp_set_current_user( (int) $admins[0] );
		wp_update_post( array( 'ID' => $id, 'post_content' => '<p>เนื้อหา</p><!-- aurum-video --><div class="aurum-video"><a href="https://example.com/private.mp4?token=do-not-log">ลิงก์เล่น</a></div>' ) );
		update_post_meta( $id, 'rank_math_description', '' ); $row = aurum_video_core_csv_export_row( $id );
		mgmt_check( false === strpos( wp_json_encode( $row ), 'do-not-log' ) && 'เนื้อหา' === $row['meta_description'], 'legacy playback block never leaks into CSV snapshot or description' );
		mgmt_check( ! is_wp_error( aurum_video_core_csv_prepare( $row ) ), 'hashed body snapshot validates unchanged rich content' );
	}
	$diagnostics = aurum_video_core_diagnostics()->get_data();
	mgmt_check( true === $diagnostics['ready'] && 1 === $diagnostics['capabilities']['csvSchema'], 'diagnostics exposes management capability' );
	mgmt_check( isset( $diagnostics['profiles']['post'] ), 'diagnostics exposes per-type profiles' );
	foreach ( array( 'aurum_video_core_admin_overview', 'aurum_video_core_admin_videos', 'aurum_video_core_admin_profile', 'aurum_video_core_admin_history', 'aurum_video_core_admin_csv' ) as $callback ) {
		ob_start(); $callback(); $html = ob_get_clean(); mgmt_check( false !== strpos( $html, 'aurum-core' ) && false === strpos( $html, 'do-not-log' ), 'admin page renders without credentials' );
	}
	$token = wp_generate_password( 32, false, false ); $key = aurum_video_core_csv_stage_key( $token ); $keys[] = $key;
	$row = aurum_video_core_csv_export_row( $ids[0] ); $row['title'] = 'บันทึกผ่านชุดงาน';
	set_transient( $key, array( 'rows' => array( array( 'row' => $row, 'changes' => array( 'title' => $row['title'] ), 'status' => 'ready', 'message' => '' ) ),
		'cursor' => 0, 'expires' => time() + 900, 'counts' => array( 'updated' => 0, 'skipped' => 0, 'invalid' => 0, 'error' => 0 ) ), 900 );
	add_option( 'aurum_csv_lock_' . $token, time(), '', false );
	mgmt_check( is_wp_error( aurum_video_core_csv_apply_batch( $token ) ), 'atomic preview lock prevents competing applies' ); delete_option( 'aurum_csv_lock_' . $token );
	$result = aurum_video_core_csv_apply_batch( $token );
	mgmt_check( ! is_wp_error( $result ) && $result['finished'] && 1 === $result['counts']['updated'], 'bounded apply batch completes' );
	$result = aurum_video_core_csv_apply_batch( $token );
	mgmt_check( 1 === $result['counts']['updated'], 'batch cursor prevents replay' );
	wp_set_current_user( 0 ); mgmt_check( is_wp_error( aurum_video_core_csv_apply_batch( $token ) ), 'preview bound to importing user' ); wp_set_current_user( (int) $admins[0] );
	$expired = get_transient( $key ); $expired['expires'] = time() - 1; set_transient( $key, $expired, 60 );
	mgmt_check( is_wp_error( aurum_video_core_csv_apply_batch( $token ) ), 'expired preview cannot apply' );
	mgmt_check( '' === aurum_video_core_csv_stage_key( '../bad' ), 'token validation' );
	$history = get_option( 'aurum_video_core_history', array() );
	mgmt_check( $history && false === strpos( wp_json_encode( $history ), 'do-not-log' ), 'history logs receipt without tokens' );
	for ( $i = 0; $i < 205; ++$i ) { aurum_video_core_audit( 'test' ); }
	mgmt_check( 200 === count( get_option( 'aurum_video_core_history' ) ), 'history remains bounded' );
	echo 'AURUM_MANAGEMENT_OK profile=' . $test_profile . ' checks=' . $checks . "\n";
} finally {
	foreach ( $ids as $id ) { wp_delete_post( $id, true ); }
	foreach ( $terms as $term ) { wp_delete_term( $term[0], $term[1] ); }
	foreach ( $paths as $path ) { unlink( $path ); }
	foreach ( $keys as $key ) { delete_transient( $key ); }
	if ( null === $old_history ) { delete_option( 'aurum_video_core_history' ); }
	else { update_option( 'aurum_video_core_history', $old_history, false ); }
}
