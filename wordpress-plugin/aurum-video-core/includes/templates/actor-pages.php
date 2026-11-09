<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }
$is_profile = (bool) get_query_var( 'aurum_actor_profile' );
$term = $is_profile ? get_queried_object() : null;
get_header();
?>
<main id="primary" class="aurum-actors">
	<p class="aurum-actors__crumb"><a href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php esc_html_e( 'Home', 'aurum-video-core' ); ?></a> / <?php esc_html_e( 'Actors', 'aurum-video-core' ); ?></p>
	<?php if ( $is_profile && $term instanceof WP_Term ) :
		$image = aurum_actor_pages_image( $term );
		$bio = (string) get_term_meta( $term->term_id, '_av123_actor_bio', true );
		if ( '' === trim( $bio ) ) { $bio = (string) $term->description; }
	?>
		<section class="aurum-actor-profile">
			<div class="aurum-actor-profile__image"><?php if ( $image ) : ?><img src="<?php echo $image; ?>" alt="<?php echo esc_attr( $term->name ); ?>" loading="eager"><?php else : ?><span><?php echo esc_html( aurum_actor_pages_name_initial( $term->name ) ); ?></span><?php endif; ?></div>
			<div><h1><?php echo esc_html( $term->name ); ?></h1><?php if ( trim( $bio ) ) : ?><div class="aurum-actor-profile__bio"><?php echo wp_kses_post( wpautop( $bio ) ); ?></div><?php endif; ?></div>
		</section>
		<h2><?php esc_html_e( 'Videos', 'aurum-video-core' ); ?></h2><div class="aurum-actor-videos">
		<?php if ( have_posts() ) : while ( have_posts() ) : the_post(); $thumb = get_the_post_thumbnail_url( get_the_ID(), 'medium_large' ); ?><a class="aurum-actor-video" href="<?php the_permalink(); ?>"><?php if ( $thumb ) : ?><img src="<?php echo esc_url( $thumb ); ?>" alt="" loading="lazy"><?php else : ?><span class="aurum-actor-video__placeholder" aria-hidden="true"></span><?php endif; ?><strong><?php the_title(); ?></strong></a><?php endwhile; else : ?><p><?php esc_html_e( 'No videos are available for this actor yet.', 'aurum-video-core' ); ?></p><?php endif; ?>
		</div>
	<?php else : $actors = get_terms( array( 'taxonomy' => 'aurum_video_actor', 'hide_empty' => true, 'orderby' => 'name', 'order' => 'ASC' ) ); ?>
		<h1><?php esc_html_e( 'Actors', 'aurum-video-core' ); ?></h1><div class="aurum-actors__grid">
		<?php foreach ( is_wp_error( $actors ) ? array() : $actors as $actor ) : $image = aurum_actor_pages_image( $actor ); ?><a class="aurum-actor-card" href="<?php echo esc_url( get_term_link( $actor ) ); ?>"><span class="aurum-actor-card__image"><?php if ( $image ) : ?><img src="<?php echo $image; ?>" alt="<?php echo esc_attr( $actor->name ); ?>" loading="lazy"><?php else : ?><span><?php echo esc_html( aurum_actor_pages_name_initial( $actor->name ) ); ?></span><?php endif; ?></span><span class="aurum-actor-card__body"><strong><?php echo esc_html( $actor->name ); ?></strong><span><?php echo esc_html( sprintf( _n( '%s video', '%s videos', $actor->count, 'aurum-video-core' ), number_format_i18n( $actor->count ) ) ); ?></span></span></a><?php endforeach; ?>
		</div><?php if ( empty( $actors ) ) : ?><p><?php esc_html_e( 'Actors will appear here after AURUM synchronizes videos.', 'aurum-video-core' ); ?></p><?php endif; ?>
	<?php endif; ?>
</main>
<?php get_footer();
