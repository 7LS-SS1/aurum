<?php
/** Signed CSV snapshots; updates existing AURUM posts only. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function aurum_video_core_csv_headers() {
	return array( 'schema_version', 'site_url', 'blog_id', 'post_id', 'aurum_movie_id',
		'title', 'excerpt', 'meta_description', 'keywords', 'categories', 'tags', 'actors', 'snapshot', 'signature' );
}
function aurum_video_core_csv_editable() {
	return array( 'title', 'excerpt', 'meta_description', 'keywords', 'categories', 'tags', 'actors' );
}
function aurum_video_core_csv_taxonomies( $type ) {
	$profile = aurum_video_core_profile( $type );
	return array( 'categories' => $profile['taxonomies']['category']['name'],
		'tags' => $profile['taxonomies']['tag']['name'], 'actors' => 'aurum_video_actor' );
}
function aurum_video_core_csv_state( $id ) {
	$post = get_post( $id );
	$state = array( 'title' => $post->post_title, 'content' => $post->post_content, 'excerpt' => $post->post_excerpt,
		'seo' => get_post_meta( $id, 'rank_math_description', true ),
		'keywords' => get_post_meta( $id, 'rank_math_focus_keyword', true ), 'terms' => array() );
	foreach ( aurum_video_core_csv_taxonomies( $post->post_type ) as $field => $tax ) {
		$terms = taxonomy_exists( $tax ) ? wp_get_object_terms( $id, $tax, array( 'fields' => 'ids' ) ) : array();
		$terms = is_wp_error( $terms ) ? array() : array_map( 'intval', $terms );
		sort( $terms ); $state['terms'][ $field ] = $terms;
	}
	return $state;
}
function aurum_video_core_csv_identity( $id ) {
	return array( 'schema_version' => '1', 'site_url' => untrailingslashit( home_url() ),
		'blog_id' => (string) get_current_blog_id(), 'post_id' => (string) $id,
		'aurum_movie_id' => (string) get_post_meta( $id, 'aurum_movie_id', true ) );
}
/** Detect body changes without exporting raw HTML or embedded legacy playback URLs. */
function aurum_video_core_csv_snapshot_state( $state ) {
	$state['content'] = hash( 'sha256', $state['content'] );
	return $state;
}
/** Prefix spreadsheet formulas; decode only this exact escaping pattern on import. */
function aurum_video_core_csv_escape( $value ) {
	$value = (string) $value;
	return preg_match( '/^[=+@\-\t\r\n]/u', $value ) ? "'" . $value : $value;
}
function aurum_video_core_csv_unescape( $value ) {
	return preg_match( "/^'[=+@\-\t\r\n]/u", $value ) ? substr( $value, 1 ) : $value;
}
function aurum_video_core_csv_export_row( $id ) {
	$identity = aurum_video_core_csv_identity( $id );
	$state = aurum_video_core_csv_state( $id );
	$values = array( 'title' => $state['title'], 'excerpt' => $state['excerpt'],
		'meta_description' => $state['seo'] ?: wp_strip_all_tags( aurum_video_core_strip_fallback( $state['content'] ) ),
		'keywords' => $state['keywords'] );
	foreach ( aurum_video_core_csv_taxonomies( get_post_type( $id ) ) as $field => $tax ) {
		$slugs = taxonomy_exists( $tax ) ? wp_get_object_terms( $id, $tax, array( 'fields' => 'slugs' ) ) : array();
		$values[ $field ] = is_wp_error( $slugs ) ? '' : implode( '|', $slugs );
	}
	$snapshot = wp_json_encode( array( 'identity' => $identity, 'state' => aurum_video_core_csv_snapshot_state( $state ), 'values' => $values, 'taxonomies' => aurum_video_core_csv_taxonomies( get_post_type( $id ) ) ), JSON_UNESCAPED_UNICODE );
	return array_merge( $identity, $values, array( 'snapshot' => $snapshot, 'signature' => hash_hmac( 'sha256', $snapshot, wp_salt( 'auth' ) ) ) );
}
function aurum_video_core_csv_parse( $path ) {
	if ( ! is_file( $path ) || filesize( $path ) > 2 * 1024 * 1024 ) { return new WP_Error( 'csv_size', 'ไฟล์ต้องมีขนาดไม่เกิน 2 MB' ); }
	$handle = fopen( $path, 'rb' );
	if ( ! $handle ) { return new WP_Error( 'csv_read', 'อ่านไฟล์ไม่ได้' ); }
	try {
		$headers = fgetcsv( $handle, 0, ',', '"', '' );
		if ( ! is_array( $headers ) ) { return new WP_Error( 'csv_empty', 'ไม่พบหัวตาราง CSV' ); }
		$headers[0] = preg_replace( '/^\xEF\xBB\xBF/', '', $headers[0] );
		$required = array( 'schema_version', 'site_url', 'blog_id', 'post_id', 'aurum_movie_id', 'snapshot', 'signature' );
		if ( array_diff( $required, $headers ) || array_diff( $headers, aurum_video_core_csv_headers() ) || count( $headers ) !== count( array_unique( $headers ) ) ) {
			return new WP_Error( 'csv_headers', 'ใช้ไฟล์ Export ของเว็บนี้และรักษาคอลัมน์ระบุตัวตนไว้ หัวตารางไม่ถูกต้องหรือซ้ำ' );
		}
		$rows = array(); $seen = array();
		while ( false !== ( $cells = fgetcsv( $handle, 0, ',', '"', '' ) ) ) {
			if ( array( null ) === $cells ) { continue; }
			if ( count( $rows ) >= 500 ) { return new WP_Error( 'csv_rows', 'รองรับไม่เกิน 500 แถวต่อไฟล์ กรุณาแบ่งไฟล์' ); }
			if ( count( $cells ) !== count( $headers ) ) { return new WP_Error( 'csv_columns', 'จำนวนคอลัมน์ไม่ตรงกับหัวตาราง' ); }
			foreach ( $cells as $cell ) {
				if ( ! seems_utf8( $cell ) || false !== strpos( $cell, "\0" ) ) { return new WP_Error( 'csv_encoding', 'บันทึกไฟล์เป็น UTF-8 และห้ามมีอักขระว่าง' ); }
			}
			$row = array_combine( $headers, array_map( 'aurum_video_core_csv_unescape', $cells ) );
			if ( isset( $seen[ $row['post_id'] ] ) ) { return new WP_Error( 'csv_duplicate', 'พบรหัสโพสต์ซ้ำในไฟล์' ); }
			$seen[ $row['post_id'] ] = true; $rows[] = $row;
		}
		return $rows ?: new WP_Error( 'csv_empty', 'ไม่พบแถวข้อมูล' );
	} finally { fclose( $handle ); }
}

