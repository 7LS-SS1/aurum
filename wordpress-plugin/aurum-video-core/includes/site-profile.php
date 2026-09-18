<?php
/** Site-specific WordPress ownership; preserve existing registrations and URLs. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function aurum_video_core_settings() {
	$settings = get_option( 'aurum_video_core_settings', array() );
	return wp_parse_args( is_array( $settings ) ? $settings : array(), array(
		'profile' => 'auto', 'category_taxonomy' => '', 'tag_taxonomy' => '', 'project_url' => '',
	) );
}

/** Register a portable fallback only when a site explicitly requests the video profile. */
function aurum_video_core_register_profile() {
	$settings = aurum_video_core_settings();
	if ( 'video' !== $settings['profile'] ) { return; }
	if ( ! post_type_exists( 'video' ) ) {
		register_post_type( 'video', array(
			'labels' => array( 'name' => 'วิดีโอ AURUM', 'singular_name' => 'วิดีโอ' ),
			'public' => true, 'show_in_rest' => true, 'rest_base' => 'video',
			'has_archive' => true, 'rewrite' => array( 'slug' => 'videos', 'with_front' => false ),
			'menu_icon' => 'dashicons-video-alt3',
			'supports' => array( 'title', 'editor', 'excerpt', 'thumbnail', 'author', 'comments', 'custom-fields', 'revisions' ),
		) );
	}
	foreach ( array( 'video_category' => true, 'video_tag' => false ) as $taxonomy => $hierarchical ) {
		if ( ! taxonomy_exists( $taxonomy ) ) {
			register_taxonomy( $taxonomy, array( 'video' ), array(
				'labels' => array( 'name' => $hierarchical ? 'หมวดหมู่วิดีโอ' : 'แท็กวิดีโอ' ),
				'public' => true, 'show_in_rest' => true, 'show_admin_column' => true,
				'hierarchical' => $hierarchical, 'rewrite' => false,
			) );
		}
	}
}
add_action( 'init', 'aurum_video_core_register_profile', 30 );

function aurum_video_core_profile( $post_type = null ) {
	$settings = aurum_video_core_settings();
	$type = $post_type ?: ( 'video' === $settings['profile'] ? 'video' : 'post' );
	$object = get_post_type_object( $type );
	$taxonomies = array();
	foreach ( array( 'category' => 'category_taxonomy', 'tag' => 'tag_taxonomy' ) as $kind => $setting ) {
		$fallback = 'video' === $type && taxonomy_exists( 'video_' . $kind ) && is_object_in_taxonomy( $type, 'video_' . $kind )
			? 'video_' . $kind : ( 'tag' === $kind ? 'post_tag' : 'category' );
		$chosen = $settings[ $setting ] ?: $fallback;
		$tax = get_taxonomy( $chosen );
		$taxonomies[ $kind ] = array(
			'name' => $chosen,
			'restBase' => $tax ? ( $tax->rest_base ?: $tax->name ) : '',
			'ready' => (bool) ( $tax && $tax->show_in_rest && is_object_in_taxonomy( $type, $chosen ) ),
		);
	}
	return array(
		'mode' => $settings['profile'], 'postType' => $type,
		'restBase' => $object ? ( $object->rest_base ?: $object->name ) : '',
		'ready' => (bool) ( $object && $object->show_in_rest && $taxonomies['category']['ready'] && $taxonomies['tag']['ready'] ),
		'taxonomies' => $taxonomies, 'actorRestBase' => 'aurum_video_actor',
	);
}

/** Only AURUM-marked posts belong in the plugin's management views. */
function aurum_video_core_managed_query( $args = array() ) {
	$types = array( 'post' );
	if ( post_type_exists( 'video' ) ) { $types[] = 'video'; }
	return new WP_Query( wp_parse_args( $args, array(
		'post_type' => $types, 'post_status' => array( 'publish', 'future', 'draft', 'pending', 'private' ),
		'posts_per_page' => 20, 'orderby' => 'ID', 'order' => 'DESC',
		'meta_query' => array( 'relation' => 'OR',
			array( 'key' => 'aurum_movie_id', 'value' => '', 'compare' => '!=' ),
			array( 'key' => 'aurum_video_url', 'value' => '', 'compare' => '!=' ),
			array( 'key' => 'aurum_iframe_url', 'value' => '', 'compare' => '!=' ),
		),
	) ) );
}
