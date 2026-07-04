<?php
/**
 * 404 fallback.
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>
<h1 class="aurum-page-title"><?php esc_html_e( 'ไม่พบหน้านี้', 'aurum-video' ); ?></h1>
<p class="aurum-empty"><?php esc_html_e( 'วิดีโอหรือหน้าที่คุณค้นหาอาจถูกย้ายหรือลบไปแล้ว', 'aurum-video' ); ?></p>
<?php
get_footer();
