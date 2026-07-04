<?php
/**
 * Static page fallback (About, Contact, etc.).
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
		<h1 class="aurum-single-title"><?php the_title(); ?></h1>
		<div class="aurum-single-content">
			<?php the_content(); ?>
		</div>
	</article>
	<?php
endwhile;

get_footer();
