<?php
/**
 * Generic archive (date-based, author, etc.).
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<h1 class="aurum-page-title"><?php the_archive_title(); ?></h1>
<?php get_template_part( 'template-parts/content-grid' ); ?>
<?php get_footer(); ?>
