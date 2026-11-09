<?php
/** Run: php actor-pages-integration.php <theme>. */
require_once '/var/www/html/wp-load.php';
if ( ! function_exists( 'aurum_actor_pages_enabled' ) ) { fwrite( STDERR, "Actor pages module is not loaded.\n" ); exit( 1 ); }
$active_theme = get_stylesheet();
$term_id = 0;
$post_id = 0;
function actor_page_expect( $value, $message ) { if ( ! $value ) { throw new RuntimeException( $message ); } }
try {
	aurum_actor_pages_rewrites();
	flush_rewrite_rules();
	actor_page_expect( aurum_actor_pages_enabled(), $active_theme . ' enables generic actor pages' );
	$inserted = wp_insert_term( 'AURUM actor page ' . wp_generate_uuid4(), 'aurum_video_actor' );
	actor_page_expect( ! is_wp_error( $inserted ), 'actor term creates' );
	$term_id = (int) $inserted['term_id'];
	$term = get_term( $term_id, 'aurum_video_actor' );
	$post_id = wp_insert_post( array( 'post_title' => 'Actor page fixture', 'post_status' => 'publish', 'post_type' => 'post' ), true );
	actor_page_expect( ! is_wp_error( $post_id ), 'fixture post creates' );
	wp_set_object_terms( $post_id, array( $term_id ), 'aurum_video_actor' );
	actor_page_expect( false !== strpos( get_term_link( $term ), '/actors/' . $term->slug ), 'actor term canonical URL' );
	echo "AURUM_ACTOR_PAGES_OK {$active_theme}\n";
} finally {
	if ( $post_id ) { wp_delete_post( $post_id, true ); }
	if ( $term_id ) { wp_delete_term( $term_id, 'aurum_video_actor' ); }
	flush_rewrite_rules();
}
