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

/**
 * Video-facing actor taxonomy. Kept separate from the `aurum_actor` CPT
 * (which remains the actor directory/profile record) so existing CPT-based
 * code paths are untouched. This taxonomy is what videos (post type `post`)
 * actually attach to, and what the theme's directory/related/chip logic
 * reads. Term meta reuses the theme's own `_av123_actor_*` key convention so
 * the theme needs no new reader code, only a new taxonomy name to check.
 */
function aurum_actor_sync_taxonomy_register() {
	register_taxonomy( 'aurum_video_actor', array( 'post' ), array(
		'labels'            => array(
			'name'          => 'AURUM Actor (video)',
			'singular_name' => 'AURUM Actor',
		),
		'public'            => true,
		'show_ui'           => true,
		'show_in_rest'      => true,
		'hierarchical'      => false,
		'rewrite'           => false,
		'show_admin_column' => true,
	) );
}
add_action( 'init', 'aurum_actor_sync_taxonomy_register' );

/** Logical actor field -> theme-compatible term-meta key (matches 123av's `_av123_actor_*` convention). */
function aurum_actor_sync_term_meta_fields() {
	return array(
		'bio'    => '_av123_actor_bio',
		'age'    => '_av123_actor_age',
		'height' => '_av123_actor_height',
		'weight' => '_av123_actor_weight',
		'bust'   => '_av123_actor_bust',
		'waist'  => '_av123_actor_waist',
		'hips'   => '_av123_actor_hips',
	);
}

/** Find the `aurum_video_actor` term mapped to this external actor ID, if any. */
function aurum_actor_sync_find_term( $external_id ) {
	$terms = get_terms( array(
		'taxonomy'         => 'aurum_video_actor',
		'hide_empty'       => false,
		'meta_key'         => '_aurum_actor_id',
		'meta_value'       => $external_id,
		'number'           => 2,
		'suppress_filters' => true,
	) );
	if ( is_wp_error( $terms ) ) {
		return $terms;
	}
	if ( count( $terms ) > 1 ) {
		return new WP_Error( 'actor_term_identity_conflict', 'Multiple terms share this identity.', array( 'status' => 409 ) );
	}
	return $terms ? $terms[0] : null;
}

/**
 * Find-or-create the `aurum_video_actor` term for this actor and keep its
 * name and term meta (bio/metrics/profile image URL) in sync. Never touches
 * the slug once a term exists, so already-indexed `/actres/{slug}/` URLs
 * are stable. Returns the term ID or a WP_Error.
 */
function aurum_actor_sync_write_term( $external_id, $input ) {
	$term = aurum_actor_sync_find_term( $external_id );
	if ( is_wp_error( $term ) ) {
		return $term;
	}

	if ( $term ) {
		if ( $term->name !== $input['name'] ) {
			$updated = wp_update_term( $term->term_id, 'aurum_video_actor', array( 'name' => $input['name'] ) );
			if ( is_wp_error( $updated ) ) {
				return $updated;
			}
		}
		$term_id = $term->term_id;
	} else {
		$inserted = wp_insert_term( $input['name'], 'aurum_video_actor' );
		if ( is_wp_error( $inserted ) ) {
			if ( 'term_exists' === $inserted->get_error_code() ) {
				return new WP_Error( 'actor_term_conflict', 'A term with this name already exists and is not mapped to this actor.', array( 'status' => 409 ) );
			}
			return $inserted;
		}
		$term_id = $inserted['term_id'];
		update_term_meta( $term_id, '_aurum_actor_id', $external_id );
	}

	$metadata = is_array( $input['metadata'] ) ? $input['metadata'] : array();
	$values   = array(
		'bio'    => $input['bio'],
		'age'    => $metadata['age'] ?? null,
		'height' => $metadata['heightCm'] ?? null,
		'weight' => $metadata['weightKg'] ?? null,
		'bust'   => $metadata['measurementBust'] ?? null,
		'waist'  => $metadata['measurementWaist'] ?? null,
		'hips'   => $metadata['measurementHip'] ?? null,
	);
	foreach ( aurum_actor_sync_term_meta_fields() as $field => $meta_key ) {
		$value = $values[ $field ];
		if ( null === $value || '' === $value ) {
			delete_term_meta( $term_id, $meta_key );
		} else {
			update_term_meta( $term_id, $meta_key, $value );
		}
	}

	// External URL only: never uploaded to the Media Library, distinct from
	// the theme's own `_av123_actor_profile_image_id` attachment-ID key.
	if ( $input['profileImageUrl'] ) {
		update_term_meta( $term_id, '_av123_actor_profile_image_url', $input['profileImageUrl'] );
	} else {
		delete_term_meta( $term_id, '_av123_actor_profile_image_url' );
	}

	return (int) $term_id;
}

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
	if ( ! $post ) { return new WP_REST_Response( array( 'found' => false ), 200 ); }
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
			$term_id = aurum_actor_sync_write_term( $external_id, $input );
			if ( is_wp_error( $term_id ) ) {
				return $term_id;
			}
			$old['status'] = 'skipped';
			$old['termId'] = $term_id;
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
		$term_id = aurum_actor_sync_write_term( $external_id, $input );
		if ( is_wp_error( $term_id ) ) {
			return $term_id;
		}
		$result['status'] = $status;
		$result['termId'] = $term_id;
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
