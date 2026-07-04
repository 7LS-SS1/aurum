<?php
/**
 * Single video watch page.
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();

while ( have_posts() ) :
	the_post();
	$post_id   = get_the_ID();
	$views     = aurum_get_view_count( $post_id );
	$reactions = aurum_get_reaction_counts( $post_id );
	?>
	<article <?php post_class(); ?>>
		<?php aurum_render_video_player( $post_id ); ?>

		<h1 class="aurum-single-title"><?php the_title(); ?></h1>
		<div class="aurum-single-meta">
			<span class="aurum-view-count" data-role="view-count">
				<?php
				printf(
					/* translators: %s: view count */
					esc_html__( 'การดู %s ครั้ง', 'aurum-video' ),
					'<span data-role="view-count-number">' . esc_html( number_format_i18n( $views ) ) . '</span>'
				);
				?>
			</span>
			&middot; <?php echo esc_html( get_the_date() ); ?>
			<?php
			$categories = get_the_category();
			if ( ! empty( $categories ) ) {
				echo ' &middot; ' . esc_html( $categories[0]->name );
			}
			?>
		</div>

		<div class="aurum-actions-row">
			<div class="aurum-like-pill">
				<button
					type="button"
					class="aurum-reaction-btn <?php echo 'like' === $reactions['visitor'] ? 'is-active' : ''; ?>"
					data-reaction="like"
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M7 10v11M2 13v6a2 2 0 0 0 2 2h12.3a2 2 0 0 0 2-1.6l1.4-7A2 2 0 0 0 17.7 10H13l1-4.5A2 2 0 0 0 12 3l-5 7" />
					</svg>
					<span data-role="like-count"><?php echo esc_html( number_format_i18n( $reactions['likes'] ) ); ?></span>
				</button>
				<span class="aurum-like-pill-sep"></span>
				<button
					type="button"
					class="aurum-reaction-btn <?php echo 'dislike' === $reactions['visitor'] ? 'is-active' : ''; ?>"
					data-reaction="dislike"
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M17 14V3M22 11V5a2 2 0 0 0-2-2H7.7a2 2 0 0 0-2 1.6l-1.4 7A2 2 0 0 0 6.3 14H11l-1 4.5A2 2 0 0 0 12 21l5-7" />
					</svg>
					<span data-role="dislike-count"><?php echo esc_html( number_format_i18n( $reactions['dislikes'] ) ); ?></span>
				</button>
			</div>

			<div class="aurum-share-wrap">
				<button type="button" class="aurum-pill" data-role="share-toggle">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v14" />
					</svg>
					<?php esc_html_e( 'แชร์', 'aurum-video' ); ?>
				</button>
				<div class="aurum-share-menu" data-role="share-menu" hidden>
					<a href="#" data-share="facebook"><?php esc_html_e( 'Facebook', 'aurum-video' ); ?></a>
					<a href="#" data-share="line"><?php esc_html_e( 'LINE', 'aurum-video' ); ?></a>
					<a href="#" data-share="x"><?php esc_html_e( 'X (Twitter)', 'aurum-video' ); ?></a>
					<button type="button" data-share="copy"><?php esc_html_e( 'คัดลอกลิงก์', 'aurum-video' ); ?></button>
				</div>
			</div>
		</div>

		<div class="aurum-descbox" data-role="descbox">
			<div class="aurum-single-content aurum-desc-body" data-role="desc-body">
				<?php echo apply_filters( 'the_content', aurum_strip_embedded_video_block( get_the_content() ) ); ?>
			</div>
			<button type="button" class="aurum-desc-more" data-role="desc-toggle"><?php esc_html_e( '...เพิ่มเติม', 'aurum-video' ); ?></button>

			<?php
			$tags = get_the_tags();
			if ( $tags ) :
				?>
				<div class="aurum-tags">
					<?php foreach ( $tags as $tag ) : ?>
						<a href="<?php echo esc_url( get_tag_link( $tag->term_id ) ); ?>">#<?php echo esc_html( $tag->name ); ?></a>
					<?php endforeach; ?>
				</div>
			<?php endif; ?>
		</div>
	</article>

	<?php
	if ( comments_open() || get_comments_number() ) {
		comments_template();
	}
endwhile;

get_footer();
