<?php
/**
 * Anonymous, cookie/rate-limit-based view count + like/dislike for the
 * public video page. No WordPress user accounts are involved — this is a
 * lightweight engagement layer for site visitors, separate from AURUM's own
 * Viewer-account system on the Next.js side (which is a different site).
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const AURUM_VIEW_META_KEY  = '_aurum_wp_views';
const AURUM_LIKE_META_KEY  = '_aurum_wp_likes';
const AURUM_DISLIKE_META_KEY = '_aurum_wp_dislikes';

function aurum_get_client_ip() {
	$forwarded = isset( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) : '';
	if ( $forwarded ) {
		$parts = explode( ',', $forwarded );
		return trim( $parts[0] );
	}
	return isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'unknown';
}

/**
 * Very small transient-backed rate limiter — good enough to stop trivial
 * script abuse of an anonymous public endpoint, not a security boundary.
 */
function aurum_rate_limit( $key, $limit, $window_seconds ) {
	$bucket_key = 'aurum_rl_' . md5( $key );
	$count      = (int) get_transient( $bucket_key );
	if ( $count >= $limit ) {
		return false;
	}
	set_transient( $bucket_key, $count + 1, $window_seconds );
	return true;
}

function aurum_get_view_count( $post_id ) {
	return (int) get_post_meta( $post_id, AURUM_VIEW_META_KEY, true );
}

function aurum_get_reaction_counts( $post_id ) {
	return array(
		'likes'    => (int) get_post_meta( $post_id, AURUM_LIKE_META_KEY, true ),
		'dislikes' => (int) get_post_meta( $post_id, AURUM_DISLIKE_META_KEY, true ),
		'visitor'  => aurum_get_visitor_reaction( $post_id ),
	);
}

function aurum_register_engagement_routes() {
	register_rest_route(
		'aurum/v1',
		'/posts/(?P<id>\d+)/view',
		array(
			'methods'             => 'POST',
			'permission_callback' => '__return_true',
			'callback'            => function ( WP_REST_Request $req ) {
				$post_id = (int) $req->get_param( 'id' );
				if ( 'publish' !== get_post_status( $post_id ) ) {
					return new WP_Error( 'not_found', 'Post not found', array( 'status' => 404 ) );
				}

				$allowed = aurum_rate_limit( 'view:' . aurum_get_client_ip() . ':' . $post_id, 1, 60 );
				if ( $allowed ) {
					$current = aurum_get_view_count( $post_id );
					update_post_meta( $post_id, AURUM_VIEW_META_KEY, $current + 1 );
				}

				return array( 'views' => aurum_get_view_count( $post_id ) );
			},
		)
	);

	register_rest_route(
		'aurum/v1',
		'/posts/(?P<id>\d+)/reaction',
		array(
			'methods'             => 'POST',
			'permission_callback' => '__return_true',
			'callback'            => function ( WP_REST_Request $req ) {
				$post_id = (int) $req->get_param( 'id' );
				if ( 'publish' !== get_post_status( $post_id ) ) {
					return new WP_Error( 'not_found', 'Post not found', array( 'status' => 404 ) );
				}

				$allowed = aurum_rate_limit( 'reaction:' . aurum_get_client_ip(), 20, 60 );
				if ( ! $allowed ) {
					return new WP_Error( 'too_many_requests', 'Too many requests', array( 'status' => 429 ) );
				}

				$type = $req->get_param( 'type' ); // 'like' | 'dislike' | 'none'
				if ( ! in_array( $type, array( 'like', 'dislike', 'none' ), true ) ) {
					return new WP_Error( 'invalid_type', 'Invalid reaction type', array( 'status' => 400 ) );
				}

				$cookie_name    = 'aurum_reaction_' . $post_id;
				$previous       = isset( $_COOKIE[ $cookie_name ] ) ? sanitize_text_field( wp_unslash( $_COOKIE[ $cookie_name ] ) ) : 'none';
				$likes          = aurum_get_int_meta( $post_id, AURUM_LIKE_META_KEY );
				$dislikes       = aurum_get_int_meta( $post_id, AURUM_DISLIKE_META_KEY );

				if ( 'like' === $previous ) {
					$likes = max( 0, $likes - 1 );
				} elseif ( 'dislike' === $previous ) {
					$dislikes = max( 0, $dislikes - 1 );
				}

				$next = ( $previous === $type ) ? 'none' : $type; // clicking the same reaction again clears it
				if ( 'like' === $next ) {
					++$likes;
				} elseif ( 'dislike' === $next ) {
					++$dislikes;
				}

				update_post_meta( $post_id, AURUM_LIKE_META_KEY, $likes );
				update_post_meta( $post_id, AURUM_DISLIKE_META_KEY, $dislikes );

				$expire = time() + ( 180 * DAY_IN_SECONDS );
				setcookie( $cookie_name, $next, $expire, COOKIEPATH ? COOKIEPATH : '/', COOKIE_DOMAIN, is_ssl(), true );

				return array( 'likes' => $likes, 'dislikes' => $dislikes, 'reaction' => $next );
			},
		)
	);
}
add_action( 'rest_api_init', 'aurum_register_engagement_routes' );

function aurum_get_int_meta( $post_id, $key ) {
	return (int) get_post_meta( $post_id, $key, true );
}

/**
 * The visitor's own current reaction, read from the cookie set above — used
 * server-side to render the initial like/dislike button state.
 */
function aurum_get_visitor_reaction( $post_id ) {
	$cookie_name = 'aurum_reaction_' . $post_id;
	if ( isset( $_COOKIE[ $cookie_name ] ) ) {
		$value = sanitize_text_field( wp_unslash( $_COOKIE[ $cookie_name ] ) );
		if ( in_array( $value, array( 'like', 'dislike' ), true ) ) {
			return $value;
		}
	}
	return 'none';
}
