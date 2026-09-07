<?php
/**
 * Independent actor directory. Images are external URLs, never duplicate attachments.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function aurum_actor_sync_register() {
	register_post_type( 'aurum_actor', array(
		'labels' => array( 'name' => 'AURUM Actors', 'singular_name' => 'AURUM Actor' ),
		'public' => true, 'show_in_rest' => false, 'rewrite' => false,
		'supports' => array( 'title', 'editor' ), 'capability_type' => 'post',
		'map_meta_cap' => true,
	) );
}
add_action( 'init', 'aurum_actor_sync_register' );

function aurum_actor_sync_permission() {
	return current_user_can( 'manage_options' );
}

/** Includes trashed posts so a retry never creates another actor after trashing. */
function aurum_actor_sync_find( $external_id ) {
	$posts = get_posts( array(
		'post_type' => 'aurum_actor', 'post_status' => array( 'publish', 'draft', 'pending', 'private', 'future', 'trash' ),
		'meta_key' => '_aurum_actor_id', 'meta_value' => $external_id,
		'numberposts' => 2, 'suppress_filters' => true,
	) );
	if ( count( $posts ) > 1 ) {
		return new WP_Error( 'actor_identity_conflict', 'Multiple records share this identity.', array( 'status' => 409 ) );
	}
	if ( $posts ) { return $posts[0]; }
	// Recover a create interrupted before metadata was committed.
	$post = get_page_by_path( 'aurum-actor-' . $external_id, OBJECT, 'aurum_actor' );
	if ( $post ) {
		$id = get_post_meta( $post->ID, '_aurum_actor_id', true );
		if ( $id !== $external_id ) {
			return new WP_Error( 'actor_identity_conflict', 'Unmapped slug exists; reconcile explicitly.', array( 'status' => 409 ) );
		}
	}
	return $post;
}

function aurum_actor_sync_snapshot( $post ) {
	$payload = get_post_meta( $post->ID, '_aurum_actor_payload', true );
	if ( ! is_array( $payload ) ) {
		return new WP_Error( 'actor_incomplete', 'Actor requires reconciliation.', array( 'status' => 409 ) );
	}
	$payload['name'] = $post->post_title;
	// Actor bio is plain text, including literal angle brackets.
	$payload['bio'] = wp_specialchars_decode( $post->post_content, ENT_QUOTES );
	$payload['slug'] = $post->post_name;
	return array( 'remoteId' => (int) $post->ID, 'payload' => $payload );
}

function aurum_actor_sync_read( $request ) {
	$post = aurum_actor_sync_find( $request['external_id'] );
	if ( is_wp_error( $post ) ) { return $post; }
	if ( ! $post ) { return new WP_REST_Response( null, 200 ); }
	if ( 'trash' === $post->post_status ) { return new WP_Error( 'actor_trashed', 'Restore actor before retrying.', array( 'status' => 409 ) ); }
	if ( ! current_user_can( 'edit_post', $post->ID ) ) {
		return new WP_Error( 'forbidden', 'Permission denied.', array( 'status' => 403 ) );
	}
	return aurum_actor_sync_snapshot( $post );
}

function aurum_actor_sync_validate( $input, $external_id ) {
	if ( ! is_array( $input ) || ! isset( $input['externalId'], $input['slug'], $input['name'], $input['bio'], $input['metadata'] )
		|| ! array_key_exists( 'profileImageUrl', $input )
		|| $input['externalId'] !== $external_id || $input['slug'] !== 'aurum-actor-' . $external_id
		|| ! is_string( $input['name'] ) || '' === trim( $input['name'] ) || strlen( $input['name'] ) > 1200
		|| ! is_string( $input['bio'] ) || strlen( $input['bio'] ) > 200000 || ! is_array( $input['metadata'] ) ) {
		return new WP_Error( 'invalid_actor', 'Invalid actor payload.', array( 'status' => 422 ) );
	}
	$url = $input['profileImageUrl'];
	if ( null !== $url && ( ! is_string( $url ) || ! preg_match( '#^https?://#i', $url ) || ! filter_var( $url, FILTER_VALIDATE_URL ) ) ) {
		return new WP_Error( 'invalid_image', 'Invalid image URL.', array( 'status' => 422 ) );
	}
	foreach ( array( 'age', 'heightCm', 'weightKg', 'measurementBust', 'measurementWaist', 'measurementHip' ) as $key ) {
		if ( ! array_key_exists( $key, $input['metadata'] ) ) {
			return new WP_Error( 'invalid_metadata', 'Incomplete actor metadata.', array( 'status' => 422 ) );
		}
		$value = $input['metadata'][ $key ];
		$numeric = in_array( $key, array( 'age', 'heightCm', 'weightKg' ), true );
		if ( null !== $value && ( $numeric ? ! is_int( $value ) : ! is_string( $value ) ) ) {
			return new WP_Error( 'invalid_metadata', 'Invalid actor metadata.', array( 'status' => 422 ) );
		}
	}
	// Keep only the explicitly managed contract.
	return array(
		'externalId' => $external_id, 'slug' => $input['slug'], 'name' => $input['name'],
		'bio' => $input['bio'], 'profileImageUrl' => $url,
		'metadata' => array_intersect_key( $input['metadata'], array_flip( array( 'age', 'heightCm', 'weightKg', 'measurementBust', 'measurementWaist', 'measurementHip' ) ) ),
	);
}

