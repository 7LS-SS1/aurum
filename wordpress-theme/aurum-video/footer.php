<?php
/**
 * The footer for the AURUM Video theme. Closes the `.aurum-main` wrapper
 * opened in header.php.
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
</div><!-- .aurum-main -->

<footer class="aurum-footer">
	&copy; <?php echo esc_html( gmdate( 'Y' ) ); ?> <?php bloginfo( 'name' ); ?>
</footer>

<?php wp_footer(); ?>
</body>
</html>