/** Validate signed identity, concurrent edits, and existing taxonomy slugs before any writes. */
function aurum_video_core_csv_prepare( $row ) {
	if ( ! current_user_can( 'manage_options' ) ) { return new WP_Error( 'forbidden', 'ไม่มีสิทธิ์จัดการ CSV' ); }
	$id = ctype_digit( (string) ( $row['post_id'] ?? '' ) ) ? (int) $row['post_id'] : 0;
	$post = get_post( $id );
	if ( ! $post || ! in_array( $post->post_type, array( 'post', 'video' ), true ) || in_array( $post->post_status, array( 'trash', 'auto-draft' ), true ) || ! current_user_can( 'edit_post', $id ) ) {
		return new WP_Error( 'invalid_post', 'ไม่พบโพสต์วิดีโอที่แก้ไขได้' );
	}
	$snapshot = json_decode( $row['snapshot'] ?? '', true );
	if ( ! is_array( $snapshot ) || ! isset( $snapshot['identity'], $snapshot['state'], $snapshot['values'] ) ||
		! hash_equals( hash_hmac( 'sha256', $row['snapshot'], wp_salt( 'auth' ) ), (string) ( $row['signature'] ?? '' ) ) ) {
		return new WP_Error( 'invalid_snapshot', 'ข้อมูลต้นฉบับถูกแก้ไข กรุณา Export ใหม่' );
	}
	$identity = aurum_video_core_csv_identity( $id );
	if ( ( $snapshot['taxonomies'] ?? null ) !== aurum_video_core_csv_taxonomies( $post->post_type ) ) { return new WP_Error( 'profile_conflict', 'โปรไฟล์หมวดหมู่เปลี่ยนหลัง Export กรุณา Export ใหม่' ); }
	if ( ! $identity['aurum_movie_id'] || $snapshot['identity'] !== $identity ) { return new WP_Error( 'identity_conflict', 'ตัวตนวิดีโอหรือเว็บไซต์ไม่ตรง กรุณา Export ใหม่' ); }
	foreach ( $identity as $key => $value ) {
		if ( (string) ( $row[ $key ] ?? '' ) !== $value ) { return new WP_Error( 'identity_conflict', 'รหัสโพสต์ วิดีโอ หรือเว็บไซต์ถูกเปลี่ยน' ); }
	}
	$matches = get_posts( array( 'post_type' => array( 'post', 'video' ), 'post_status' => array( 'publish', 'future', 'draft', 'pending', 'private' ),
		'meta_key' => 'aurum_movie_id', 'meta_value' => $identity['aurum_movie_id'], 'fields' => 'ids', 'posts_per_page' => 2 ) );
	if ( 1 !== count( $matches ) || (int) $matches[0] !== $id ) { return new WP_Error( 'identity_conflict', 'พบตัวตน AURUM ซ้ำหรือไม่ชัดเจน หยุดการแก้ไขรายการนี้' ); }
	if ( $snapshot['state'] !== aurum_video_core_csv_snapshot_state( aurum_video_core_csv_state( $id ) ) ) { return new WP_Error( 'conflict', 'ข้อมูลถูกแก้หลัง Export กรุณา Export ใหม่' ); }
	$changes = array();
	foreach ( aurum_video_core_csv_editable() as $field ) {
		if ( ! array_key_exists( $field, $row ) || $row[ $field ] === (string) $snapshot['values'][ $field ] ) { continue; }
		if ( in_array( $field, array( 'categories', 'tags', 'actors' ), true ) ) {
			$tax = aurum_video_core_csv_taxonomies( $post->post_type )[ $field ];
			if ( ! taxonomy_exists( $tax ) || ! is_object_in_taxonomy( $post->post_type, $tax ) || ! current_user_can( get_taxonomy( $tax )->cap->assign_terms ) ) {
				return new WP_Error( 'invalid_taxonomy', 'ไม่มี taxonomy หรือไม่มีสิทธิ์กำหนดหมวดหมู่/แท็ก/นักแสดง' );
			}
			$terms = array();
			foreach ( array_filter( explode( '|', $row[ $field ] ), 'strlen' ) as $slug ) {
				$term = get_term_by( 'slug', trim( $slug ), $tax );
				if ( ! $term ) { return new WP_Error( 'invalid_term', 'ไม่พบ slug ใน ' . $field . ': ' . sanitize_text_field( $slug ) ); }
				$terms[] = (int) $term->term_id;
			}
			$changes[ $field ] = array_values( array_unique( $terms ) );
		} else {
			$changes[ $field ] = in_array( $field, array( 'meta_description', 'excerpt' ), true ) ? sanitize_textarea_field( $row[ $field ] ) : sanitize_text_field( $row[ $field ] );
			if ( 'title' === $field && '' === trim( $changes[ $field ] ) ) { return new WP_Error( 'invalid_title', 'ชื่อวิดีโอต้องไม่ว่าง' ); }
		}
	}
	return array( 'post_id' => $id, 'changes' => $changes );
}

