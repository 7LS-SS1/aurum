<?php
/**
 * Optional AURUM-hosted theme updater.
 *
 * Define this in wp-config.php (or via the `aurum_video_update_manifest_url`
 * filter) to enable automatic update checks:
 *
 * define( 'AURUM_VIDEO_UPDATE_MANIFEST', 'https://your-aurum-domain/api/wp-themes/updates/aurum-video' );
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function aurum_video_update_manifest_url() {
	$url = defined( 'AURUM_VIDEO_UPDATE_MANIFEST' ) ? AURUM_VIDEO_UPDATE_MANIFEST : '';
	return apply_filters( 'aurum_video_update_manifest_url', $url );
}

function aurum_video_fetch_update_manifest() {
	$url = aurum_video_update_manifest_url();
	if ( empty( $url ) ) {
		return null;
	}

	$response = wp_remote_get(
		$url,
		array(
			'timeout' => 8,
			'headers' => array( 'Accept' => 'application/json' ),
		)
	);
	if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
		return null;
	}

	$body = json_decode( wp_remote_retrieve_body( $response ), true );
	return is_array( $body ) ? $body : null;
}

function aurum_video_check_for_update( $transient ) {
	if ( empty( $transient->checked ) ) {
		return $transient;
	}

	$manifest = aurum_video_fetch_update_manifest();
	if ( empty( $manifest['version'] ) || empty( $manifest['download_url'] ) ) {
		return $transient;
	}

	$stylesheet = get_stylesheet();
	$current = wp_get_theme( $stylesheet )->get( 'Version' );
	if ( ! version_compare( $manifest['version'], $current, '>' ) ) {
		return $transient;
	}

	$transient->response[ $stylesheet ] = array(
		'theme'       => $stylesheet,
		'new_version' => sanitize_text_field( $manifest['version'] ),
		'url'         => esc_url_raw( $manifest['package_url'] ?? $manifest['download_url'] ),
		'package'     => esc_url_raw( $manifest['download_url'] ),
	);

	return $transient;
}
add_filter( 'pre_set_site_transient_update_themes', 'aurum_video_check_for_update' );

function aurum_video_theme_api( $result, $action, $args ) {
	if ( 'theme_information' !== $action || empty( $args->slug ) || get_stylesheet() !== $args->slug ) {
		return $result;
	}

	$manifest = aurum_video_fetch_update_manifest();
	if ( ! $manifest ) {
		return $result;
	}

	return (object) array(
		'name'          => $manifest['name'] ?? wp_get_theme()->get( 'Name' ),
		'slug'          => $args->slug,
		'version'       => $manifest['version'] ?? wp_get_theme()->get( 'Version' ),
		'author'        => 'AURUM',
		'download_link' => $manifest['download_url'] ?? '',
		'sections'      => $manifest['sections'] ?? array(),
	);
}
add_filter( 'themes_api', 'aurum_video_theme_api', 10, 3 );
