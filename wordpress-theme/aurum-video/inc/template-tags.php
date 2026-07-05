<?php
/**
 * Template helper functions: reading AURUM's video meta, rendering the
 * player, and the grid-card partial shared by every archive-type template.
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Normalizes AURUM's video meta for a post: prefers the `aurum_*` prefixed
 * key, falls back to the legacy unprefixed alias, then to an empty string.
 *
 * @param int $post_id Post ID.
 * @return array{provider:string,iframe_url:string,video_url:string,thumbnail_url:string,preview_url:string,jwplayer_media_id:string}
 */
function aurum_get_video_meta( $post_id ) {
	$pick = function ( $preferred_key, $legacy_key ) use ( $post_id ) {
		$value = get_post_meta( $post_id, $preferred_key, true );
		if ( '' !== $value && null !== $value ) {
			return (string) $value;
		}
		$legacy = get_post_meta( $post_id, $legacy_key, true );
		return $legacy ? (string) $legacy : '';
	};

	return array(
		'provider'          => $pick( 'aurum_provider', 'video_provider' ),
		'iframe_url'        => $pick( 'aurum_iframe_url', 'iframe_url' ),
		'video_url'         => $pick( 'aurum_video_url', 'video_url' ),
		'thumbnail_url'     => $pick( 'aurum_thumbnail_url', 'thumbnail_url' ),
		'preview_url'       => $pick( 'aurum_preview_url', 'preview_url' ),
		'jwplayer_media_id' => $pick( 'aurum_jwplayer_media_id', 'jwplayer_media_id' ),
	);
}

/**
 * Removes the `<!-- aurum-video -->` embed block that distributor.ts injects
 * directly into post_content as a plain-HTML fallback — the theme renders
 * its own player from post meta instead, so this avoids showing the video
 * embed twice on the single post page.
 *
 * @param string $content Raw post content (before the_content filters).
 * @return string
 */
function aurum_strip_embedded_video_block( $content ) {
	$pattern = '/<!--\s*aurum-video\s*-->.*?<div class="aurum-video">.*?<\/div>/is';
	return preg_replace( $pattern, '', $content );
}

/**
 * Renders the video player for a single post: an <iframe> when an iframe URL
 * is available (JWPlayer, or any provider AURUM already resolved server-side
 * into an embeddable URL), otherwise a native <video> tag for a direct/HLS
 * source. Falls back to a plain message when neither is present.
 *
 * @param int $post_id Post ID.
 */
function aurum_render_video_player( $post_id ) {
	$meta = aurum_get_video_meta( $post_id );

	if ( ! empty( $meta['iframe_url'] ) ) {
		echo '<div class="aurum-video-stage">';
		printf(
			'<iframe src="%s" title="%s" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>',
			esc_url( $meta['iframe_url'] ),
			esc_attr( get_the_title( $post_id ) )
		);
		echo '</div>';
		return;
	}

	if ( empty( $meta['video_url'] ) ) {
		echo '<div class="aurum-video-stage"><div class="aurum-video-missing">' . esc_html__( 'ยังไม่มีวิดีโอสำหรับเรื่องนี้', 'aurum-video' ) . '</div></div>';
		return;
	}

	// Direct/HLS source — shared embeddable AURUM player. The custom element is
	// built from src/embeds and bundled into assets/player for WordPress.
	$poster = $meta['thumbnail_url'];
	?>
	<div class="aurum-video-stage">
		<aurum-video-player
			src="<?php echo esc_url( $meta['video_url'] ); ?>"
			<?php echo $poster ? 'poster="' . esc_url( $poster ) . '"' : ''; ?>
			title="<?php echo esc_attr( get_the_title( $post_id ) ); ?>"
			preload="metadata"
		></aurum-video-player>
	</div>
	<?php
}

/**
 * Renders one grid card for the loop templates (index/archive/category/tag/search).
 */
function aurum_video_card() {
	$post_id       = get_the_ID();
	$meta          = aurum_get_video_meta( $post_id );
	$thumbnail_url = has_post_thumbnail( $post_id )
		? get_the_post_thumbnail_url( $post_id, 'medium_large' )
		: $meta['thumbnail_url'];
	?>
	<a class="aurum-card" href="<?php the_permalink(); ?>">
		<div class="aurum-card-thumb">
			<?php if ( $thumbnail_url ) : ?>
				<img src="<?php echo esc_url( $thumbnail_url ); ?>" alt="<?php the_title_attribute(); ?>" loading="lazy" />
			<?php endif; ?>
		</div>
		<div class="aurum-card-title"><?php the_title(); ?></div>
		<div class="aurum-card-meta">
			<?php echo esc_html( get_the_date() ); ?>
			<?php
			$categories = get_the_category();
			if ( ! empty( $categories ) ) {
				echo ' &middot; ' . esc_html( $categories[0]->name );
			}
			?>
		</div>
	</a>
	<?php
}
