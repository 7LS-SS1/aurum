<?php
/**
 * VideoObject, Yoast public integrations, adult-page signal, and sitemap.
 *
 * @package AurumVideoCore
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @return bool */
function aurum_video_core_has_video( $post_id ) {
	$meta = aurum_video_core_get_meta( $post_id );
	return (bool) ( aurum_video_core_safe_url( $meta['video_url'] ) || aurum_video_core_safe_url( $meta['iframe_url'] ) );
}

/** Returns a stable poster URL, preferring canonical AURUM metadata. */
function aurum_video_core_thumbnail_url( $post_id ) {
	$meta = aurum_video_core_get_meta( $post_id );
	$url  = aurum_video_core_safe_url( $meta['thumbnail_url'] );
	if ( $url ) {
		return $url;
	}
	$url = get_the_post_thumbnail_url( $post_id, 'full' );
	return aurum_video_core_safe_url( $url );
}

/** Creates a natural description from existing editorial content only. */
function aurum_video_core_description( $post_id ) {
	$description = wp_strip_all_tags( (string) get_the_excerpt( $post_id ), true );
	if ( '' === trim( $description ) ) {
		$content     = aurum_video_core_strip_fallback( (string) get_post_field( 'post_content', $post_id ) );
		$description = wp_strip_all_tags( strip_shortcodes( $content ), true );
	}
	$description = trim( preg_replace( '/\s+/u', ' ', $description ) );
	return function_exists( 'mb_substr' ) ? mb_substr( $description, 0, 300 ) : substr( $description, 0, 300 );
}

/**
 * Explicit classification is opt-in. It is never inferred merely because a
 * site contains adult material, so non-explicit pages are not mislabeled.
 */
function aurum_video_core_is_explicit( $post_id ) {
	$raw      = get_post_meta( $post_id, 'aurum_explicit', true );
	$explicit = in_array( strtolower( (string) $raw ), array( '1', 'true', 'yes', 'adult', 'explicit' ), true );
	return (bool) apply_filters( 'aurum_video_core_is_explicit', $explicit, $post_id );
}

/** Outputs the SafeSearch-compatible adult rating only for explicit pages. */
function aurum_video_core_rating_meta() {
	if ( is_singular() && aurum_video_core_is_explicit( get_queried_object_id() ) ) {
		echo '<meta name="rating" content="adult">' . "\n";
	}
}
add_action( 'wp_head', 'aurum_video_core_rating_meta', 2 );

/** Converts known duration formats to an ISO-8601 duration. */
function aurum_video_core_duration_iso( $post_id ) {
	$keys  = array( 'aurum_duration', 'aurum_duration_seconds', '_misiav_duration', 'duration' );
	$value = '';
	foreach ( $keys as $key ) {
		$candidate = get_post_meta( $post_id, $key, true );
		if ( '' !== (string) $candidate ) {
			$value = trim( (string) $candidate );
			break;
		}
	}

	if ( preg_match( '/^PT(?:\d+H)?(?:\d+M)?(?:\d+S)?$/', $value ) ) {
		return $value;
	}
	if ( ctype_digit( $value ) ) {
		$seconds = (int) $value;
	} elseif ( preg_match( '/^(?:(\d+):)?(\d{1,2}):(\d{2})$/', $value, $parts ) ) {
		$seconds = (int) $parts[1] * 3600 + (int) $parts[2] * 60 + (int) $parts[3];
	} else {
		return '';
	}

	if ( $seconds <= 0 ) {
		return '';
	}
	$hours   = intdiv( $seconds, 3600 );
	$minutes = intdiv( $seconds % 3600, 60 );
	$remain  = $seconds % 60;
	return 'PT' . ( $hours ? $hours . 'H' : '' ) . ( $minutes ? $minutes . 'M' : '' ) . ( $remain || ( ! $hours && ! $minutes ) ? $remain . 'S' : '' );
}

/** Converts ISO/numeric/clock duration to seconds for video sitemaps. */
function aurum_video_core_duration_seconds( $post_id ) {
	$iso = aurum_video_core_duration_iso( $post_id );
	if ( ! $iso || ! preg_match( '/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/', $iso, $parts ) ) {
		return 0;
	}
	return (int) ( isset( $parts[1] ) ? $parts[1] : 0 ) * 3600 + (int) ( isset( $parts[2] ) ? $parts[2] : 0 ) * 60 + (int) ( isset( $parts[3] ) ? $parts[3] : 0 );
}

/** Returns a real recorded view count, never a placeholder. */
function aurum_video_core_view_count( $post_id ) {
	foreach ( array( '_aurum_wp_views', 'post_views_count', '_misiav_views', 'views' ) as $key ) {
		$value = get_post_meta( $post_id, $key, true );
		if ( is_numeric( $value ) && (int) $value > 0 ) {
			return (int) $value;
		}
	}
	return 0;
}

