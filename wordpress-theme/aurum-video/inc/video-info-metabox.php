<?php
/**
 * "ข้อมูลวิดีโอ" meta box on the post edit screen — a single consolidated
 * panel for ชื่อคลิป/รายละเอียด/หมวดหมู่/แท็ก. These fields are NOT a
 * separate copy of the data: saving here writes straight to the same
 * post_title / post_content / category / post_tag data Gutenberg's own
 * panels use, so there is exactly one source of truth even though it's
 * editable from two places in the admin UI.
 *
 * @package AurumVideo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function aurum_add_video_info_metabox() {
	add_meta_box(
		'aurum_video_info',
		__( 'ข้อมูลวิดีโอ', 'aurum-video' ),
		'aurum_render_video_info_metabox',
		'post',
		'normal',
		'high'
	);
}
add_action( 'add_meta_boxes', 'aurum_add_video_info_metabox' );

function aurum_render_video_info_metabox( $post ) {
	wp_nonce_field( 'aurum_video_info_save', 'aurum_video_info_nonce' );

	$categories         = get_categories( array( 'hide_empty' => false ) );
	$selected_cat_ids   = wp_get_post_categories( $post->ID );
	$tags               = get_the_tags( $post->ID );
	$tags_value         = $tags ? implode( ', ', wp_list_pluck( $tags, 'name' ) ) : '';
	?>
	<p>
		<label for="aurum_clip_title"><strong><?php esc_html_e( 'ชื่อคลิป', 'aurum-video' ); ?></strong></label><br />
		<input
			type="text"
			id="aurum_clip_title"
			name="aurum_clip_title"
			value="<?php echo esc_attr( $post->post_title ); ?>"
			style="width:100%;"
		/>
	</p>

	<p>
		<label for="aurum_clip_description"><strong><?php esc_html_e( 'รายละเอียด', 'aurum-video' ); ?></strong></label><br />
		<textarea
			id="aurum_clip_description"
			name="aurum_clip_description"
			rows="6"
			style="width:100%;"
		><?php echo esc_textarea( $post->post_content ); ?></textarea>
	</p>

	<p>
		<strong><?php esc_html_e( 'หมวดหมู่', 'aurum-video' ); ?></strong><br />
		<?php if ( empty( $categories ) ) : ?>
			<em><?php esc_html_e( 'ยังไม่มีหมวดหมู่ในระบบ', 'aurum-video' ); ?></em>
		<?php else : ?>
			<div style="max-height:150px; overflow-y:auto; border:1px solid #ddd; padding:8px;">
				<?php foreach ( $categories as $category ) : ?>
					<label style="display:block;">
						<input
							type="checkbox"
							name="aurum_clip_categories[]"
							value="<?php echo esc_attr( $category->term_id ); ?>"
							<?php checked( in_array( $category->term_id, $selected_cat_ids, true ) ); ?>
						/>
						<?php echo esc_html( $category->name ); ?>
					</label>
				<?php endforeach; ?>
			</div>
		<?php endif; ?>
	</p>

	<p>
		<label for="aurum_clip_tags"><strong><?php esc_html_e( 'แท็ก', 'aurum-video' ); ?></strong></label><br />
		<input
			type="text"
			id="aurum_clip_tags"
			name="aurum_clip_tags"
			value="<?php echo esc_attr( $tags_value ); ?>"
			style="width:100%;"
			placeholder="<?php esc_attr_e( 'คั่นด้วยจุลภาค เช่น แอ็คชั่น, 2026, HD', 'aurum-video' ); ?>"
		/>
	</p>
	<?php
}

function aurum_save_video_info_metabox( $post_id ) {
	if ( ! isset( $_POST['aurum_video_info_nonce'] )
		|| ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['aurum_video_info_nonce'] ) ), 'aurum_video_info_save' ) ) {
		return;
	}
	if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
		return;
	}
	if ( 'post' !== get_post_type( $post_id ) ) {
		return;
	}
	if ( ! current_user_can( 'edit_post', $post_id ) ) {
		return;
	}

	// Avoid an infinite save_post loop from the wp_update_post() call below.
	remove_action( 'save_post', 'aurum_save_video_info_metabox' );

	$update = array( 'ID' => $post_id );
	if ( isset( $_POST['aurum_clip_title'] ) ) {
		$update['post_title'] = sanitize_text_field( wp_unslash( $_POST['aurum_clip_title'] ) );
	}
	if ( isset( $_POST['aurum_clip_description'] ) ) {
		$update['post_content'] = wp_kses_post( wp_unslash( $_POST['aurum_clip_description'] ) );
	}
	if ( count( $update ) > 1 ) {
		wp_update_post( $update );
	}

	if ( isset( $_POST['aurum_clip_categories'] ) && is_array( $_POST['aurum_clip_categories'] ) ) {
		$cat_ids = array_map( 'intval', wp_unslash( $_POST['aurum_clip_categories'] ) );
		wp_set_post_categories( $post_id, $cat_ids );
	} else {
		// No boxes checked = clear categories, same as unchecking everything in Gutenberg's panel.
		wp_set_post_categories( $post_id, array() );
	}

	if ( isset( $_POST['aurum_clip_tags'] ) ) {
		wp_set_post_tags( $post_id, sanitize_text_field( wp_unslash( $_POST['aurum_clip_tags'] ) ) );
	}

	add_action( 'save_post', 'aurum_save_video_info_metabox' );
}
add_action( 'save_post', 'aurum_save_video_info_metabox' );