/** Named locks live on the connection: process death releases them, no stale TTL takeover. */
function aurum_actor_sync_write( $request ) {
	global $wpdb;
	$external_id = $request['external_id'];
	$input = aurum_actor_sync_validate( $request->get_json_params(), $external_id );
	if ( is_wp_error( $input ) ) { return $input; }
	$lock = 'aurum_actor_' . substr( hash( 'sha256', $wpdb->prefix . ':' . $external_id ), 0, 48 );
	if ( '1' !== (string) $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 0)', $lock ) ) ) {
		return new WP_Error( 'actor_busy', 'Actor is being synchronized. Retry later.', array( 'status' => 503 ) );
	}
	try {
		$post = aurum_actor_sync_find( $external_id );
		if ( is_wp_error( $post ) ) { return $post; }
		if ( $post && ( 'trash' === $post->post_status || ! current_user_can( 'edit_post', $post->ID ) ) ) {
			return new WP_Error( 'actor_unavailable', 'Restore actor or check permission before retrying.', array( 'status' => 409 ) );
		}
		$old = $post ? aurum_actor_sync_snapshot( $post ) : null;
		if ( is_wp_error( $old ) ) { return $old; }
		if ( $old && $old['payload'] == $input ) {
			$old['status'] = 'skipped';
			return $old;
		}
		$status = $post ? 'updated' : 'created';
		if ( $old && $old['payload']['profileImageUrl'] !== $input['profileImageUrl'] ) {
			$status = null === $input['profileImageUrl'] ? 'image_removed' : 'image_updated';
		}
		// Metadata in meta_input and deterministic slug make partial commits fail closed.
		$id = wp_insert_post( wp_slash( array(
			'ID' => $post ? $post->ID : 0, 'post_type' => 'aurum_actor',
			'post_status' => $post ? $post->post_status : 'publish',
			'post_title' => $input['name'], 'post_name' => $input['slug'], 'post_content' => esc_html( $input['bio'] ),
			'meta_input' => array( '_aurum_actor_id' => $external_id, '_aurum_actor_payload' => $input ),
		) ), true );
		if ( is_wp_error( $id ) ) {
			return new WP_Error( 'actor_write_failed', 'Actor write failed.', array( 'status' => 500 ) );
		}
		clean_post_cache( $id );
		$result = aurum_actor_sync_snapshot( get_post( $id ) );
		if ( is_wp_error( $result ) || $result['payload'] != $input ) {
			return new WP_Error( 'actor_verification_failed', 'Written actor differs from submitted data.', array( 'status' => 500 ) );
		}
		$result['status'] = $status;
		return $result;
	} finally {
		$wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $lock ) );
	}
}

add_action( 'rest_api_init', function () {
	register_rest_route( 'aurum-video-core/v1', '/actors/(?P<external_id>[a-zA-Z0-9_-]{1,128})', array(
		array( 'methods' => 'GET', 'callback' => 'aurum_actor_sync_read', 'permission_callback' => 'aurum_actor_sync_permission' ),
		array( 'methods' => 'PUT', 'callback' => 'aurum_actor_sync_write', 'permission_callback' => 'aurum_actor_sync_permission' ),
	) );
} );

add_filter( 'the_content', function ( $content ) {
	if ( 'aurum_actor' !== get_post_type() || ! is_singular( 'aurum_actor' ) || ! in_the_loop() || ! is_main_query() ) { return $content; }
	$payload = get_post_meta( get_the_ID(), '_aurum_actor_payload', true );
	$url = is_array( $payload ) ? ( $payload['profileImageUrl'] ?? null ) : null;
	return $url ? '<p><img src="' . esc_url( $url ) . '" alt="' . esc_attr( get_the_title() ) . '" loading="lazy"></p>' . $content : $content;
} );
