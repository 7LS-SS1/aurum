<?php
defined('ABSPATH') || exit;
$slots = $data['slots'];
$last_sync = (int) get_option('aurum_ads_last_sync');
$error = get_option('aurum_ads_last_error');
$configured = !empty($s['origin']) && !empty($s['website']) && !empty($s['key']);
$fresh = $last_sync && strtotime($data['expiresAt'] ?? '') > time();
$status = $error ? 'เชื่อมต่อไม่สำเร็จ' : ($fresh ? 'ข้อมูลพร้อมใช้งาน' : ($configured ? 'รอซิงก์ข้อมูล' : 'ยังไม่ได้เชื่อมต่อ'));
$counts = array('active'=>0, 'reserved'=>0, 'available'=>0, 'conflict'=>0);
foreach ($slots as $slot) { if (isset($counts[$slot['state'] ?? ''])) $counts[$slot['state']]++; }
$states = array('active'=>'กำลังแสดง', 'reserved'=>'มีผู้จอง', 'available'=>'ว่าง', 'conflict'=>'รอตรวจสอบ');
$groups = array('home_top'=>'หน้าแรก · ด้านบน', 'home_bottom'=>'หน้าแรก · ด้านล่าง', 'video_top'=>'วิดีโอ · ด้านบน', 'video_bottom'=>'วิดีโอ · ด้านล่าง', 'video_ad'=>'โฆษณาก่อนเล่นวิดีโอ', 'popup'=>'ป๊อปอัป', 'fixed_left'=>'ลอยด้านซ้าย', 'fixed_right'=>'ลอยด้านขวา', 'fixed_bottom'=>'ลอยด้านล่าง');
?>
<div class="wrap aurum-ads-admin">
  <header class="aa-topbar"><div class="aa-brand"><span class="aa-monogram" aria-hidden="true">A</span><span>AURUM <b>ADS</b><small>พื้นที่โฆษณาของคุณ</small></span></div><span class="aa-version">WORDPRESS <span>v<?php echo esc_html(AURUM_ADS_VERSION); ?></span></span></header>
  <section class="aa-hero">
    <div class="aa-hero-copy"><span class="aa-eyebrow">YOUR SPACE. MORE POSSIBILITIES.</span><h1>ทุกพื้นที่ มีโอกาสใหม่<span>จัดการโฆษณาได้อย่างมั่นใจ</span></h1><p>ดูตำแหน่งว่าง ติดตามการจอง และเชื่อมต่อเว็บไซต์ของคุณกับ AURUM ในที่เดียว</p><a class="aa-button aa-gold" href="#aa-inventory">สำรวจพื้นที่โฆษณา <span aria-hidden="true">↗</span></a></div>
    <div class="aa-hero-art" aria-hidden="true"><div class="aa-orbit"></div><div class="aa-mini-browser"><div class="aa-browser-bar"><i></i><i></i><i></i><span>YOUR WEBSITE</span></div><div class="aa-mini-banner">AURUM <span>PREMIUM SPACE ↗</span></div><div class="aa-mini-content"><div>▶</div><div><i></i><i></i><i></i></div></div><div class="aa-mini-bottom"></div></div><span class="aa-art-tag">✦ พื้นที่ของคุณ โอกาสของแบรนด์</span></div>
  </section>
  <div class="aa-statusbar"><span class="aa-connection <?php echo $fresh && !$error ? 'is-ready' : ''; ?>"><i aria-hidden="true"></i><?php echo esc_html($status); ?></span><span>ซิงก์สำเร็จล่าสุด <strong><?php echo esc_html($last_sync ? wp_date('d/m/Y H:i', $last_sync) : '—'); ?></strong></span><a href="#aa-connection">ตั้งค่าการเชื่อมต่อ ↗</a></div>
  <?php if ($error): ?><div class="aa-alert" role="alert"><strong>ตรวจสอบการเชื่อมต่อ</strong><p><?php echo esc_html($error); ?> ข้อมูลที่เห็นอาจเป็นข้อมูลจากการซิงก์ครั้งก่อน</p></div><?php endif; ?>
  <?php if (defined('RTB_VERSION') || defined('ABA_VERSION')): ?><div class="aa-alert"><strong>พบปลั๊กอินโฆษณาอื่นบนเว็บไซต์</strong><p>โปรดย้ายรายการและปิดตำแหน่งเดิมก่อนเปิด AURUM Ads เพื่อป้องกันโฆษณาซ้อนกัน</p></div><?php endif; ?>
  <div class="aa-stats">
    <?php foreach (array(array('ตำแหน่งทั้งหมด',count($slots),'จากข้อมูลที่ยังไม่หมดอายุ','▦'),array('กำลังแสดง',$counts['active'],'โฆษณาที่เปิดใช้งาน','↗'),array('มีผู้จอง',$counts['reserved'],'พื้นที่ที่รอเริ่มแสดง','◷'),array('พื้นที่ว่าง',$counts['available'],'สถานะล่าสุดจาก AURUM','⊞')) as $stat): ?>
    <article class="aa-stat"><span class="aa-stat-icon" aria-hidden="true"><?php echo esc_html($stat[3]); ?></span><p><?php echo esc_html($stat[0]); ?></p><strong><?php echo $fresh ? esc_html(str_pad((string)$stat[1],2,'0',STR_PAD_LEFT)) : '—'; ?></strong><small><?php echo esc_html($stat[2]); ?></small></article>
    <?php endforeach; ?>
  </div>
  <div class="aa-workspace">
    <section class="aa-panel aa-inventory" id="aa-inventory"><div class="aa-section-heading"><div><span class="aa-eyebrow">PLACEMENT OVERVIEW</span><h2>พื้นที่โฆษณา</h2></div><span class="aa-count"><?php echo esc_html(count($slots)); ?> ตำแหน่ง</span></div><p class="aa-muted">การจองและสัญญาจัดการผ่าน AURUM สถานะของแต่ละพื้นที่แสดงที่นี่</p>
      <div class="aa-filters" role="group" aria-label="กรองสถานะโฆษณา" hidden><button type="button" data-aa-filter="all" aria-pressed="true">ทั้งหมด</button><?php foreach ($states as $state=>$label): ?><button type="button" data-aa-filter="<?php echo esc_attr($state); ?>" aria-pressed="false"><?php echo esc_html($label); ?></button><?php endforeach; ?></div>
      <div class="aa-slot-list">
        <?php foreach ($slots as $slot): $state = isset($states[$slot['state'] ?? '']) ? $slot['state'] : 'unknown'; $zone = explode(':', $slot['id'] ?? '')[0]; ?>
        <article class="aa-slot" data-aa-state="<?php echo esc_attr($state); ?>"><span class="aa-slot-icon" aria-hidden="true"><?php echo $zone === 'video_ad' ? '▶' : '▦'; ?></span><div class="aa-slot-name"><h3><?php echo esc_html($slot['label'] ?? $slot['id']); ?></h3><span><?php echo esc_html($groups[$zone] ?? 'ตำแหน่งอื่น'); ?> <code><?php echo esc_html($slot['id']); ?></code></span></div><div class="aa-slot-status"><span class="aa-badge aa-badge-<?php echo esc_attr($state); ?>"><i aria-hidden="true"></i><?php echo esc_html($states[$state] ?? 'ไม่ทราบสถานะ'); ?></span><?php if (!empty($slot['locked'])): ?><small>ล็อกตำแหน่ง</small><?php endif; ?></div></article>
        <?php endforeach; ?>
      </div>
      <?php if (!$slots): ?><div class="aa-empty"><span aria-hidden="true">▦</span><h3>พื้นที่ของคุณ เริ่มต้นที่การเชื่อมต่อ</h3><p>กรอกข้อมูลเว็บไซต์ แล้วซิงก์เพื่อดูตำแหน่งและสถานะจริง<br>หากเคยเชื่อมต่อแล้ว ข้อมูลอาจหมดอายุ โปรดซิงก์อีกครั้ง</p><a href="#aa-connection" class="aa-button aa-dark">ตั้งค่าการเชื่อมต่อ ↗</a></div><?php endif; ?>
      <p class="aa-filter-empty" hidden role="status">ไม่มีตำแหน่งในสถานะนี้</p>
      <div class="aa-inventory-note">ข้อมูลที่หมดอายุจะไม่แสดงเป็นพื้นที่ว่าง · สถานะอาจเปลี่ยนเมื่อมีการจองใหม่</div>
    </section>
    <aside class="aa-sidebar"><section class="aa-panel" id="aa-connection"><div class="aa-section-heading"><div><span class="aa-eyebrow">CONNECT YOUR WEBSITE</span><h2>เชื่อมต่อ AURUM</h2></div><span class="aa-connect-icon" aria-hidden="true">↗</span></div><p class="aa-muted">ใช้ข้อมูลจากหน้าจัดการเว็บไซต์ใน AURUM เพื่อเชื่อมพื้นที่โฆษณาของคุณ</p>
      <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="aa-form"><input type="hidden" name="action" value="aurum_ads_save"><?php wp_nonce_field('aurum_ads_save'); ?>
        <label for="aa-origin">AURUM URL</label><input id="aa-origin" name="origin" type="url" required placeholder="https://aurum123.com" value="<?php echo esc_attr($s['origin'] ?? ''); ?>" aria-describedby="aa-origin-help"><small id="aa-origin-help">URL หลักของระบบ AURUM ของคุณ</small>
        <label for="aa-website">Website ID</label><input id="aa-website" name="website" required placeholder="รหัสเว็บไซต์จาก AURUM" value="<?php echo esc_attr($s['website'] ?? ''); ?>" spellcheck="false">
        <label for="aa-key">คีย์เฉพาะเว็บไซต์ <?php if (!empty($s['key'])): ?><span class="aa-saved">บันทึกแล้ว</span><?php endif; ?></label><input id="aa-key" type="password" name="key" autocomplete="new-password" placeholder="<?php echo !empty($s['key']) ? 'เว้นว่างเพื่อใช้คีย์เดิม' : 'วางคีย์เว็บไซต์ที่นี่'; ?>" aria-describedby="aa-key-help"><small id="aa-key-help">คีย์ถูกเก็บบนเซิร์ฟเวอร์ ไม่แสดงต่อผู้เข้าชม</small>
        <button class="aa-button aa-dark" type="submit">บันทึกและเชื่อมต่อ <span aria-hidden="true">↗</span></button>
      </form><form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="aa-sync"><input type="hidden" name="action" value="aurum_ads_sync"><?php wp_nonce_field('aurum_ads_sync'); ?><button class="aa-button aa-outline" type="submit">↻ ซิงก์สถานะตอนนี้</button></form>
    </section><section class="aa-tip"><span class="aa-eyebrow">BUILT FOR YOUR CONTENT</span><h3>ประสบการณ์ที่ต่อเนื่อง<br>ตั้งแต่โฆษณาถึงวิดีโอ</h3><p>รองรับโฆษณาก่อนเล่นสูงสุด 3 ลำดับ<br>แล้วจึงเริ่มเนื้อหาหลักของคุณ</p><div aria-hidden="true"><span>01</span><i></i><span>02</span><i></i><span>03</span><i></i><b>▶</b></div></section></aside>
  </div>
  <section class="aa-panel aa-guide"><div><span class="aa-eyebrow">MAKE IT YOURS</span><h2>วางโฆษณาให้เข้ากับเว็บไซต์</h2><p class="aa-muted">หน้าแรกและเหนือ/ใต้วิดีโอแทรกอัตโนมัติเมื่อพบพื้นที่หลักของธีม โดยไม่ซ้ำกับ shortcode เดิม</p></div><details><summary>คู่มือวางตำแหน่งและตัวเล่น <span aria-hidden="true">＋</span></summary><div class="aa-guide-content"><h3>แบนเนอร์ในหน้า</h3><code>[aurum_ads placement="home_top"]</code><p>เปลี่ยนเป็น home_bottom, video_top หรือ video_bottom ได้ตามตำแหน่งที่ต้องการ หากธีมไม่รองรับการแทรกอัตโนมัติ ให้วาง shortcode หนึ่งครั้งต่อจุด</p><h3>ตัวเล่นวิดีโอ</h3><code>[aurum_ads_player src="https://example.org/video.mp4"]</code><code>[aurum_ads_player iframe="https://example.org/embed/123"]</code><p>Popup / Fixed แสดงอัตโนมัติ ห้ามเปิดระบบ Pre-roll เดิมซ้อนกัน</p></div></details></section>
  <footer class="aa-footer"><span>AURUM ADS <i>·</i> พื้นที่ที่ใช่ สำหรับทุกโอกาส</span><span>จัดการสัญญาผ่าน AURUM</span></footer>
</div>
