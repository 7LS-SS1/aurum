<?php
/**
 * Search results.
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<h1 class="aurum-page-title">
	<?php
	/* translators: %s: search query */
	printf( esc_html__( 'ผลการค้นหา: %s', 'aurum-video' ), '<em>' . esc_html( get_search_query() ) . '</em>' );
	?>
</h1>
<?php get_template_part( 'template-parts/content-grid' ); ?>
<?php get_footer(); ?>
