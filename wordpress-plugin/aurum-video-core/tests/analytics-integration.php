<?php
require '/var/www/html/wp-load.php';
if(!function_exists('aurum_analytics_record'))require '/tmp/aurum-analytics.php';
aurum_analytics_install();
function check_analytics($value,$message){if(!$value)throw new Exception($message);}
$_SERVER['HTTP_USER_AGENT']='AURUM local integration test';
$post=wp_insert_post(array('post_type'=>'post','post_status'=>'publish','post_title'=>'Analytics local test'));
update_post_meta($post,'aurum_movie_id','analytics-local-test');
$raw=wp_generate_uuid4();$visitor=aurum_analytics_visitor($raw);
$_COOKIE['aurum_analytics_visitor']=$raw;
wp_set_current_user(0);
try {
 check_analytics(aurum_analytics_record('visitor',0,$visitor)===1,'first visitor');
 check_analytics(aurum_analytics_record('visitor',0,$visitor)===0,'dedup visitor');
 check_analytics(aurum_analytics_record('view',$post,$visitor)===1,'first view');
 check_analytics(aurum_analytics_record('view',$post,$visitor)===0,'dedup view');
 check_analytics(aurum_analytics_record('like',$post,$visitor)===1,'first like');
 check_analytics(aurum_analytics_record('like',$post,$visitor)===0,'dedup like');
 $_SERVER['HTTP_USER_AGENT']='Googlebot';check_analytics(aurum_analytics_record('view',$post,hash('sha256','bot'))===false,'bot rejected');$_SERVER['HTTP_USER_AGENT']='AURUM local integration test';
 // REST access and origin checks run through WordPress dispatch.
 $server=rest_get_server();do_action('rest_api_init',$server);
 $private=new WP_REST_Request('GET','/aurum-analytics/v1/snapshot');check_analytics(rest_do_request($private)->get_status()===401,'anonymous cannot read metrics');
 $bad=new WP_REST_Request('POST','/aurum-analytics/v1/event');$bad->set_header('Origin','https://evil.test');$bad->set_header('Content-Type','application/json');$bad->set_body(wp_json_encode(array('kind'=>'view','visitor'=>$raw,'postId'=>$post)));check_analytics(rest_do_request($bad)->get_status()===403,'foreign origin rejected');
 $good=new WP_REST_Request('POST','/aurum-analytics/v1/event');$good->set_header('Origin',home_url());$good->set_header('Content-Type','application/json');$good->set_body(wp_json_encode(array('kind'=>'visitor','visitor'=>$raw)));check_analytics(rest_do_request($good)->get_status()===200,'same origin accepted');
 $before=aurum_analytics_snapshot()->get_data();update_post_meta($post,'_sevenls_vp_like_count',999999);$after=aurum_analytics_snapshot()->get_data();check_analytics($before['likes']===$after['likes'],'boost does not alter measured likes');
 echo "ANALYTICS_WP_PASS dedup, bot, origin, private endpoint, real snapshot, boost separation\n";
}finally{global $wpdb;$wpdb->delete($wpdb->prefix.'aurum_measured_events',array('visitor'=>$visitor));wp_delete_post($post,true);}
