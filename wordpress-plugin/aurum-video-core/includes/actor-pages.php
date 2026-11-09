<?php
/**
 * Theme-neutral public directory and profile pages for synchronized AURUM actors.
 * Themes with their own actor-profile module (currently 123AV) retain ownership.
 */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function aurum_actor_pages_theme_owns_routes() {
	return file_exists( get_template_directory() . '/inc/actor-profile.php' );
}

function aurum_actor_pages_enabled() {
	return ! aurum_actor_pages_theme_owns_routes() && taxonomy_exists( 'aurum_video_actor' );
}

function aurum_actor_pages_rewrites() {
	if ( ! aurum_actor_pages_enabled() ) { return; }
	add_rewrite_rule( '^actors/?$', 'index.php?aurum_actor_directory=1', 'top' );
	foreach ( array( 'actres', 'actress', 'actresses' ) as $alias ) {
		add_rewrite_rule( '^' . $alias . '/?$', 'index.php?aurum_actor_directory=1&aurum_actor_alias=1', 'top' );
		add_rewrite_rule( '^' . $alias . '/([^/]+)/?$', 'index.php?taxonomy=aurum_video_actor&term=$matches[1]&aurum_actor_profile=1&aurum_actor_alias=1', 'top' );
	}
	add_rewrite_rule( '^actors/([^/]+)/?$', 'index.php?taxonomy=aurum_video_actor&term=$matches[1]&aurum_actor_profile=1', 'top' );
}
add_action( 'init', 'aurum_actor_pages_rewrites', 120 );

/** Refresh only once per Core version, after the actor routes are registered. */
function aurum_actor_pages_maybe_flush_rewrites() {
	if ( ! aurum_actor_pages_enabled() || AURUM_VIDEO_CORE_VERSION === get_option( 'aurum_actor_pages_rewrite_version' ) ) { return; }
	flush_rewrite_rules( false );
	update_option( 'aurum_actor_pages_rewrite_version', AURUM_VIDEO_CORE_VERSION, false );
}
add_action( 'init', 'aurum_actor_pages_maybe_flush_rewrites', 130 );

function aurum_actor_pages_query_vars( $vars ) {
	return array_merge( $vars, array( 'aurum_actor_directory', 'aurum_actor_profile', 'aurum_actor_alias' ) );
}
add_filter( 'query_vars', 'aurum_actor_pages_query_vars' );

function aurum_actor_pages_term_link( $url, $term, $taxonomy ) {
	if ( aurum_actor_pages_enabled() && 'aurum_video_actor' === $taxonomy && $term instanceof WP_Term ) {
		return home_url( user_trailingslashit( 'actors/' . $term->slug ) );
	}
	return $url;
}
add_filter( 'term_link', 'aurum_actor_pages_term_link', 20, 3 );

function aurum_actor_pages_redirect_alias() {
	if ( ! aurum_actor_pages_enabled() || ! get_query_var( 'aurum_actor_alias' ) ) { return; }
	$path = get_query_var( 'aurum_actor_profile' ) ? 'actors/' . sanitize_title( get_query_var( 'term' ) ) : 'actors/';
	wp_safe_redirect( home_url( user_trailingslashit( $path ) ), 301, 'AURUM Video Core' );
	exit;
}
add_action( 'template_redirect', 'aurum_actor_pages_redirect_alias', 1 );

function aurum_actor_pages_template( $template ) {
	if ( aurum_actor_pages_enabled() && ( get_query_var( 'aurum_actor_directory' ) || get_query_var( 'aurum_actor_profile' ) ) ) {
		return AURUM_VIDEO_CORE_DIR . 'includes/templates/actor-pages.php';
	}
	return $template;
}
add_filter( 'template_include', 'aurum_actor_pages_template', 90 );

function aurum_actor_pages_assets() {
	if ( ! aurum_actor_pages_enabled() || ( ! get_query_var( 'aurum_actor_directory' ) && ! get_query_var( 'aurum_actor_profile' ) ) ) { return; }
	wp_register_style( 'aurum-actor-pages', false, array(), AURUM_VIDEO_CORE_VERSION );
	wp_enqueue_style( 'aurum-actor-pages' );
	wp_add_inline_style( 'aurum-actor-pages', '.aurum-actors{max-width:1180px;margin:0 auto;padding:48px 24px;color:inherit}.aurum-actors__crumb{margin:0 0 18px;font-size:.9rem;opacity:.8}.aurum-actors h1{margin:0 0 28px;font-size:clamp(1.8rem,4vw,3rem)}.aurum-actors__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:18px}.aurum-actor-card{display:block;overflow:hidden;border:1px solid currentColor;border-color:color-mix(in srgb,currentColor 20%,transparent);border-radius:10px;text-decoration:none;color:inherit;background:color-mix(in srgb,currentColor 4%,transparent)}.aurum-actor-card__image{aspect-ratio:3/4;background:#252525;display:grid;place-items:center;font-size:2rem;overflow:hidden}.aurum-actor-card__image img{width:100%;height:100%;object-fit:cover}.aurum-actor-card__body{padding:12px}.aurum-actor-card__body strong,.aurum-actor-card__body span{display:block}.aurum-actor-card__body span{opacity:.7;font-size:.85rem;margin-top:5px}.aurum-actor-profile{display:grid;grid-template-columns:minmax(160px,280px) 1fr;gap:30px;margin-bottom:38px;padding:24px;border:1px solid currentColor;border-color:color-mix(in srgb,currentColor 20%,transparent);border-radius:12px}.aurum-actor-profile__image{aspect-ratio:3/4;background:#252525;display:grid;place-items:center;font-size:3rem;overflow:hidden}.aurum-actor-profile__image img{width:100%;height:100%;object-fit:cover}.aurum-actor-profile__bio{line-height:1.7}.aurum-actor-videos{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}.aurum-actor-video{text-decoration:none;color:inherit}.aurum-actor-video img,.aurum-actor-video__placeholder{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#252525}.aurum-actor-video strong{display:block;margin-top:8px;line-height:1.4}@media(max-width:640px){.aurum-actors{padding:32px 16px}.aurum-actor-profile{grid-template-columns:110px 1fr;gap:18px;padding:16px}}' );
}
add_action( 'wp_enqueue_scripts', 'aurum_actor_pages_assets', 30 );

function aurum_actor_pages_image( $term ) {
	return esc_url( (string) get_term_meta( $term->term_id, '_av123_actor_profile_image_url', true ) );
}

function aurum_actor_pages_name_initial( $name ) {
	return function_exists( 'mb_substr' ) ? mb_substr( $name, 0, 1 ) : substr( $name, 0, 1 );
}
