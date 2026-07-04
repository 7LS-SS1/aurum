<?php
/**
 * The header for the AURUM Video theme.
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>

<header class="aurum-topbar">
	<?php if ( has_custom_logo() ) : ?>
		<div class="aurum-logo">
			<?php the_custom_logo(); ?>
		</div>
	<?php else : ?>
		<a class="aurum-logo" href="<?php echo esc_url( home_url( '/' ) ); ?>">
			<span class="mark"><span>A</span></span>
			<span class="word"><?php bloginfo( 'name' ); ?></span>
		</a>
	<?php endif; ?>

	<button class="aurum-nav-toggle" aria-label="<?php esc_attr_e( 'เมนู', 'aurum-video' ); ?>">&#9776;</button>

	<?php
	wp_nav_menu(
		array(
			'theme_location'   => 'primary',
			'container'        => 'nav',
			'container_class'  => 'aurum-nav',
			'fallback_cb'      => false,
		)
	);
	?>

	<form class="aurum-search" role="search" method="get" action="<?php echo esc_url( home_url( '/' ) ); ?>">
		<input type="search" name="s" placeholder="<?php esc_attr_e( 'ค้นหาวิดีโอ', 'aurum-video' ); ?>" value="<?php echo esc_attr( get_search_query() ); ?>" />
		<button type="submit" aria-label="<?php esc_attr_e( 'ค้นหา', 'aurum-video' ); ?>">&#128269;</button>
	</form>
</header>

<div class="aurum-main">
