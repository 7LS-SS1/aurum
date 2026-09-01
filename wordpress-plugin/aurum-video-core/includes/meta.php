<?php
/**
 * REST-visible AURUM video metadata and integration diagnostics.
 *
 * @package AurumVideoCore
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Canonical fields and compatibility aliases written by AURUM.
 *
 * Yoast's private fields deliberately do not appear here. Yoast owns those
 * fields; this plugin uses public filters in seo.php instead.
 *
 * @return array<string,string>
 */
function aurum_video_core_meta_fields() {
	return array(
		'aurum_movie_id'          => 'text',
		'aurum_provider'          => 'text',
		'aurum_video_url'         => 'url',
		'aurum_iframe_url'        => 'url',
		'aurum_thumbnail_url'     => 'url',
		'aurum_preview_url'       => 'url',
		'aurum_jwplayer_media_id' => 'text',
		'video_provider'          => 'text',
		'video_url'               => 'url',
		'iframe_url'              => 'url',
		'thumbnail_url'           => 'url',
		'preview_url'             => 'url',
		'jwplayer_media_id'       => 'text',
	);
}

/**
 * Returns public REST post subtypes plus explicitly configured subtypes.
 *
 * AURUM stores a REST base (for example `posts`) on TargetSite, while
 * register_post_meta() expects the internal post type (`post`). Registering
 * every public show_in_rest subtype avoids hard-coding either spelling.
 *
 * @return string[]
 */
function aurum_video_core_post_types() {
	$post_types = get_post_types(
		array(
			'public'       => true,
			'show_in_rest' => true,
		),
		'names'
	);

	$post_types = array_values( array_unique( array_merge( array( 'post' ), array_values( $post_types ) ) ) );

	/**
	 * Filters WordPress post subtypes that accept AURUM video metadata.
	 *
	 * @param string[] $post_types Internal post type names.
	 */
	return array_values( array_unique( array_filter( (array) apply_filters( 'aurum_video_core_post_types', $post_types ), 'post_type_exists' ) ) );
}

/** Registers all canonical and alias fields for every supported post type. */
function aurum_video_core_register_meta() {
	$GLOBALS['aurum_video_core_registration_errors'] = array();

	if ( ! function_exists( 'register_post_meta' ) ) {
		$GLOBALS['aurum_video_core_registration_errors'][] = __( 'register_post_meta() is unavailable. WordPress 4.9.8 or newer is required.', 'aurum-video-core' );
		return;
	}

	$post_types = aurum_video_core_post_types();
	if ( empty( $post_types ) ) {
		$GLOBALS['aurum_video_core_registration_errors'][] = __( 'No public REST-enabled post type is available for AURUM metadata.', 'aurum-video-core' );
		return;
	}

	foreach ( $post_types as $post_type ) {
		foreach ( aurum_video_core_meta_fields() as $meta_key => $kind ) {
			$registered = register_post_meta(
				$post_type,
				$meta_key,
				array(
					'type'              => 'string',
					'single'            => true,
					'show_in_rest'      => true,
					'default'           => '',
					'sanitize_callback' => 'url' === $kind ? 'esc_url_raw' : 'sanitize_text_field',
					'auth_callback'     => 'aurum_video_core_auth_meta',
				)
			);

			if ( false === $registered ) {
				$GLOBALS['aurum_video_core_registration_errors'][] = sprintf(
					/* translators: 1: meta key, 2: post type. */
					__( 'Could not register %1$s for post type %2$s.', 'aurum-video-core' ),
					$meta_key,
					$post_type
				);
			}
		}
	}
}
add_action( 'init', 'aurum_video_core_register_meta', 100 );

/**
 * Restricts REST writes to users who can edit the concrete post.
 *
 * @param bool   $allowed Existing authorization result.
 * @param string $meta_key Meta key.
 * @param int    $post_id Post ID.
 * @return bool
 */
function aurum_video_core_auth_meta( $allowed = false, $meta_key = '', $post_id = 0 ) {
	unset( $allowed, $meta_key );
	return $post_id > 0 ? current_user_can( 'edit_post', (int) $post_id ) : current_user_can( 'edit_posts' );
}

/** Shows administrators a clear error instead of allowing silent REST drops. */
function aurum_video_core_admin_notice() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	$errors = isset( $GLOBALS['aurum_video_core_registration_errors'] ) ? (array) $GLOBALS['aurum_video_core_registration_errors'] : array();
	if ( empty( $errors ) ) {
		return;
	}

	echo '<div class="notice notice-error"><p><strong>' . esc_html__( 'AURUM Video Core is not ready:', 'aurum-video-core' ) . '</strong> ';
	echo esc_html( implode( ' ', $errors ) );
	echo '</p></div>';
}
add_action( 'admin_notices', 'aurum_video_core_admin_notice' );

/** Registers an authenticated, read-only integration-health endpoint. */
function aurum_video_core_register_diagnostics_route() {
	register_rest_route(
		'aurum-video-core/v1',
		'/diagnostics',
		array(
			'methods'             => 'GET',
			'callback'            => 'aurum_video_core_diagnostics',
			'permission_callback' => function () {
				return current_user_can( 'edit_posts' );
			},
		)
	);
}
add_action( 'rest_api_init', 'aurum_video_core_register_diagnostics_route' );

/** @return WP_REST_Response */
function aurum_video_core_diagnostics() {
	$post_types = aurum_video_core_post_types();
	$fields     = array_keys( aurum_video_core_meta_fields() );
	$missing    = array();

	foreach ( $post_types as $post_type ) {
		$registered = get_registered_meta_keys( 'post', $post_type );
		$absent     = array_values( array_diff( $fields, array_keys( $registered ) ) );
		if ( ! empty( $absent ) ) {
			$missing[ $post_type ] = $absent;
		}
	}

	return rest_ensure_response(
		array(
			'ready'      => empty( $missing ) && empty( $GLOBALS['aurum_video_core_registration_errors'] ),
			'version'    => AURUM_VIDEO_CORE_VERSION,
			'postTypes'  => $post_types,
			'metaFields' => $fields,
			'missing'    => $missing,
			'yoast'      => defined( 'WPSEO_VERSION' ),
		)
	);
}
