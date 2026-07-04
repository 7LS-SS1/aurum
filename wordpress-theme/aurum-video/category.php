<?php
/**
 * Category archive — movies filed under one AURUM main/sub category.
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<h1 class="aurum-page-title"><?php single_cat_title(); ?></h1>
<?php get_template_part( 'template-parts/content-grid' ); ?>
<?php get_footer(); ?>
