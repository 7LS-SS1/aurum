<?php
require '/var/www/html/wp-load.php';
require '/tmp/aurum-ads.php';
function aa_check($condition, $name) { if (!$condition) throw new Exception($name); echo "PASS $name\n"; }
$names = array('aurum_ads_settings','aurum_ads_last_sync','aurum_ads_last_error','_transient_aurum_ads_manifest','_transient_timeout_aurum_ads_manifest');
$old = array(); foreach ($names as $name) $old[$name] = get_option($name, null);
try {
 $site = '11111111-1111-4111-8111-111111111111';
 $key = str_repeat('x',48);
 update_option('aurum_ads_settings', array('origin'=>'https://aurum.example','website'=>$site,'key'=>$key), false);
 $data = array('version'=>1,'websiteId'=>$site,'expiresAt'=>gmdate('c',time()+600),'slots'=>array(array('id'=>'video_ad:1','label'=>'Video 1','state'=>'reserved','locked'=>true,'media'=>null)));
 $mock = function($pre,$args,$url) use ($data,$key) {
  aa_check($args['headers']['Authorization'] === 'Bearer '.$key,'server_side_bearer');
  aa_check($args['redirection'] === 0,'no_credential_redirect');
  return array('headers'=>array(),'body'=>wp_json_encode($data),'response'=>array('code'=>200,'message'=>'OK'),'cookies'=>array(),'filename'=>null);
 };
 add_filter('pre_http_request',$mock,10,3);
 aa_check(!is_wp_error(aurum_ads_sync()),'sync_success');
 aa_check(aurum_ads_manifest()['slots'][0]['locked'] === true,'reserved_lock');
 remove_filter('pre_http_request',$mock,10);
 $player = do_shortcode('[aurum_ads_player iframe="https://example.org/embed/test"]');
 aa_check(strpos($player,'<iframe') === false && strpos($player,'data-content-url') !== false,'main_content_deferred');
 aa_check(do_shortcode('[aurum_ads_player src="javascript:alert(1)"]') === '', 'unsafe_media_rejected');
 aa_check(strpos(do_shortcode('[aurum_ads placement="video_top"]'),'data-aurum-ads-zone="video_top"') !== false,'placement_shortcode');
 aa_check(do_shortcode('[aurum_ads placement="invalid"]') === '', 'invalid_placement_rejected');
 do_action('rest_api_init');
 $response = rest_do_request(new WP_REST_Request('GET','/aurum-ads/v1/manifest'));
 aa_check($response->get_status() === 200, 'public_manifest_runtime');
 aa_check(strpos(wp_json_encode($response->get_data()),$key) === false,'key_never_public');
 $data['expiresAt'] = gmdate('c',time()-1);set_transient('aurum_ads_manifest',$data,60);
 aa_check(aurum_ads_manifest()['slots'] === array(),'expired_manifest_hidden');
 echo "AURUM_ADS_WORDPRESS_RUNTIME_OK\n";
} finally {
 foreach($old as $name=>$value) { if ($value === null) delete_option($name); else update_option($name,$value,false); }
}