/** Row-level database transaction and post-row lock; rollback includes term counts. */
function aurum_video_core_csv_apply_row( $row ) {
	global $wpdb;
	$tables = array( $wpdb->posts, $wpdb->postmeta, $wpdb->term_relationships, $wpdb->term_taxonomy );
	foreach ( $tables as $table ) {
		$info = $wpdb->get_row( $wpdb->prepare( 'SHOW TABLE STATUS WHERE Name = %s', $table ) );
		if ( ! $info || 'InnoDB' !== $info->Engine ) { return new WP_Error( 'transaction_unavailable', 'ตารางฐานข้อมูลต้องรองรับ InnoDB ก่อนนำเข้า' ); }
	}
	if ( false === $wpdb->query( 'START TRANSACTION' ) ) { return new WP_Error( 'transaction_failed', 'เริ่มการบันทึกไม่ได้' ); }
	$id = absint( $row['post_id'] ?? 0 );
	try {
		$wpdb->get_var( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE ID = %d FOR UPDATE", $id ) );
		clean_post_cache( $id );
		$plan = aurum_video_core_csv_prepare( $row );
		if ( is_wp_error( $plan ) ) { $wpdb->query( 'ROLLBACK' ); return $plan; }
		if ( ! $plan['changes'] ) { $wpdb->query( 'COMMIT' ); return array( 'result' => 'skipped', 'fields' => array() ); }
		$before = aurum_video_core_csv_state( $id );
		$update = array( 'ID' => $id );
		foreach ( array( 'title' => 'post_title', 'excerpt' => 'post_excerpt', 'meta_description' => 'post_content' ) as $field => $column ) {
			if ( array_key_exists( $field, $plan['changes'] ) ) { $update[ $column ] = $plan['changes'][ $field ]; }
		}
		if ( count( $update ) > 1 ) {
			$result = wp_update_post( wp_slash( $update ), true );
			if ( is_wp_error( $result ) ) { throw new RuntimeException( 'post_write_failed' ); }
		}
		do_action( 'aurum_video_core_csv_after_post_write', $id, $plan );
		foreach ( array( 'meta_description' => 'rank_math_description', 'keywords' => 'rank_math_focus_keyword' ) as $field => $meta_key ) {
			if ( array_key_exists( $field, $plan['changes'] ) ) { update_post_meta( $id, $meta_key, wp_slash( $plan['changes'][ $field ] ) ); }
		}
		$taxonomies = aurum_video_core_csv_taxonomies( get_post_type( $id ) );
		foreach ( array( 'categories', 'tags', 'actors' ) as $field ) {
			if ( array_key_exists( $field, $plan['changes'] ) ) {
				$result = wp_set_object_terms( $id, $plan['changes'][ $field ], $taxonomies[ $field ], false );
				if ( is_wp_error( $result ) ) { throw new RuntimeException( 'term_write_failed' ); }
			}
		}
		do_action( 'aurum_video_core_csv_after_terms_write', $id, $plan );
		$after = aurum_video_core_csv_state( $id );
		foreach ( $plan['changes'] as $field => $expected ) {
			if ( isset( $taxonomies[ $field ] ) ) { sort( $expected ); $actual = $after['terms'][ $field ]; }
			else { $actual = $after[ array( 'meta_description' => 'seo', 'keywords' => 'keywords', 'title' => 'title', 'excerpt' => 'excerpt' )[ $field ] ]; }
			if ( $actual !== $expected || ( 'meta_description' === $field && $after['content'] !== $expected ) ) { throw new RuntimeException( 'verification_failed' ); }
		}
		if ( false === $wpdb->query( 'COMMIT' ) ) { throw new RuntimeException( 'commit_failed' ); }
		aurum_video_core_audit( 'csv_updated', $id, array_keys( $plan['changes'] ) );
		return array( 'result' => 'updated', 'fields' => array_keys( $plan['changes'] ) );
	} catch ( Throwable $error ) {
		$wpdb->query( 'ROLLBACK' );
		clean_post_cache( $id );
		foreach ( aurum_video_core_csv_taxonomies( get_post_type( $id ) ) as $tax ) {
			if ( taxonomy_exists( $tax ) ) {
				wp_cache_delete( $id, $tax . '_relationships' );
				$term_ids = get_terms( array( 'taxonomy' => $tax, 'fields' => 'ids', 'hide_empty' => false ) );
				if ( ! is_wp_error( $term_ids ) ) { clean_term_cache( $term_ids, $tax ); }
			}
		}
		aurum_video_core_audit( 'csv_error', $id, array(), 'error' );
		return new WP_Error( 'write_failed', 'บันทึกไม่สำเร็จและย้อนกลับข้อมูลรายการนี้แล้ว' );
	}
}
