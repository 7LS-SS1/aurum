<?php
/**
 * Shared grid-of-cards loop, used by index.php, archive.php, category.php,
 * tag.php and search.php so the loop body isn't duplicated five times.
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>

<?php if ( have_posts() ) : ?>
	<div class="aurum-grid">
		<?php
		while ( have_posts() ) :
			the_post();
			aurum_video_card();
		endwhile;
		?>
	</div>

	<div class="aurum-pagination">
		<?php
		echo paginate_links(
			array(
				'prev_text' => esc_html__( 'ก่อนหน้า', 'aurum-video' ),
				'next_text' => esc_html__( 'ถัดไป', 'aurum-video' ),
			)
		);
		?>
	</div>
<?php else : ?>
	<p class="aurum-empty"><?php esc_html_e( 'ยังไม่มีวิดีโอ', 'aurum-video' ); ?></p>
<?php endif; ?>
