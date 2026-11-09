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

/** Export types available to administrators. */
function aurum_video_core_csv_export_types() {
	return array(
		'all'      => 'วิดีโอทั้งหมด',
		'category' => 'เลือกตามหมวดหมู่',
		'new'      => 'วิดีโอใหม่ล่าสุด',
		'thin'     => 'วิดีโอที่เนื้อหาต่ำกว่าเกณฑ์',
	);
}

/** Post statuses intentionally exposed by the CSV management screen. */
function aurum_video_core_csv_export_statuses() {
	return array(
		'publish' => 'เผยแพร่',
		'draft'   => 'ฉบับร่าง',
		'pending' => 'รอตรวจ',
	);
}

/** Category taxonomies that are valid for at least one managed post type. */
function aurum_video_core_csv_export_category_taxonomies() {
	$taxonomies = array();
	foreach ( array( 'post', 'video' ) as $type ) {
		if ( ! post_type_exists( $type ) ) { continue; }
		$taxonomy = aurum_video_core_csv_taxonomies( $type )['categories'];
		if ( taxonomy_exists( $taxonomy ) && is_object_in_taxonomy( $type, $taxonomy ) ) {
			$taxonomies[ $taxonomy ] = get_taxonomy( $taxonomy );
		}
	}
	return $taxonomies;
}

/**
 * Validate and normalize an export request independently from the download.
 *
 * @return array<string,mixed>|WP_Error
 */
function aurum_video_core_csv_export_filters( $input ) {
	$type  = sanitize_key( wp_unslash( $input['export_type'] ?? 'all' ) );
	$types = aurum_video_core_csv_export_types();
	if ( ! isset( $types[ $type ] ) ) {
		return new WP_Error( 'export_type', 'ประเภทการส่งออกไม่ถูกต้อง' );
	}

	$count = absint( $input['export_count'] ?? ( $input['export_per_page'] ?? 50 ) );
	if ( $count < 1 || $count > 500 ) {
		return new WP_Error( 'export_count', 'จำนวนที่ส่งออกต้องอยู่ระหว่าง 1 ถึง 500 รายการ' );
	}

	$allowed_statuses = aurum_video_core_csv_export_statuses();
	$raw_statuses     = $input['export_status'] ?? ( isset( $input['export_status_present'] ) ? array() : array_keys( $allowed_statuses ) );
	$raw_statuses     = is_array( $raw_statuses ) ? $raw_statuses : array( $raw_statuses );
	$statuses         = array_values( array_unique( array_map( 'sanitize_key', wp_unslash( $raw_statuses ) ) ) );
	if ( ! $statuses || array_diff( $statuses, array_keys( $allowed_statuses ) ) ) {
		return new WP_Error( 'export_status', 'กรุณาเลือกสถานะอย่างน้อยหนึ่งสถานะจาก เผยแพร่ ฉบับร่าง หรือรอตรวจ' );
	}

	$category = null;
	if ( 'category' === $type ) {
		$value = sanitize_text_field( wp_unslash( $input['export_category'] ?? '' ) );
		if ( ! preg_match( '/^([a-z0-9_-]+):(\d+)$/', $value, $matches ) ) {
			return new WP_Error( 'export_category', 'กรุณาเลือกหมวดหมู่ที่ต้องการส่งออก' );
		}
		$taxonomy = sanitize_key( $matches[1] );
		$term_id  = absint( $matches[2] );
		if ( ! isset( aurum_video_core_csv_export_category_taxonomies()[ $taxonomy ] ) || ! term_exists( $term_id, $taxonomy ) ) {
			return new WP_Error( 'export_category', 'หมวดหมู่ที่เลือกไม่มีอยู่หรือไม่รองรับกับวิดีโอ AURUM' );
		}
		$category = array( 'taxonomy' => $taxonomy, 'term_id' => $term_id );
	}

	return array(
		'type'     => $type,
		'statuses' => $statuses,
		'count'    => $count,
		'page'     => max( 1, absint( $input['export_page'] ?? 1 ) ),
		'category' => $category,
	);
}

/** Description exported to CSV and evaluated by the thin-content filter. */
function aurum_video_core_csv_effective_description( $id ) {
	$seo = trim( (string) get_post_meta( $id, 'rank_math_description', true ) );
	if ( '' !== $seo ) { return trim( preg_replace( '/\s+/u', ' ', wp_strip_all_tags( $seo, true ) ) ); }
	$content = aurum_video_core_strip_fallback( (string) get_post_field( 'post_content', $id ) );
	return trim( preg_replace( '/\s+/u', ' ', wp_strip_all_tags( strip_shortcodes( $content ), true ) ) );
}

