<?php
/**
 * Main video grid (blog home / latest posts).
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<h1 class="aurum-page-title"><?php bloginfo( 'name' ); ?></h1>
<?php get_template_part( 'template-parts/content-grid' ); ?>
<?php get_footer(); ?>
