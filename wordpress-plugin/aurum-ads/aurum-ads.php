<?php
/**
 * Plugin Name: AURUM Ads
 * Description: Central AURUM advertising inventory, exclusive banners and a three-step pre-roll player.
 * Version: 1.1.0
 * Requires at least: 6.4
 * Requires PHP: 8.0
 * License: GPL-2.0-or-later
 */
defined('ABSPATH') || exit;
define('AURUM_ADS_VERSION', '1.1.0');
function aurum_ads_settings() { return get_option('aurum_ads_settings', array()); }
function aurum_ads_sync() {
    $s = aurum_ads_settings();
    if (empty($s['origin']) || empty($s['website']) || empty($s['key'])) return new WP_Error('not_configured', 'กรุณาตั้งค่าการเชื่อมต่อ');
    $url = $s['origin'] . '/api/public/ads-plugin?websiteId=' . rawurlencode($s['website']);
    $response = wp_safe_remote_get($url, array('timeout' => 12, 'redirection' => 0, 'limit_response_size' => 262144, 'headers' => array('Authorization' => 'Bearer ' . $s['key'], 'Accept' => 'application/json')));
    if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
        update_option('aurum_ads_last_error', 'เชื่อมต่อ AURUM ไม่สำเร็จ โปรดตรวจ URL, Website ID และคีย์', false);
        return new WP_Error('sync_failed', 'เชื่อมต่อ AURUM ไม่สำเร็จ');
    }
    $data = json_decode(wp_remote_retrieve_body($response), true);
    if (!is_array($data) || ($data['version'] ?? null) !== 1 || ($data['websiteId'] ?? '') !== $s['website'] || !isset($data['slots']) || !is_array($data['slots']) || count($data['slots']) > 72 || strtotime($data['expiresAt'] ?? '') <= time()) return new WP_Error('invalid_manifest', 'ข้อมูล AURUM ไม่ถูกต้อง');
    set_transient('aurum_ads_manifest', $data, 600);
    update_option('aurum_ads_last_sync', time(), false);
    delete_option('aurum_ads_last_error');
    return $data;
}
function aurum_ads_manifest() {
    $data = get_transient('aurum_ads_manifest');
    if (!is_array($data) || strtotime($data['expiresAt'] ?? '') <= time()) return array('slots' => array(), 'expiresAt' => gmdate('c'));
    return $data;
}
add_filter('cron_schedules', function($s) { $s['aurum_ads_minute'] = array('interval' => 60, 'display' => 'AURUM Ads every minute'); return $s; });
register_activation_hook(__FILE__, function() { if (!wp_next_scheduled('aurum_ads_sync_event')) wp_schedule_event(time()+10, 'aurum_ads_minute', 'aurum_ads_sync_event'); });
register_deactivation_hook(__FILE__, function() { wp_clear_scheduled_hook('aurum_ads_sync_event'); delete_transient('aurum_ads_manifest'); });
add_action('aurum_ads_sync_event', 'aurum_ads_sync');
add_action('rest_api_init', function() {
    register_rest_route('aurum-ads/v1', '/manifest', array('methods' => 'GET', 'permission_callback' => '__return_true', 'callback' => function() {
        $data = aurum_ads_manifest();
        $response = new WP_REST_Response(array('slots' => $data['slots'], 'expiresAt' => $data['expiresAt']));
        $response->header('Cache-Control', 'no-store');
        return $response;
    }));
});
add_action('admin_menu', function() { add_menu_page('AURUM Ads', 'AURUM Ads', 'manage_options', 'aurum-ads', 'aurum_ads_admin', 'dashicons-megaphone', 59); });
add_action('admin_enqueue_scripts', function($hook) { if ($hook === 'toplevel_page_aurum-ads') wp_enqueue_style('aurum-ads-admin', plugins_url('assets/admin.css', __FILE__), array(), AURUM_ADS_VERSION); });
add_action('admin_post_aurum_ads_save', function() {
    if (!current_user_can('manage_options')) wp_die('Forbidden', '', array('response'=>403));
    check_admin_referer('aurum_ads_save');
    $old = aurum_ads_settings();
    $origin = esc_url_raw(trim(wp_unslash($_POST['origin'] ?? '')), array('https'));
    $parts = wp_parse_url($origin);
    $website = sanitize_text_field(wp_unslash($_POST['website'] ?? ''));
    $key = trim(wp_unslash($_POST['key'] ?? ''));
    if (!$parts || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment']) || !empty($parts['port']) || !empty(trim($parts['path'] ?? '', '/')) || !preg_match('/^[a-f0-9-]{36}$/i', $website)) wp_die('URL หรือ Website ID ไม่ถูกต้อง');
    if ($key === '') $key = $old['key'] ?? '';
    if (!preg_match('/^[a-zA-Z0-9_-]{40,200}$/', $key)) wp_die('ใช้คีย์สุ่ม 40–200 ตัวอักษร');
    update_option('aurum_ads_settings', array('origin'=>rtrim($origin, '/'), 'website'=>$website, 'key'=>$key), false);
    delete_transient('aurum_ads_manifest');
    aurum_ads_sync();
    wp_safe_redirect(admin_url('admin.php?page=aurum-ads')); exit;
});
add_action('admin_post_aurum_ads_sync', function() {
    if (!current_user_can('manage_options')) wp_die('Forbidden', '', array('response'=>403));
    check_admin_referer('aurum_ads_sync'); aurum_ads_sync(); wp_safe_redirect(admin_url('admin.php?page=aurum-ads')); exit;
});
function aurum_ads_admin() {
    if (!current_user_can('manage_options')) return;
    $s = aurum_ads_settings(); $data = aurum_ads_manifest();
    $locked = count(array_filter($data['slots'], function($slot) { return !empty($slot['locked']); }));
    ?>
    <div class="wrap aa:p-6 aa:max-w-7xl aa:space-y-6">
      <div class="aa:rounded-2xl aa:bg-slate-950 aa:p-8 aa:text-white"><p class="aa:text-amber-300 aa:tracking-widest">AURUM / ADVERTISING</p><h1 class="aa:text-3xl aa:font-bold aa:text-white">พื้นที่โฆษณาของเว็บไซต์</h1><p class="aa:text-slate-300">จัดการสัญญาที่ AURUM · ตรวจสถานะและการเชื่อมต่อที่นี่</p></div>
      <?php if (get_option('aurum_ads_last_error')): ?><div class="notice notice-error"><p><?php echo esc_html(get_option('aurum_ads_last_error')); ?></p></div><?php endif; ?>
      <?php if (defined('RTB_VERSION') || defined('ABA_VERSION')): ?><div class="notice notice-warning"><p>ตรวจพบปลั๊กอินโฆษณาเดิม โปรดย้ายรายการและปิดตำแหน่งเดิมก่อนเปิด AURUM Ads เพื่อป้องกันโฆษณาซ้อนกัน</p></div><?php endif; ?>
      <div class="aa:grid aa:grid-cols-1 aa:md:grid-cols-3 aa:gap-4">
        <?php foreach(array('ตำแหน่งทั้งหมด'=>count($data['slots']), 'ถูกล็อก / มีผู้จอง'=>$locked, 'ลำดับวิดีโอสูงสุด'=>3) as $label=>$value): ?><div class="aa:bg-white aa:rounded-xl aa:p-6 aa:border aa:border-slate-200"><p><?php echo esc_html($label); ?></p><strong class="aa:text-3xl"><?php echo esc_html($value); ?></strong></div><?php endforeach; ?>
      </div>
      <div class="aa:grid aa:grid-cols-1 aa:lg:grid-cols-3 aa:gap-6">
        <section class="aa:lg:col-span-2 aa:bg-white aa:p-6 aa:rounded-2xl aa:border aa:border-slate-200"><h2 class="aa:text-xl aa:font-bold">แผนผังตำแหน่งและสถานะ</h2><p>สถานะจาก AURUM เท่านั้น ไม่มีการแก้ป้ายทับสัญญาจาก WordPress</p><div class="aa:grid aa:grid-cols-1 aa:md:grid-cols-2 aa:gap-3">
          <?php foreach($data['slots'] as $slot): ?><article class="aa:rounded-xl aa:border aa:border-slate-200 aa:p-4"><strong><?php echo esc_html($slot['label']); ?></strong><p class="aa:text-sm"><?php echo esc_html(array('active'=>'กำลังแสดง · ล็อก', 'reserved'=>'มีผู้จอง · ล็อก', 'available'=>'ว่าง', 'conflict'=>'ข้อมูลชนกัน · ล็อก รอตรวจสอบ')[$slot['state']] ?? 'ไม่ทราบสถานะ'); ?></p><code><?php echo esc_html($slot['id']); ?></code></article><?php endforeach; ?>
          <?php if (!$data['slots']): ?><p>ยังไม่มีข้อมูลที่ยืนยันได้ โปรดเชื่อมต่อและซิงก์ก่อนใช้งาน</p><?php endif; ?>
        </div></section>
        <section class="aa:bg-white aa:p-6 aa:rounded-2xl aa:border aa:border-slate-200 aa:space-y-4"><h2 class="aa:text-xl aa:font-bold">เชื่อมต่อ AURUM</h2><form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="aa:space-y-4"><input type="hidden" name="action" value="aurum_ads_save"><?php wp_nonce_field('aurum_ads_save'); ?>
          <label class="aa:block">AURUM URL<input class="aa:w-full" name="origin" type="url" required placeholder="https://aurum123.com" value="<?php echo esc_attr($s['origin'] ?? ''); ?>"></label>
          <label class="aa:block">Website ID<input class="aa:w-full" name="website" required value="<?php echo esc_attr($s['website'] ?? ''); ?>"></label>
          <label class="aa:block">คีย์เฉพาะเว็บไซต์<input class="aa:w-full" type="password" name="key" autocomplete="new-password" placeholder="เว้นว่างเพื่อใช้คีย์เดิม"></label>
          <button class="button button-primary">บันทึกและเชื่อมต่อ</button></form>
          <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>"><input type="hidden" name="action" value="aurum_ads_sync"><?php wp_nonce_field('aurum_ads_sync'); ?><button class="button">ซิงก์สถานะตอนนี้</button></form>
          <p>ซิงก์ล่าสุด: <?php echo esc_html(get_option('aurum_ads_last_sync') ? wp_date('d/m/Y H:i:s', get_option('aurum_ads_last_sync')) : 'ยังไม่เคยเชื่อมต่อ'); ?></p>
        </section>
      </div>
      <section class="aa:bg-white aa:p-6 aa:rounded-2xl aa:border aa:border-slate-200"><h2 class="aa:text-xl aa:font-bold">วางตำแหน่งบนธีม</h2><p>Banner: <code>[aurum_ads placement="home_top"]</code> · ใช้ home_bottom, video_top, video_bottom ได้ด้วย</p><p>ตัวเล่นที่รอโฆษณาครบก่อนเริ่มเนื้อหา: <code>[aurum_ads_player src="https://…/video.mp4"]</code> หรือ <code>[aurum_ads_player iframe="https://…/embed/…"]</code></p><p>หน้าแรกและเหนือ/ใต้กรอบวิดีโอแทรกอัตโนมัติ เมื่อพบพื้นที่หลักของธีม ไม่แทรกซ้ำกับ shortcode ที่มีอยู่ · Popup / Fixed แสดงอัตโนมัติ ห้ามเปิดระบบ Pre-roll เดิมซ้อนกัน</p></section>
    </div><?php
}
add_action('wp_enqueue_scripts', function() {
    if (is_admin() || is_feed()) return;
    wp_enqueue_style('aurum-ads', plugins_url('assets/frontend.css', __FILE__), array(), AURUM_ADS_VERSION);
    wp_enqueue_script('aurum-ads', plugins_url('assets/frontend.js', __FILE__), array(), AURUM_ADS_VERSION, true);
    wp_add_inline_script('aurum-ads', 'window.aurumAdsPlacement=' . wp_json_encode(array('home'=>is_front_page() || is_home(), 'single'=>is_singular() && !is_front_page())) . ';', 'before');
    wp_add_inline_script('aurum-ads', 'window.aurumAdsEndpoint=' . wp_json_encode(rest_url('aurum-ads/v1/manifest')) . ';', 'before');
});
add_shortcode('aurum_ads', function($attributes) {
    $a = shortcode_atts(array('placement'=>'home_top'), $attributes);
    if (!in_array($a['placement'], array('home_top','home_bottom','video_top','video_bottom'), true)) return '';
    return '<div class="aurum-ads-zone" data-aurum-ads-zone="' . esc_attr($a['placement']) . '"></div>';
});
add_shortcode('aurum_ads_player', function($attributes) {
    $a = shortcode_atts(array('src'=>'', 'iframe'=>'', 'poster'=>''), $attributes);
    $url = esc_url($a['iframe'] ?: $a['src'], array('https'));
    if (!$url) return '';
    return '<div class="aurum-ads-gate" data-content-url="'.$url.'" data-content-kind="'.($a['iframe'] ? 'iframe' : 'video').'" data-poster="'.esc_url($a['poster'], array('https')).'"><button type="button" class="aurum-ads-start">▶ เล่นวิดีโอ</button><noscript>กรุณาเปิด JavaScript เพื่อเล่นวิดีโอ</noscript></div>';
});
add_action('wp_footer', function() {
    foreach(array('popup','fixed_left','fixed_right','fixed_bottom') as $zone) echo '<div class="aurum-ads-zone aurum-ads-'.esc_attr($zone).'" data-aurum-ads-zone="'.esc_attr($zone).'"></div>';
});
