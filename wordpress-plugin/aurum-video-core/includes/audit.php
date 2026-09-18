<?php
/** Bounded local receipt history; central AURUM remains the job-status authority. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function aurum_video_core_audit( $event, $post_id = 0, $fields = array(), $result = 'success' ) {
	if ( ! apply_filters( 'aurum_video_core_audit_enabled', true ) ) { return; }
	$log = get_option( 'aurum_video_core_history', array() );
	$log = is_array( $log ) ? $log : array();
	array_unshift( $log, array(
		'time' => current_time( 'mysql' ), 'event' => sanitize_key( $event ),
		'post_id' => absint( $post_id ), 'user_id' => get_current_user_id(),
		'movie_id' => $post_id ? sanitize_text_field( get_post_meta( $post_id, 'aurum_movie_id', true ) ) : '',
		'fields' => array_values( array_map( 'sanitize_key', $fields ) ), 'result' => sanitize_key( $result ),
	) );
	update_option( 'aurum_video_core_history', array_slice( $log, 0, 200 ), false );
}

function aurum_video_core_audit_rest( $post, $request, $creating ) {
	$meta = $request->get_param( 'meta' );
	if ( ! get_post_meta( $post->ID, 'aurum_movie_id', true ) && ! aurum_video_core_has_video( $post->ID ) ) { return; }
	$fields = is_array( $meta ) ? array_intersect( array_keys( $meta ), array_keys( aurum_video_core_meta_fields() ) ) : array();
	if ( $request->has_param( 'aurum_video_actor' ) ) { $fields[] = 'aurum_video_actor'; }
	foreach ( array( 'title', 'content', 'excerpt' ) as $field ) {
		if ( $request->has_param( $field ) ) { $fields[] = $field; }
	}
	aurum_video_core_audit( $creating ? 'rest_created' : 'rest_updated', $post->ID, $fields );
}

function aurum_video_core_register_audit() {
	foreach ( aurum_video_core_post_types() as $type ) {
		add_action( 'rest_after_insert_' . $type, 'aurum_video_core_audit_rest', 10, 3 );
	}
}
add_action( 'init', 'aurum_video_core_register_audit', 120 );
