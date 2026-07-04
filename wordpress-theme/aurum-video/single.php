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
	?>
	<article <?php post_class(); ?>>
		<?php aurum_render_video_player( get_the_ID() ); ?>

		<h1 class="aurum-single-title"><?php the_title(); ?></h1>
		<div class="aurum-single-meta">
			<?php echo esc_html( get_the_date() ); ?>
			<?php
			$categories = get_the_category();
			if ( ! empty( $categories ) ) {
				echo ' &middot; ' . esc_html( $categories[0]->name );
			}
			?>
		</div>

		<div class="aurum-single-content">
			<?php echo apply_filters( 'the_content', aurum_strip_embedded_video_block( get_the_content() ) ); ?>
		</div>

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
	</article>

	<?php
	if ( comments_open() || get_comments_number() ) {
		comments_template();
	}
endwhile;

get_footer();
