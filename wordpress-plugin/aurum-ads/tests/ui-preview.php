<?php
// Local-only rendered fixture. Does not write options or contact AURUM.
define('WP_INSTALLING', true);
require '/var/www/html/wp-load.php';
require dirname(__DIR__) . '/aurum-ads.php';
$mode = $argv[1] ?? 'populated';
$s = array('origin'=>'https://aurum.example', 'website'=>'11111111-1111-4111-8111-111111111111','key'=>'fixture-key-never-rendered');
$data = array('expiresAt'=>gmdate('c',time()+600), 'slots'=>array());
if ($mode === 'populated') {
    foreach (array('active','reserved','available','conflict','available','active','reserved','available') as $i=>$state) {
        $data['slots'][] = array('id'=>($i < 4 ? 'home_top:' : 'video_top:').($i+1), 'label'=>($i < 4 ? 'แบนเนอร์หน้าแรก ' : 'แบนเนอร์หน้าวิดีโอ ').($i+1), 'state'=>$state, 'locked'=>$state !== 'available');
    }
} else { $s = array(); $data['expiresAt'] = gmdate('c',time()-1); }
add_filter('pre_option_aurum_ads_last_sync', function() use ($mode) { return $mode === 'populated' ? time() : 0; });
add_filter('pre_option_aurum_ads_last_error', function() { return ''; });
header('Content-Type: text/html; charset=utf-8');
?><!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AURUM Ads — local UI preview</title><style>body{margin:0;background:#f0f0f1;padding:20px} .wrap{margin-left:auto!important;margin-right:auto!important} <?php echo file_get_contents(dirname(__DIR__).'/assets/admin.css'); ?></style></head><body><?php require dirname(__DIR__).'/admin-view.php'; ?><script><?php echo file_get_contents(dirname(__DIR__).'/assets/admin.js'); ?></script></body></html>