/** @return array<string,mixed> */
function aurum_video_core_schema_data( $post_id ) {
	$meta        = aurum_video_core_get_meta( $post_id );
	$video_url   = aurum_video_core_safe_url( $meta['video_url'] );
	$iframe_url  = aurum_video_core_safe_url( $meta['iframe_url'] );
	$thumbnail   = aurum_video_core_thumbnail_url( $post_id );
	$description = aurum_video_core_description( $post_id );

	if ( ( ! $video_url && ! $iframe_url ) || ! $thumbnail || ! $description ) {
		return array();
	}

	$schema = array(
		'@context'     => 'https://schema.org',
		'@type'        => 'VideoObject',
		'@id'          => get_permalink( $post_id ) . '#video',
		'name'         => wp_strip_all_tags( get_the_title( $post_id ) ),
		'description'  => $description,
		'thumbnailUrl' => array( $thumbnail ),
		'uploadDate'   => get_post_time( DATE_W3C, true, $post_id ),
	);
	if ( $video_url ) {
		$schema['contentUrl'] = $video_url;
	}
	if ( $iframe_url ) {
		$schema['embedUrl'] = $iframe_url;
	}
	$duration = aurum_video_core_duration_iso( $post_id );
	if ( $duration ) {
		$schema['duration'] = $duration;
	}
	$views = aurum_video_core_view_count( $post_id );
	if ( $views ) {
		$schema['interactionStatistic'] = array(
			'@type'                => 'InteractionCounter',
			'interactionType'      => array( '@type' => 'WatchAction' ),
			'userInteractionCount' => $views,
		);
	}
	return $schema;
}

/**
 * Avoids a duplicate VideoObject from known integrations. Basic Yoast SEO
 * does not add VideoObject, so AURUM emits one alongside Yoast's graph. When
 * Yoast Video SEO is active, that official extension remains authoritative.
 */
function aurum_video_core_should_emit_schema( $post_id ) {
	$known_theme_schema = function_exists( 'misiav_video_schema' );
	$yoast_video        = defined( 'WPSEO_VIDEO_VERSION' ) || class_exists( 'WPSEO_Video_Sitemap' );
	$emit               = ! $known_theme_schema && ! $yoast_video;
	return (bool) apply_filters( 'aurum_video_core_emit_schema', $emit, $post_id );
}

