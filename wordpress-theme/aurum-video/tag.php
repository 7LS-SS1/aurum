<?php
/**
 * Tag archive.
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<h1 class="aurum-page-title"><?php single_tag_title(); ?></h1>
<?php get_template_part( 'template-parts/content-grid' ); ?>
<?php get_footer(); ?>
