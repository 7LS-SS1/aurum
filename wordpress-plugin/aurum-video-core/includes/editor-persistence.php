<?php
/** Preserve imported playback separately from editable WordPress copy. */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Only marked AURUM blocks are evidence; never infer a source from prose. */
function aurum_video_core_legacy_sources( $content ) {
	$sources = array();
	$pattern = '/<!--\s*aurum-video\s*-->\s*<div\b[^>]*class=(?:"[^"]*\baurum-video\b[^"]*"|\'[^\']*\baurum-video\b[^\']*\')[^>]*>(.*?)<\/div>/is';
	if ( ! preg_match_all( $pattern, (string) $content, $blocks ) ) {
		return $sources;
	}
	foreach ( $blocks[1] as $block ) {
		$tags = new WP_HTML_Tag_Processor( $block );
		while ( $tags->next_tag() ) {
			$tag = $tags->get_tag();
			if ( ! in_array( $tag, array( 'A', 'IFRAME' ), true ) ) {
				continue;
			}
			$url = aurum_video_core_safe_url( $tags->get_attribute( 'A' === $tag ? 'href' : 'src' ) );
			if ( $url && wp_parse_url( $url, PHP_URL_HOST ) ) {
				$key = 'IFRAME' === $tag ? 'iframe_url' : 'video_url';
				$sources[ $key ][ $url ] = true;
			}
		}
	}
	foreach ( $sources as $key => $urls ) {
		// Conflicting sources require an explicit repair, never choose arbitrarily.
		if ( 1 !== count( $urls ) ) {
			return array();
		}
		$sources[ $key ] = (string) array_key_first( $urls );
	}
	return $sources;
}

/** Copy verified legacy media only when no stored playback source exists. */
function aurum_video_core_preserve_editor_media( $post_id ) {
	$post = get_post( $post_id );
	if ( ! $post || wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) || ! in_array( $post->post_type, aurum_video_core_post_types(), true ) ) {
		return;
	}
	$meta = aurum_video_core_get_meta( $post_id );
	if ( '' !== $meta['video_url'] || '' !== $meta['iframe_url'] ) {
		return;
	}
	foreach ( aurum_video_core_legacy_sources( $post->post_content ) as $key => $url ) {
		update_post_meta( $post_id, 'aurum_' . $key, $url );
		update_post_meta( $post_id, $key, $url );
	}
}

// Snapshot the OLD stored content before an editor replaces it.
add_action( 'pre_post_update', 'aurum_video_core_preserve_editor_media', 5 );
// New imports also become independent of their fallback block.
add_action( 'save_post', 'aurum_video_core_preserve_editor_media', 20 );

/** Backfill before Gutenberg preloads REST meta, avoiding stale empty defaults. */
function aurum_video_core_prepare_editor_media() {
	$post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0;
	if ( $post_id && current_user_can( 'edit_post', $post_id ) ) {
		aurum_video_core_preserve_editor_media( $post_id );
	}
}
add_action( 'load-post.php', 'aurum_video_core_prepare_editor_media' );