/** Normalize Unicode text for conservative title/description similarity checks. */
function aurum_video_core_csv_normalize_comparison_text( $value ) {
	$value = html_entity_decode( wp_strip_all_tags( (string) $value, true ), ENT_QUOTES, get_bloginfo( 'charset' ) ?: 'UTF-8' );
	$value = function_exists( 'mb_strtolower' ) ? mb_strtolower( $value, 'UTF-8' ) : strtolower( $value );
	$value = preg_replace( '/[^\p{L}\p{N}]+/u', '', $value );
	return is_string( $value ) ? $value : '';
}

/** Detect descriptions that are effectively the title with only minor padding. */
function aurum_video_core_csv_description_matches_title( $title, $description ) {
	$title       = aurum_video_core_csv_normalize_comparison_text( $title );
	$description = aurum_video_core_csv_normalize_comparison_text( $description );
	if ( '' === $title || '' === $description ) { return false; }
	if ( hash_equals( $title, $description ) ) { return true; }
	$title_length       = function_exists( 'mb_strlen' ) ? mb_strlen( $title, 'UTF-8' ) : strlen( $title );
	$description_length = function_exists( 'mb_strlen' ) ? mb_strlen( $description, 'UTF-8' ) : strlen( $description );
	$shorter            = min( $title_length, $description_length );
	$longer             = max( $title_length, $description_length );
	return $shorter >= 8 && ( $shorter / $longer ) >= 0.75 && ( false !== strpos( $title, $description ) || false !== strpos( $description, $title ) );
}

/**
 * Explain why a video fails the minimum content/SEO data threshold.
 *
 * @return string[]
 */
function aurum_video_core_csv_quality_issues( $id ) {
	$post        = get_post( $id );
	$description = aurum_video_core_csv_effective_description( $id );
	$length      = function_exists( 'mb_strlen' ) ? mb_strlen( $description, 'UTF-8' ) : strlen( $description );
	$issues      = array();
	if ( ! $post || '' === trim( $post->post_title ) ) { $issues[] = 'missing_title'; }
	if ( $length <= 128 ) { $issues[] = 'short_description'; }
	if ( $post && aurum_video_core_csv_description_matches_title( $post->post_title, $description ) ) { $issues[] = 'description_matches_title'; }
	if ( ! aurum_video_core_has_video( $id ) ) { $issues[] = 'missing_playback'; }
	if ( ! aurum_video_core_thumbnail_url( $id ) ) { $issues[] = 'missing_thumbnail'; }
	return array_values( array_unique( $issues ) );
}

/** Whether a video belongs in the content-repair export. */
function aurum_video_core_csv_is_thin_content( $id ) {
	return (bool) aurum_video_core_csv_quality_issues( $id );
}

/**
 * Resolve IDs for a validated export request while scanning thin candidates in bounded batches.
 *
 * @return int[]
 */
function aurum_video_core_csv_export_ids( $filters ) {
	$args = array(
		'post_status'    => $filters['statuses'],
		'fields'         => 'ids',
		'meta_query'     => array( array( 'key' => 'aurum_movie_id', 'value' => '', 'compare' => '!=' ) ),
		'orderby'        => 'new' === $filters['type'] ? array( 'date' => 'DESC', 'ID' => 'DESC' ) : 'ID',
		'order'          => 'DESC',
		'no_found_rows'  => true,
		'suppress_filters' => false,
	);
	if ( $filters['category'] ) {
		$args['tax_query'] = array( array(
			'taxonomy'         => $filters['category']['taxonomy'],
			'field'            => 'term_id',
			'terms'            => array( $filters['category']['term_id'] ),
			'include_children' => true,
		) );
	}

	if ( 'thin' !== $filters['type'] ) {
		$query = aurum_video_core_managed_query( array_merge( $args, array(
			'posts_per_page' => $filters['count'],
			'paged'          => $filters['page'],
		) ) );
		return array_map( 'intval', $query->posts );
	}

	$wanted_offset = ( $filters['page'] - 1 ) * $filters['count'];
	$matched       = 0;
	$ids           = array();
	$scan_offset   = 0;
	$scan_size     = 200;
	do {
		$query = aurum_video_core_managed_query( array_merge( $args, array(
			'posts_per_page' => $scan_size,
			'offset'         => $scan_offset,
		) ) );
		foreach ( $query->posts as $id ) {
			if ( ! aurum_video_core_csv_is_thin_content( $id ) ) { continue; }
			if ( $matched++ < $wanted_offset ) { continue; }
			$ids[] = (int) $id;
			if ( count( $ids ) >= $filters['count'] ) { break 2; }
		}
		$scan_offset += $scan_size;
	} while ( count( $query->posts ) === $scan_size );
	return $ids;
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
		'meta_description' => aurum_video_core_csv_effective_description( $id ),
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
