<?php
/**
 * Local WordPress contract tests, one isolated PHP process per theme.
 * Only temporary drafts/terms are written; active theme/plugin options stay intact.
 * Usage: WP_LOAD_PATH=/var/www/html/wp-load.php php tests/theme-integration.php THEME
 */
if ( 'cli' !== PHP_SAPI ) { exit( 1 ); }
$contract_theme = $argv[1] ?? '';
$allowed = array( '123av', 'misiav', 'rakhee', 'tiktik', 'missav', 'aurum-video', 'aurum-video-thai', 'aurum-video-avjb' );
if ( ! in_array( $contract_theme, $allowed, true ) ) { throw new RuntimeException( 'Unknown test theme' ); }
$load = getenv( 'WP_LOAD_PATH' ) ?: '/var/www/html/wp-load.php';
$_SERVER['SERVER_NAME'] = 'localhost';
$_SERVER['HTTP_HOST'] = 'localhost:8080';
$_SERVER['SERVER_PORT'] = '8080';
$_SERVER['REQUEST_URI'] = '/';
require_once dirname( $load ) . '/wp-includes/plugin.php';
add_filter( 'aurum_video_core_audit_enabled', '__return_false' );
add_filter( 'pre_option_template', function () use ( $contract_theme ) { return $contract_theme; } );
add_filter( 'pre_option_stylesheet', function () use ( $contract_theme ) { return $contract_theme; } );
add_filter( 'option_active_plugins', function ( $plugins ) {
	$plugins[] = 'aurum-video-core/aurum-video-core.php';
	return array_values( array_unique( $plugins ) );
} );
require $load;
$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
if ( ! $admins ) { throw new RuntimeException( 'A local administrator is required' ); }
wp_set_current_user( (int) $admins[0] );
if ( ! post_type_exists( 'video' ) ) {
	// Dedicated-video profile on a site whose current plugins only register posts.
	register_post_type( 'video', array( 'public' => true, 'show_in_rest' => true, 'supports' => array( 'title', 'editor', 'thumbnail' ) ) );
	aurum_video_core_register_meta();
	aurum_actor_sync_attach_post_types();
}
$ids = array();
$term_id = 0;
$checks = 0;
function check_theme_contract( $condition, $message ) {
	global $checks, $contract_theme;
	if ( ! $condition ) { throw new RuntimeException( $contract_theme . ': ' . $message ); }
	++$checks;
}
function query_test_post( $id ) {
	query_posts( array( 'p' => $id, 'post_type' => get_post_type( $id ), 'post_status' => 'any' ) );
	$GLOBALS['wp_the_query'] = $GLOBALS['wp_query'];
}
function theme_test_player( $id ) {
	global $contract_theme;
	if ( '123av' === $contract_theme ) { return av123_video_player_html( $id ); }
	if ( 'missav' === $contract_theme ) { return missav_get_video_player_html( $id ); }
	if ( in_array( $contract_theme, array( 'aurum-video', 'aurum-video-thai', 'aurum-video-avjb' ), true ) ) {
		ob_start(); aurum_render_video_player( $id ); return ob_get_clean();
	}
	$GLOBALS['post'] = get_post( $id ); setup_postdata( $GLOBALS['post'] );
	ob_start(); get_template_part( 'template-parts/video-player' ); return ob_get_clean();
}
try {
	$term = wp_insert_term( 'AURUM integration ' . wp_generate_uuid4(), 'aurum_video_actor' );
	check_theme_contract( ! is_wp_error( $term ), 'temporary actor term created' );
	$term_id = (int) $term['term_id'];
	foreach ( array( 'post', 'video' ) as $type ) {
		check_theme_contract( post_type_supports( $type, 'custom-fields' ), $type . ' supports REST metadata' );
		check_theme_contract( is_object_in_taxonomy( $type, 'aurum_video_actor' ), $type . ' supports AURUM actors' );
		$meta = array(
			'aurum_movie_id' => 'contract-' . wp_generate_uuid4(),
			'aurum_video_url' => 'https://example.com/canonical.mp4',
			'video_url' => 'https://example.com/alias.mp4',
			'aurum_thumbnail_url' => 'https://example.com/poster.webp',
			'aurum_preview_url' => 'https://example.com/preview.webm',
		);
		$request = new WP_REST_Request( 'POST', '/wp/v2/' . get_post_type_object( $type )->rest_base );
		if ( ! get_post_type_object( $type )->rest_base ) { $request = new WP_REST_Request( 'POST', '/wp/v2/' . $type ); }
		$request->set_body_params( array( 'title' => 'AURUM contract test', 'content' => '<p>Editorial copy survives.</p>', 'excerpt' => 'Video description.', 'status' => 'draft', 'meta' => $meta, 'aurum_video_actor' => array( $term_id ) ) );
		$response = rest_do_request( $request );
		check_theme_contract( 201 === $response->get_status(), $type . ' REST create: ' . wp_json_encode( $response->get_data() ) );
		$id = (int) $response->get_data()['id']; $ids[] = $id;
		$get = new WP_REST_Request( 'GET', '/wp/v2/' . ( get_post_type_object( $type )->rest_base ?: $type ) . '/' . $id );
		$get->set_param( 'context', 'edit' );
		$data = rest_do_request( $get )->get_data();
		foreach ( $meta as $key => $value ) { check_theme_contract( ( $data['meta'][$key] ?? null ) === $value, $type . ' persisted ' . $key ); }
		check_theme_contract( in_array( $term_id, $data['aurum_video_actor'] ?? array(), true ), $type . ' REST actor assignment' );
		query_test_post( $id );
		check_theme_contract( aurum_video_core_theme_renders_player( $id ), 'queried theme player owns media' );
		check_theme_contract( false !== strpos( aurum_theme_contract_actor_links( $id ), 'AURUM integration' ), 'actor label is rendered' );
		$html = theme_test_player( $id );
		check_theme_contract( 1 === preg_match_all( '/<video\b/i', $html ), 'one direct player' );
		check_theme_contract( false !== strpos( $html, 'canonical.mp4' ) && false === strpos( $html, 'alias.mp4' ), 'canonical playback precedes alias' );
		check_theme_contract( false !== strpos( $html, 'poster.webp' ), 'external poster rendered' );
		$GLOBALS['post'] = get_post( $id ); setup_postdata( $GLOBALS['post'] );
		ob_start();
		if ( in_array( $contract_theme, array( 'aurum-video', 'aurum-video-thai', 'aurum-video-avjb' ), true ) ) { aurum_video_card(); }
		elseif ( 'missav' === $contract_theme ) { missav_render_video_card( $id ); }
		elseif ( 'tiktik' === $contract_theme ) { get_template_part( 'template-parts/content-card' ); }
		elseif ( '123av' === $contract_theme ) { echo av123_homepage_preview_url( $id ); }
		else { get_template_part( 'template-parts/video-card' ); }
		$card = ob_get_clean();
		check_theme_contract( false !== strpos( $card, 'preview.webm' ), 'canonical preview URL reaches the card' );
		if ( '123av' !== $contract_theme ) { check_theme_contract( false !== strpos( $card, 'poster.webp' ), 'canonical thumbnail reaches the card' ); }
		// Render the real template, including wp_head, content filters and theme partials.
		query_test_post( $id );
		$template = apply_filters( 'template_include', get_single_template() );
		$head_count = did_action( 'wp_head' );
		ob_start(); include $template; $page = ob_get_clean();
		// get_header() loads once per process; a second simulated request needs wp_head explicitly.
		if ( did_action( 'wp_head' ) === $head_count ) { ob_start(); wp_head(); $page .= ob_get_clean(); }
		check_theme_contract( false !== strpos( $page, 'Editorial copy survives.' ), 'full watch template preserves copy' );
		check_theme_contract( 1 === preg_match_all( '/<(?:video|iframe)\b[^>]*(?:data-aurum-video|src="https:\/\/example.com\/embed)/i', $page ), 'full template has one primary player' );
		check_theme_contract( 1 === preg_match_all( '/"@type"\s*:\s*"VideoObject"/', $page ), 'full template emits exactly one VideoObject; count=' . preg_match_all( '/"@type"\s*:\s*"VideoObject"/', $page ) . ' core=' . (int) aurum_video_core_should_emit_schema( $id ) . ' data=' . wp_json_encode( aurum_video_core_schema_data( $id ) ) );
		query_test_post( $id );
		update_post_meta( $id, 'aurum_iframe_url', 'https://example.com/embed/canonical' );
		$html = theme_test_player( $id );
		check_theme_contract( 1 === preg_match_all( '/<iframe\b/i', $html ) && 0 === preg_match_all( '/<video\b/i', $html ), 'iframe takes precedence' );
		delete_post_meta( $id, 'aurum_video_url' ); delete_post_meta( $id, 'video_url' );
		$html = theme_test_player( $id );
		check_theme_contract( false !== strpos( $html, '/embed/canonical' ), 'iframe-only post renders' );
		if ( '123av' === $contract_theme ) { check_theme_contract( av123_is_video_post( $id ), '123AV recognizes iframe-only post' ); }
		delete_post_meta( $id, 'aurum_iframe_url' );
		update_post_meta( $id, 'aurum_video_url', 'https://example.com/master.m3u8?token=test' );
		$html = theme_test_player( $id );
		check_theme_contract( false !== strpos( $html, '<video' ) && false === strpos( $html, '<iframe' ), 'HLS uses a video, not an iframe' );
		if ( 'misiav' !== $contract_theme ) { check_theme_contract( false !== strpos( $html, 'application/vnd.apple.mpegurl' ), 'HLS MIME is correct' ); }
		delete_post_meta( $id, 'aurum_video_url' );
		wp_update_post( array( 'ID' => $id, 'post_content' => '<p>Editorial copy survives.</p><!-- aurum-video --><div class="aurum-video"><a href="https://example.com/legacy.mp4">Watch video</a></div>' ) );
		$html = theme_test_player( $id );
		check_theme_contract( false !== strpos( $html, 'legacy.mp4' ), 'marked legacy source remains playable' );
		$GLOBALS['wp_query']->in_the_loop = true;
		$filtered = aurum_video_core_filter_content( get_post_field( 'post_content', $id ) );
		check_theme_contract( false === strpos( $filtered, '<video' ) && false === strpos( $filtered, '<iframe' ), 'Core does not duplicate theme legacy player' );
		check_theme_contract( false !== strpos( $filtered, 'Editorial copy survives.' ), 'editorial copy preserved' );
		// Schema ownership is exercised with complete metadata and without relying on Rank Math.
		update_post_meta( $id, 'aurum_video_url', 'https://example.com/canonical.mp4' );
		ob_start(); aurum_video_core_output_schema();
		if ( 'rakhee' === $contract_theme ) { rakhee_video_schema( $id ); }
		if ( 'misiav' === $contract_theme ) { misiav_video_schema( $id ); }
		if ( '123av' === $contract_theme && function_exists( 'av123_search_output_video_schema' ) ) { av123_search_output_video_schema(); }
		$schema = ob_get_clean();
		check_theme_contract( preg_match_all( '/"@type"\s*:\s*"VideoObject"/', $schema ) <= 1, 'VideoObject emitters do not duplicate' );
	}
	check_theme_contract( '' === aurum_theme_contract_url( $ids[0], array( 'missing' ) ), 'missing media stays empty' );
	if ( '123av' === $contract_theme ) {
		$iframe_id = wp_insert_post( array( 'post_status' => 'draft', 'post_title' => 'AURUM iframe-only SEO contract', 'post_content' => '<p>Iframe description.</p>', 'meta_input' => array( 'aurum_iframe_url' => 'https://example.com/embed/only', 'aurum_thumbnail_url' => 'https://example.com/poster.webp' ) ) );
		$ids[] = $iframe_id;
		// Simulate a public fixture in this process only; the database stays draft.
		$fixture = get_post( $iframe_id ); $fixture->post_status = 'publish';
		wp_cache_set( $iframe_id, $fixture, 'posts' );
		query_test_post( $iframe_id );
		check_theme_contract( av123_search_is_watch_post( $iframe_id ), 'iframe-only media belongs in video SEO inventory' );
		$seo = av123_search_video_metadata( $iframe_id );
		check_theme_contract( ( $seo['embed_url'] ?? '' ) === 'https://example.com/embed/only' && empty( $seo['content_url'] ), 'iframe URL is an embed URL, never a content URL' );
		$graph = av123_search_rank_math_video_object( array() );
		check_theme_contract( 1 === count( $graph ) && isset( $graph['av123-video']['embedUrl'] ), 'iframe-only Rank Math graph is populated' );
	}
	$article = wp_insert_post( array( 'post_status' => 'draft', 'post_title' => 'AURUM non-video contract', 'post_content' => '<p>Ordinary article.</p>' ) );
	$ids[] = $article;
	query_test_post( $article );
	check_theme_contract( ! aurum_video_core_theme_renders_player( $article ), 'ordinary article does not claim a missing player' );
	check_theme_contract( ! aurum_video_core_theme_renders_player( $ids[0] ), 'secondary post does not claim the queried player' );
	update_post_meta( $ids[0], 'aurum_preview_url', 'javascript:alert(1)' );
	check_theme_contract( '' === aurum_theme_contract_media( $ids[0] )['preview_url'], 'unsafe URL rejected' );
	echo 'AURUM_THEME_OK ' . $contract_theme . ' checks=' . $checks . "\n";
} finally {
	foreach ( $ids as $id ) { wp_delete_post( $id, true ); }
	if ( $term_id ) { wp_delete_term( $term_id, 'aurum_video_actor' ); }
	wp_reset_query();
}