/** Outputs exactly one standalone VideoObject when another owner is absent. */
function aurum_video_core_output_schema() {
	if ( ! is_singular() ) {
		return;
	}
	$post_id = get_queried_object_id();
	if ( ! aurum_video_core_should_emit_schema( $post_id ) ) {
		return;
	}
	$schema = aurum_video_core_schema_data( $post_id );
	if ( ! empty( $schema ) ) {
		echo '<script type="application/ld+json" data-aurum-video-core="VideoObject">' . wp_json_encode( $schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . '</script>' . "\n";
	}
}
add_action( 'wp_head', 'aurum_video_core_output_schema', 30 );

/** Public Yoast filters; no private `_yoast_*` meta is registered or written. */
function aurum_video_core_yoast_description( $value ) {
	if ( $value || ! is_singular() || ! aurum_video_core_has_video( get_queried_object_id() ) ) {
		return $value;
	}
	return aurum_video_core_description( get_queried_object_id() );
}
add_filter( 'wpseo_metadesc', 'aurum_video_core_yoast_description' );
add_filter( 'wpseo_opengraph_desc', 'aurum_video_core_yoast_description' );
add_filter( 'wpseo_twitter_description', 'aurum_video_core_yoast_description' );

function aurum_video_core_yoast_image( $value ) {
	if ( $value || ! is_singular() || ! aurum_video_core_has_video( get_queried_object_id() ) ) {
		return $value;
	}
	return aurum_video_core_thumbnail_url( get_queried_object_id() );
}
add_filter( 'wpseo_opengraph_image', 'aurum_video_core_yoast_image' );
add_filter( 'wpseo_twitter_image', 'aurum_video_core_yoast_image' );

/** Registers stable video-sitemap index and page routes. */
function aurum_video_core_register_sitemap_rewrites() {
	add_rewrite_rule( '^aurum-video-sitemap\.xml$', 'index.php?aurum_video_sitemap=index', 'top' );
	add_rewrite_rule( '^aurum-video-sitemap-([0-9]+)\.xml$', 'index.php?aurum_video_sitemap=$matches[1]', 'top' );
}
add_action( 'init', 'aurum_video_core_register_sitemap_rewrites' );

function aurum_video_core_query_vars( $vars ) {
	$vars[] = 'aurum_video_sitemap';
	return $vars;
}
add_filter( 'query_vars', 'aurum_video_core_query_vars' );

/** @return string[] */
function aurum_video_core_sitemap_post_types() {
	return aurum_video_core_post_types();
}

/** @return array<string,mixed> */
function aurum_video_core_sitemap_query_args( $page, $per_page ) {
	return array(
		'post_type'              => aurum_video_core_sitemap_post_types(),
		'post_status'            => 'publish',
		'posts_per_page'         => $per_page,
		'paged'                  => $page,
		'orderby'                => 'modified',
		'order'                  => 'DESC',
		'ignore_sticky_posts'    => true,
		'update_post_meta_cache' => true,
		'update_post_term_cache' => false,
		'meta_query'             => array(
			'relation' => 'OR',
			array( 'key' => 'aurum_video_url', 'compare' => 'EXISTS' ),
			array( 'key' => 'video_url', 'compare' => 'EXISTS' ),
			array( 'key' => 'aurum_iframe_url', 'compare' => 'EXISTS' ),
			array( 'key' => 'iframe_url', 'compare' => 'EXISTS' ),
		),
	);
}

/** XML-escapes element text without relying on a specific WP minor version. */
function aurum_video_core_xml( $value ) {
	return function_exists( 'esc_xml' ) ? esc_xml( (string) $value ) : htmlspecialchars( (string) $value, ENT_XML1 | ENT_QUOTES, 'UTF-8' );
}

/** Returns one validated video-sitemap URL entry, or an empty string. */
function aurum_video_core_sitemap_url_entry( $post_id ) {
	$meta        = aurum_video_core_get_meta( $post_id );
	$video_url   = aurum_video_core_safe_url( $meta['video_url'] );
	$iframe_url  = aurum_video_core_safe_url( $meta['iframe_url'] );
	$thumbnail   = aurum_video_core_thumbnail_url( $post_id );
	$description = aurum_video_core_description( $post_id );
	if ( ( ! $video_url && ! $iframe_url ) || ! $thumbnail || ! $description ) {
		return '';
	}

	$xml  = '<url><loc>' . aurum_video_core_xml( get_permalink( $post_id ) ) . '</loc>';
	$xml .= '<lastmod>' . aurum_video_core_xml( get_post_modified_time( 'c', true, $post_id ) ) . '</lastmod>';
	$xml .= '<video:video>';
	$xml .= '<video:thumbnail_loc>' . aurum_video_core_xml( $thumbnail ) . '</video:thumbnail_loc>';
	$xml .= '<video:title>' . aurum_video_core_xml( wp_strip_all_tags( get_the_title( $post_id ) ) ) . '</video:title>';
	$xml .= '<video:description>' . aurum_video_core_xml( $description ) . '</video:description>';
	$xml .= $video_url
		? '<video:content_loc>' . aurum_video_core_xml( $video_url ) . '</video:content_loc>'
		: '<video:player_loc>' . aurum_video_core_xml( $iframe_url ) . '</video:player_loc>';
	$xml .= '<video:publication_date>' . aurum_video_core_xml( get_post_time( 'c', true, $post_id ) ) . '</video:publication_date>';
	$duration = aurum_video_core_duration_seconds( $post_id );
	if ( $duration > 0 && $duration <= 28800 ) {
		$xml .= '<video:duration>' . absint( $duration ) . '</video:duration>';
	}
	if ( aurum_video_core_is_explicit( $post_id ) ) {
		$xml .= '<video:family_friendly>no</video:family_friendly>';
	}
	return $xml . '</video:video></url>';
}

/** Emits the sitemap index or one video urlset page. */
function aurum_video_core_render_sitemap() {
	$route = get_query_var( 'aurum_video_sitemap' );
	if ( ! $route ) {
		return;
	}

	status_header( 200 );
	header( 'Content-Type: application/xml; charset=UTF-8' );
	header( 'X-Robots-Tag: noindex, follow', true );
	echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";

	$per_page = max( 1, min( 1000, (int) apply_filters( 'aurum_video_core_sitemap_per_page', 1000 ) ) );
	if ( 'index' === $route ) {
		$query = new WP_Query( aurum_video_core_sitemap_query_args( 1, 1 ) );
		$pages = max( 1, (int) ceil( $query->found_posts / $per_page ) );
		echo '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
		for ( $page = 1; $page <= $pages; $page++ ) {
			echo '<sitemap><loc>' . aurum_video_core_xml( home_url( '/aurum-video-sitemap-' . $page . '.xml' ) ) . '</loc></sitemap>' . "\n";
		}
		echo '</sitemapindex>';
		exit;
	}

	$page  = max( 1, absint( $route ) );
	$query = new WP_Query( aurum_video_core_sitemap_query_args( $page, $per_page ) );
	echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">' . "\n";
	foreach ( $query->posts as $post ) {
		echo aurum_video_core_sitemap_url_entry( $post->ID ) . "\n";
	}
	echo '</urlset>';
	wp_reset_postdata();
	exit;
}
add_action( 'template_redirect', 'aurum_video_core_render_sitemap', 0 );

/** Makes the dedicated video sitemap discoverable without modifying robots rules. */
function aurum_video_core_robots_sitemap( $output ) {
	$line = 'Sitemap: ' . home_url( '/aurum-video-sitemap.xml' );
	return false === strpos( $output, $line ) ? rtrim( $output ) . "\n" . $line . "\n" : $output;
}
add_filter( 'robots_txt', 'aurum_video_core_robots_sitemap' );
