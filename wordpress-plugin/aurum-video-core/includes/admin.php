<?php
/** Thai WordPress management UI; no competing pull-sync worker. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

function aurum_video_core_admin_menu() {
	add_menu_page( 'AURUM', 'AURUM', 'manage_options', 'aurum-video-core', 'aurum_video_core_admin_overview', 'dashicons-video-alt3', 26 );
	add_submenu_page( 'aurum-video-core', 'ภาพรวม', 'ภาพรวม', 'manage_options', 'aurum-video-core', 'aurum_video_core_admin_overview' );
	add_submenu_page( 'aurum-video-core', 'วิดีโอ', 'วิดีโอ', 'manage_options', 'aurum-videos', 'aurum_video_core_admin_videos' );
	add_submenu_page( 'aurum-video-core', 'โปรไฟล์เว็บไซต์', 'โปรไฟล์เว็บไซต์', 'manage_options', 'aurum-profile', 'aurum_video_core_admin_profile' );
	add_submenu_page( 'aurum-video-core', 'ประวัติรับข้อมูล', 'ประวัติรับข้อมูล', 'manage_options', 'aurum-history', 'aurum_video_core_admin_history' );
	add_submenu_page( 'aurum-video-core', 'นำเข้า / ส่งออก CSV', 'นำเข้า / ส่งออก CSV', 'manage_options', 'aurum-csv', 'aurum_video_core_admin_csv' );
}
add_action( 'admin_menu', 'aurum_video_core_admin_menu' );

function aurum_video_core_admin_assets( $hook ) {
	if ( false === strpos( $hook, 'aurum' ) ) { return; }
	wp_enqueue_style( 'aurum-core-admin', AURUM_VIDEO_CORE_URL . 'assets/admin.css', array(), AURUM_VIDEO_CORE_VERSION );
	wp_enqueue_script( 'aurum-core-admin', AURUM_VIDEO_CORE_URL . 'assets/admin.js', array(), AURUM_VIDEO_CORE_VERSION, true );
}
add_action( 'admin_enqueue_scripts', 'aurum_video_core_admin_assets' );
function aurum_video_core_admin_guard( $action = '' ) {
	if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'ไม่มีสิทธิ์จัดการ AURUM', '', array( 'response' => 403 ) ); }
	if ( $action ) { check_admin_referer( $action ); }
}
function aurum_video_core_admin_start( $title, $subtitle ) {
	aurum_video_core_admin_guard();
	// WordPress moves third-party admin notices after the first h1; keep them outside the colored header.
	echo '<div class="wrap aurum-core"><h1 class="screen-reader-text">' . esc_html( $title ) . '</h1><div class="aurum-core-head"><span class="aurum-core-brand">AURUM</span><h2>' . esc_html( $title ) . '</h2><p>' . esc_html( $subtitle ) . '</p></div>';
	if ( isset( $_GET['saved'] ) ) { echo '<div class="notice notice-success"><p>บันทึกเรียบร้อยแล้ว</p></div>'; }
}
function aurum_video_core_admin_form( $action ) {
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
	echo '<input type="hidden" name="action" value="' . esc_attr( $action ) . '">';
	wp_nonce_field( $action );
}
function aurum_video_core_admin_overview() {
	aurum_video_core_admin_start( 'ดูแลวิดีโอจาก AURUM', 'ตรวจความพร้อมของเว็บไซต์และข้อมูลที่รับจาก Project AURUM' );
	$diagnostics = aurum_video_core_diagnostics()->get_data(); $profile = aurum_video_core_profile();
	$query = aurum_video_core_managed_query( array( 'posts_per_page' => 1, 'fields' => 'ids' ) );
	echo '<div class="aurum-core-cards">';
	foreach ( array( 'ข้อมูลพร้อมรับ' => $diagnostics['ready'] && $profile['ready'] ? 'พร้อมใช้งาน' : 'ต้องตรวจสอบ', 'วิดีโอ AURUM' => number_format_i18n( $query->found_posts ), 'รุ่นปลั๊กอิน' => AURUM_VIDEO_CORE_VERSION, 'โปรไฟล์ส่งข้อมูล' => $profile['restBase'] ?: 'ยังไม่พร้อม' ) as $label => $value ) {
		echo '<section class="aurum-core-card"><span>' . esc_html( $label ) . '</span><strong>' . esc_html( $value ) . '</strong></section>';
	}
	echo '</div><section class="aurum-core-panel"><h2>เชื่อมต่อกับ Project AURUM</h2><p>Project AURUM จัดการคิวส่งงานและสถานะการเผยแพร่ ส่วนเว็บไซต์นี้รับข้อมูล แสดงวิดีโอ และบันทึกประวัติการรับข้อมูล</p>';
	echo '<p>ตั้งค่าเว็บปลายทางใน Project ให้ใช้ชนิดโพสต์ <code>' . esc_html( $profile['restBase'] ) . '</code> หมวดหมู่ <code>' . esc_html( $profile['taxonomies']['category']['restBase'] ) . '</code> และแท็ก <code>' . esc_html( $profile['taxonomies']['tag']['restBase'] ) . '</code></p>';
	echo '<p><a class="button" href="' . esc_url( admin_url( 'admin.php?page=aurum-profile' ) ) . '">ตั้งค่าโปรไฟล์</a> <a class="button" href="' . esc_url( rest_url( 'aurum-video-core/v1/diagnostics' ) ) . '">ดูข้อมูลตรวจสอบการเชื่อมต่อ</a></p>';
	$settings = aurum_video_core_settings();
	if ( $settings['project_url'] ) { echo '<a class="button button-primary" href="' . esc_url( $settings['project_url'] ) . '" target="_blank" rel="noopener noreferrer">เปิด Project AURUM</a>'; }
	if ( ! $profile['ready'] ) { echo '<p class="aurum-core-warning">โปรไฟล์ชนิดโพสต์หรือหมวดหมู่ยังไม่พร้อม กรุณาตรวจการตั้งค่าก่อนส่งงาน</p>'; }
	echo '</section><section class="aurum-core-panel"><h2>เครื่องเล่นและข้อมูลค้นหา</h2><p>ธีมที่รองรับแสดงเครื่องเล่นหลักเพียงหนึ่งตัว Core สำรองการเล่นเมื่อธีมไม่มีผู้แสดงเครื่องเล่น และใช้เจ้าของ VideoObject / sitemap ตามการเชื่อมต่อของธีม</p></section></div>';
}
function aurum_video_core_admin_videos() {
	aurum_video_core_admin_start( 'วิดีโอ AURUM', 'ดูข้อมูลที่เว็บไซต์รับมาและแก้ไขเนื้อหาผ่านตัวแก้ไข WordPress' );
	$page = max( 1, absint( $_GET['paged'] ?? 1 ) );
	$query = aurum_video_core_managed_query( array( 'paged' => $page ) );
	echo '<section class="aurum-core-panel"><div class="aurum-core-table"><table class="widefat striped"><thead><tr><th>วิดีโอ</th><th>สถานะ</th><th>แหล่งเล่น</th><th>รหัส AURUM</th><th>จัดการ</th></tr></thead><tbody>';
	foreach ( $query->posts as $post ) {
		$meta = aurum_video_core_get_meta( $post->ID );
		echo '<tr><td><strong>' . esc_html( $post->post_title ) . '</strong><br><small>' . esc_html( $post->post_type ) . ' · #' . (int) $post->ID . '</small></td><td>' . esc_html( get_post_status_object( $post->post_status )->label ) . '</td><td>' . esc_html( $meta['iframe_url'] ? 'Iframe' : ( $meta['video_url'] ? ( aurum_video_core_is_hls( $meta['video_url'] ) ? 'HLS' : 'ไฟล์วิดีโอ' ) : 'ยังไม่มี' ) ) . '</td><td>' . esc_html( get_post_meta( $post->ID, 'aurum_movie_id', true ) ) . '</td><td><a class="button" href="' . esc_url( get_edit_post_link( $post->ID ) ) . '">แก้ไข</a></td></tr>';
	}
	if ( ! $query->posts ) { echo '<tr><td colspan="5">ยังไม่มีวิดีโอที่รับจาก AURUM</td></tr>'; }
	echo '</tbody></table></div><div class="aurum-core-pagination">' . wp_kses_post( paginate_links( array( 'base' => add_query_arg( 'paged', '%#%' ), 'current' => $page, 'total' => $query->max_num_pages ) ) ) . '</div></section></div>';
}
function aurum_video_core_admin_profile() {
	aurum_video_core_admin_start( 'โปรไฟล์เว็บไซต์', 'รักษารูปแบบข้อมูลและ URL ที่เว็บไซต์ใช้อยู่ พร้อมกำหนดโปรไฟล์สำหรับเว็บใหม่' );
	$settings = aurum_video_core_settings();
	echo '<section class="aurum-core-panel">';
	aurum_video_core_admin_form( 'aurum_core_save_profile' );
	echo '<table class="form-table"><tr><th><label for="aurum-profile">รูปแบบวิดีโอ</label></th><td><select id="aurum-profile" name="profile">';
	foreach ( array( 'auto' => 'ใช้ระบบเดิม (แนะนำสำหรับเว็บที่ใช้งานแล้ว)', 'posts' => 'เผยแพร่เป็นบทความ WordPress', 'video' => 'เผยแพร่เป็นชนิดโพสต์วิดีโอ' ) as $value => $label ) {
		echo '<option value="' . esc_attr( $value ) . '"' . selected( $settings['profile'], $value, false ) . '>' . esc_html( $label ) . '</option>';
	}
	echo '</select><p class="description">การตั้งค่านี้ไม่ย้ายโพสต์เดิมและไม่เปลี่ยน URL เดิม ถ้าเลือกวิดีโอ Core จะสร้างชนิดโพสต์เฉพาะเมื่อยังไม่มีธีมหรือปลั๊กอินอื่นลงทะเบียนไว้</p></td></tr>';
	foreach ( array( 'category_taxonomy' => 'หมวดหมู่', 'tag_taxonomy' => 'แท็ก' ) as $key => $label ) {
		echo '<tr><th><label for="' . esc_attr( $key ) . '">' . esc_html( $label ) . '</label></th><td><select id="' . esc_attr( $key ) . '" name="' . esc_attr( $key ) . '"><option value="">เลือกตามชนิดโพสต์</option>';
		foreach ( get_taxonomies( array( 'public' => true, 'show_in_rest' => true ), 'objects' ) as $tax ) {
			if ( 'aurum_video_actor' === $tax->name ) { continue; }
			echo '<option value="' . esc_attr( $tax->name ) . '"' . selected( $settings[ $key ], $tax->name, false ) . '>' . esc_html( $tax->label . ' (' . $tax->name . ')' ) . '</option>';
		}
		echo '</select></td></tr>';
	}
	echo '<tr><th><label for="project_url">ที่อยู่ Project AURUM</label></th><td><input class="regular-text" type="url" id="project_url" name="project_url" value="' . esc_attr( $settings['project_url'] ) . '"><p class="description">ใช้เป็นลิงก์เปิดหน้าจัดการส่วนกลาง ไม่เก็บรหัสผ่านหรือ API key ในหน้านี้</p></td></tr></table>';
	submit_button( 'บันทึกโปรไฟล์' ); echo '</form></section></div>';
}
function aurum_video_core_save_profile() {
	aurum_video_core_admin_guard( 'aurum_core_save_profile' );
	$profile = sanitize_key( $_POST['profile'] ?? '' );
	if ( ! in_array( $profile, array( 'auto', 'posts', 'video' ), true ) ) { wp_die( 'โปรไฟล์ไม่ถูกต้อง' ); }
	$settings = array( 'profile' => $profile );
	foreach ( array( 'category_taxonomy', 'tag_taxonomy' ) as $key ) {
		$name = sanitize_key( $_POST[ $key ] ?? '' ); $tax = $name ? get_taxonomy( $name ) : null;
		if ( $name && ( ! $tax || ! $tax->public || ! $tax->show_in_rest || 'aurum_video_actor' === $name ) ) { wp_die( 'หมวดหมู่หรือแท็กไม่ถูกต้อง' ); }
		$settings[ $key ] = $name;
	}
	$project_url = trim( wp_unslash( $_POST['project_url'] ?? '' ) );
	if ( $project_url && ( ! wp_http_validate_url( $project_url ) || wp_parse_url( $project_url, PHP_URL_USER ) || wp_parse_url( $project_url, PHP_URL_PASS ) || wp_parse_url( $project_url, PHP_URL_QUERY ) ) ) { wp_die( 'ใช้ URL ของ Project ที่ไม่มีรหัสผ่านหรือ query parameters' ); }
	$settings['project_url'] = esc_url_raw( $project_url );
	$before = aurum_video_core_settings(); update_option( 'aurum_video_core_settings', $settings, false );
	aurum_video_core_register_profile();
	if ( $before['profile'] !== $profile ) { flush_rewrite_rules( false ); }
	aurum_video_core_audit( 'profile_saved', 0, array_keys( $settings ) );
	wp_safe_redirect( admin_url( 'admin.php?page=aurum-profile&saved=1' ) ); exit;
}
add_action( 'admin_post_aurum_core_save_profile', 'aurum_video_core_save_profile' );
function aurum_video_core_admin_history() {
	aurum_video_core_admin_start( 'ประวัติรับข้อมูล', '200 เหตุการณ์ล่าสุดของเว็บไซต์นี้ สถานะคิวงานทั้งหมดดูได้ใน Project AURUM' );
	echo '<section class="aurum-core-panel"><div class="aurum-core-table"><table class="widefat striped"><thead><tr><th>เวลา</th><th>เหตุการณ์</th><th>โพสต์</th><th>ข้อมูลที่รับ/แก้ไข</th><th>ผล</th></tr></thead><tbody>';
	$labels = array( 'rest_created' => 'รับวิดีโอใหม่', 'rest_updated' => 'รับข้อมูลอัปเดต', 'csv_updated' => 'แก้ไขด้วย CSV', 'csv_error' => 'นำเข้า CSV ไม่สำเร็จ', 'profile_saved' => 'บันทึกโปรไฟล์' );
	$history = (array) get_option( 'aurum_video_core_history', array() );
	foreach ( $history as $entry ) {
		echo '<tr><td>' . esc_html( $entry['time'] ) . '</td><td>' . esc_html( $labels[ $entry['event'] ] ?? $entry['event'] ) . '</td><td>' . ( $entry['post_id'] ? '#' . (int) $entry['post_id'] : '—' ) . '</td><td>' . esc_html( implode( ', ', $entry['fields'] ) ) . '</td><td>' . esc_html( 'success' === $entry['result'] ? 'สำเร็จ' : 'ไม่สำเร็จ' ) . '</td></tr>';
	}
	if ( ! $history ) { echo '<tr><td colspan="5">ยังไม่มีประวัติการรับข้อมูล</td></tr>'; }
	echo '</tbody></table></div></section></div>';
}

function aurum_video_core_csv_stage_key( $token ) {
	return preg_match( '/^[a-zA-Z0-9]{32}$/', $token ) ? 'aurum_csv_' . get_current_user_id() . '_' . $token : '';
}
function aurum_video_core_admin_csv() {
	aurum_video_core_admin_start( 'นำเข้า / ส่งออก CSV', 'แก้ไขเนื้อหาและ SEO ของวิดีโอเดิม พร้อมตรวจสอบก่อนบันทึก' );
	echo '<div class="aurum-core-cards"><section class="aurum-core-panel"><h2>1. ส่งออกข้อมูล</h2><p>ส่งออกครั้งละไม่เกิน 500 รายการ เฉพาะวิดีโอที่มีรหัส AURUM เลือกหน้าถัดไปเพื่อส่งออกเพิ่มเติม</p>';
	aurum_video_core_admin_form( 'aurum_core_csv_export' );
	echo '<label>หน้าที่ส่งออก <input type="number" name="export_page" min="1" value="1"></label> <label>รายการต่อหน้า <select name="export_per_page"><option>20</option><option selected>50</option><option>100</option><option>500</option></select></label><p class="description">ใช้จำนวนต่อหน้าเท่าเดิมเมื่อส่งออกหน้าถัดไป ถ้าเนื้อหายาวให้ลดจำนวนต่อหน้าเพื่อให้ไฟล์ไม่เกิน 2 MB</p> ';
	submit_button( 'ดาวน์โหลด CSV', 'secondary', 'submit', false ); echo '</form></section><section class="aurum-core-panel"><h2>2. ตรวจไฟล์ก่อนนำเข้า</h2><p>ไฟล์ UTF-8 ไม่เกิน 2 MB / 500 แถว ชื่อและรายละเอียดรองรับภาษาไทย</p>';
	echo '<form method="post" enctype="multipart/form-data" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '"><input type="hidden" name="action" value="aurum_core_csv_preview">';
	wp_nonce_field( 'aurum_core_csv_preview' );
	echo '<label class="screen-reader-text" for="aurum-csv-file">เลือกไฟล์ CSV</label><input required type="file" accept=".csv,text/csv" id="aurum-csv-file" name="csv_file"> ';
	submit_button( 'แสดงตัวอย่าง', 'primary', 'submit', false ); echo '</form></section></div>';
	echo '<section class="aurum-core-panel"><h2>ข้อมูลที่แก้ไขได้</h2><p>ชื่อวิดีโอ ข้อความย่อ รายละเอียด SEO คีย์เวิร์ด หมวดหมู่ แท็ก และนักแสดง</p><p><strong>meta_description จะบันทึกลงทั้งรายละเอียดวิดีโอและ Rank Math description</strong> แถวที่ไม่ได้แก้ไขจะถูกข้าม คอลัมน์ที่นำออกจากไฟล์จะรักษาค่าเดิม การล้างค่าที่เคยมีให้เว้นช่องนั้นว่าง</p><p>หมวดหมู่ แท็ก และนักแสดงใช้ slug ที่มีอยู่ในเว็บ คั่นด้วย | ไม่สร้าง term ใหม่ผ่าน CSV รหัสเว็บไซต์/โพสต์/วิดีโอและ snapshot ห้ามแก้ไข ระบบไม่สร้างโพสต์ใหม่หรือแก้ URL เครื่องเล่น</p></section>';
	$token = sanitize_text_field( wp_unslash( $_GET['preview'] ?? '' ) ); $key = aurum_video_core_csv_stage_key( $token ); $stage = $key ? get_transient( $key ) : false;
	if ( $stage && $stage['expires'] >= time() ) {
		echo '<section class="aurum-core-panel"><h2>3. ตรวจผลและบันทึก</h2><p>ตัวอย่างนี้ใช้ได้ 15 นาที ระบบจะตรวจข้อมูลอีกครั้งก่อนบันทึกทีละรายการ</p><div class="aurum-core-table"><table class="widefat striped"><thead><tr><th>โพสต์</th><th>ข้อมูลที่เปลี่ยน</th><th>ค่าเดิม → ค่าที่จะบันทึก</th><th>ผลตรวจ</th></tr></thead><tbody>';
		foreach ( $stage['rows'] as $item ) {
			echo '<tr><td>#' . (int) $item['row']['post_id'] . '</td><td>' . esc_html( implode( ', ', array_keys( $item['changes'] ) ) ) . '</td><td>';
			$original = json_decode( $item['row']['snapshot'], true );
			foreach ( $item['changes'] as $field => $value ) {
				$proposed = is_array( $value ) ? $item['row'][ $field ] : $value;
				echo '<div><strong>' . esc_html( $field ) . '</strong>: ' . esc_html( mb_substr( (string) ( $original['values'][ $field ] ?? '' ), 0, 180 ) ) . ' → ' . esc_html( '' === $proposed ? '(ล้างค่า)' : mb_substr( (string) $proposed, 0, 180 ) ) . '</div>';
			}
			echo '</td><td>' . esc_html( $item['message'] ) . '</td></tr>';
		}
		echo '</tbody></table></div><p id="aurum-csv-progress" role="status" aria-live="polite">' . (int) $stage['cursor'] . ' / ' . count( $stage['rows'] ) . ' รายการ</p>';
		if ( $stage['cursor'] < count( $stage['rows'] ) ) {
			echo '<form id="aurum-csv-apply" method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '"><input type="hidden" name="action" value="aurum_core_csv_apply"><input type="hidden" name="preview" value="' . esc_attr( $token ) . '">';
			wp_nonce_field( 'aurum_core_csv_apply' ); submit_button( 'บันทึกรายการที่ผ่านการตรวจ' ); echo '</form>';
		}
		echo '</section>';
	} elseif ( $token ) { echo '<div class="notice notice-warning"><p>ตัวอย่างหมดอายุหรือไม่พบข้อมูล กรุณาเลือกไฟล์เพื่อตรวจใหม่</p></div>'; }
	echo '</div>';
}
function aurum_video_core_csv_export_action() {
	aurum_video_core_admin_guard( 'aurum_core_csv_export' );
	$page = max( 1, absint( $_POST['export_page'] ?? 1 ) );
	$per_page = absint( $_POST['export_per_page'] ?? 50 );
	if ( ! in_array( $per_page, array( 20, 50, 100, 500 ), true ) ) { wp_die( 'จำนวนรายการต่อหน้าไม่ถูกต้อง' ); }
	$query = aurum_video_core_managed_query( array( 'posts_per_page' => $per_page, 'paged' => $page, 'meta_query' => array( array( 'key' => 'aurum_movie_id', 'value' => '', 'compare' => '!=' ) ) ) );
	$stream = fopen( 'php://temp/maxmemory:2097152', 'w+b' ); fwrite( $stream, "\xEF\xBB\xBF" );
	$headers = aurum_video_core_csv_headers(); fputcsv( $stream, $headers, ',', '"', '' );
	foreach ( $query->posts as $post ) {
		$row = aurum_video_core_csv_export_row( $post->ID ); $cells = array();
		foreach ( $headers as $field ) { $cells[] = aurum_video_core_csv_escape( $row[ $field ] ); }
		fputcsv( $stream, $cells, ',', '"', '' );
	}
	if ( ftell( $stream ) > 2 * 1024 * 1024 ) { fclose( $stream ); wp_die( 'ไฟล์เกิน 2 MB กรุณาลดจำนวนรายการต่อหน้าแล้วส่งออกใหม่' ); }
	nocache_headers(); header( 'Content-Type: text/csv; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename="aurum-videos-page-' . $page . '.csv"' );
	rewind( $stream ); fpassthru( $stream );
	fclose( $stream ); exit;
}
add_action( 'admin_post_aurum_core_csv_export', 'aurum_video_core_csv_export_action' );
function aurum_video_core_csv_preview_action() {
	aurum_video_core_admin_guard( 'aurum_core_csv_preview' );
	$file = $_FILES['csv_file'] ?? array();
	if ( UPLOAD_ERR_OK !== ( $file['error'] ?? -1 ) || ! is_uploaded_file( $file['tmp_name'] ?? '' ) ) { wp_die( 'อัปโหลดไฟล์ CSV ไม่สำเร็จ' ); }
	$rows = aurum_video_core_csv_parse( $file['tmp_name'] );
	if ( is_wp_error( $rows ) ) { wp_die( esc_html( $rows->get_error_message() ) ); }
	$items = array();
	foreach ( $rows as $row ) {
		$plan = aurum_video_core_csv_prepare( $row );
		$items[] = array( 'row' => $row, 'changes' => is_wp_error( $plan ) ? array() : $plan['changes'],
			'status' => is_wp_error( $plan ) ? 'invalid' : ( $plan['changes'] ? 'ready' : 'skipped' ),
			'message' => is_wp_error( $plan ) ? $plan->get_error_message() : ( $plan['changes'] ? 'พร้อมบันทึก' : 'ไม่มีการเปลี่ยนแปลง' ) );
	}
	$token = wp_generate_password( 32, false, false );
	set_transient( aurum_video_core_csv_stage_key( $token ), array( 'rows' => $items, 'cursor' => 0, 'expires' => time() + 900, 'counts' => array( 'updated' => 0, 'skipped' => 0, 'invalid' => 0, 'error' => 0 ) ), 900 );
	wp_safe_redirect( admin_url( 'admin.php?page=aurum-csv&preview=' . $token ) ); exit;
}
add_action( 'admin_post_aurum_core_csv_preview', 'aurum_video_core_csv_preview_action' );
/** Bounded batches continue automatically in the UI; an atomic lock prevents replay. */
function aurum_video_core_csv_apply_batch( $token ) {
	$key = aurum_video_core_csv_stage_key( $token ); $stage = $key ? get_transient( $key ) : false;
	if ( ! current_user_can( 'manage_options' ) || ! $stage || $stage['expires'] < time() ) { return new WP_Error( 'preview_expired', 'ตัวอย่างหมดอายุหรือไม่มีสิทธิ์ กรุณาตรวจไฟล์ใหม่' ); }
	$lock = 'aurum_csv_lock_' . $token;
	if ( ! add_option( $lock, time(), '', false ) ) { return new WP_Error( 'busy', 'กำลังบันทึกตัวอย่างนี้อยู่ กรุณารอสักครู่' ); }
	try {
		$stage = get_transient( $key ); // Re-read cursor after acquiring the lock.
		if ( ! $stage || $stage['expires'] < time() ) { return new WP_Error( 'preview_expired', 'ตัวอย่างหมดอายุ กรุณาตรวจไฟล์ใหม่' ); }
		$end = min( count( $stage['rows'] ), $stage['cursor'] + 25 );
		while ( $stage['cursor'] < $end ) {
			$item = &$stage['rows'][ $stage['cursor'] ];
			if ( 'ready' === $item['status'] ) {
				$result = aurum_video_core_csv_apply_row( $item['row'] );
				$item['status'] = is_wp_error( $result ) ? 'error' : $result['result'];
				$item['message'] = is_wp_error( $result ) ? $result->get_error_message() : ( 'updated' === $result['result'] ? 'บันทึกแล้ว' : 'ไม่มีการเปลี่ยนแปลง' );
			}
			++$stage['counts'][ $item['status'] ]; ++$stage['cursor']; unset( $item );
		}
		set_transient( $key, $stage, max( 1, $stage['expires'] - time() ) );
		return array( 'processed' => $stage['cursor'], 'total' => count( $stage['rows'] ), 'counts' => $stage['counts'], 'finished' => $stage['cursor'] >= count( $stage['rows'] ) );
	} finally { delete_option( $lock ); }
}
function aurum_video_core_csv_apply_action() {
	aurum_video_core_admin_guard( 'aurum_core_csv_apply' );
	$token = sanitize_text_field( wp_unslash( $_POST['preview'] ?? '' ) );
	$result = aurum_video_core_csv_apply_batch( $token );
	if ( isset( $_POST['ajax'] ) ) {
		if ( is_wp_error( $result ) ) { wp_send_json_error( array( 'message' => $result->get_error_message() ), 409 ); }
		wp_send_json_success( $result );
	}
	if ( is_wp_error( $result ) ) { wp_die( esc_html( $result->get_error_message() ) ); }
	wp_safe_redirect( admin_url( 'admin.php?page=aurum-csv&preview=' . $token ) ); exit;
}
add_action( 'admin_post_aurum_core_csv_apply', 'aurum_video_core_csv_apply_action' );
