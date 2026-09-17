<?php
/**
 * Plugin Name: AURUM Rank Math Bridge
 * Description: Authenticated REST import of Rank Math titles, descriptions and focus keywords alongside AURUM videos.
 * Version: 1.0.0
 * Requires PHP: 7.4
 * Author: 7LS
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function aurum_rank_math_keys() {
    return array( 'rank_math_title', 'rank_math_description', 'rank_math_focus_keyword' );
}
function aurum_rank_math_active() {
    return defined( 'RANK_MATH_VERSION' ) || class_exists( 'RankMath' );
}
function aurum_rank_math_types() {
    return function_exists( 'aurum_video_core_post_types' ) ? aurum_video_core_post_types() : array( 'post' );
}
function aurum_rank_math_auth( $allowed, $key, $post_id ) {
    return $post_id > 0 && current_user_can( 'edit_post', (int) $post_id );
}
function aurum_rank_math_register() {
    if ( ! aurum_rank_math_active() ) { return; }
    foreach ( aurum_rank_math_types() as $type ) {
        foreach ( aurum_rank_math_keys() as $key ) {
            register_post_meta( $type, $key, array(
                'type' => 'string', 'single' => true, 'default' => '',
                'show_in_rest' => true, 'sanitize_callback' => 'sanitize_text_field',
                'auth_callback' => 'aurum_rank_math_auth',
            ) );
        }
    }
}
add_action( 'init', 'aurum_rank_math_register', 110 );

add_action( 'rest_api_init', function () {
    register_rest_route( 'aurum-video-core/v1', '/seo-capabilities', array(
        'methods' => 'GET',
        'permission_callback' => function () { return current_user_can( 'edit_posts' ); },
        'callback' => function () {
            $types = array();
            foreach ( aurum_rank_math_types() as $type ) {
                $object = get_post_type_object( $type );
                $registered = get_registered_meta_keys( 'post', $type );
                $ready = aurum_rank_math_active() && post_type_supports( $type, 'custom-fields' );
                foreach ( aurum_rank_math_keys() as $key ) {
                    $ready = $ready && ! empty( $registered[$key]['show_in_rest'] );
                }
                if ( $ready && $object ) { $types[] = $object->rest_base ? $object->rest_base : $type; }
            }
            return rest_ensure_response( array( 'version' => '1.0.0', 'rankMathActive' => aurum_rank_math_active(), 'postTypes' => $types, 'keys' => aurum_rank_math_keys() ) );
        },
    ) );
} );

// Rank Math renders its graph before AURUM Core's standalone schema at wp_head 30.
// Suppress the standalone VideoObject only when Rank Math actually emitted one.
function aurum_rank_math_contains_video( $data ) {
    if ( ! is_array( $data ) ) { return false; }
    if ( isset( $data['@type'] ) && in_array( 'VideoObject', (array) $data['@type'], true ) ) { return true; }
    foreach ( $data as $value ) {
        if ( is_array( $value ) && aurum_rank_math_contains_video( $value ) ) { return true; }
    }
    return false;
}
add_filter( 'rank_math/json_ld', function ( $data ) {
    if ( aurum_rank_math_contains_video( $data ) ) { $GLOBALS['aurum_rank_math_video_schema'] = true; }
    return $data;
}, PHP_INT_MAX );
add_filter( 'aurum_video_core_emit_schema', function ( $emit ) {
    return $emit && empty( $GLOBALS['aurum_rank_math_video_schema'] );
} );
