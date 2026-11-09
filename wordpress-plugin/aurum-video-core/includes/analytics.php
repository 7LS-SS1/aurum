<?php
/** Measured events, separate from imported/boosted theme counters. No raw IPs leave WordPress. */
defined('ABSPATH') || exit;
function aurum_analytics_install() {
 global $wpdb;
 require_once ABSPATH . 'wp-admin/includes/upgrade.php';
 $table=$wpdb->prefix.'aurum_measured_events';
 dbDelta("CREATE TABLE $table (
 id bigint unsigned NOT NULL AUTO_INCREMENT,
 event_key char(64) NOT NULL,
 visitor char(64) NOT NULL,
 kind varchar(10) NOT NULL,
 post_id bigint unsigned NOT NULL DEFAULT 0,
 day date NOT NULL,
 PRIMARY KEY (id),
 UNIQUE KEY event_key (event_key),
 KEY day_kind (day,kind),
 KEY post_day (post_id,day)
 ) ".$wpdb->get_charset_collate().';');
 if($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s',$wpdb->esc_like($table)))!==$table)return;
 update_option('aurum_analytics_version','1',false);
 add_option('aurum_analytics_started',gmdate('c'),'',false);
}
add_action('init',function(){if(get_option('aurum_analytics_version')!=='1')aurum_analytics_install();});
function aurum_analytics_enabled() { return !defined('AURUM_ANALYTICS_DISABLED') || !AURUM_ANALYTICS_DISABLED; }
function aurum_analytics_bot() { return preg_match('/bot|crawl|spider|headless|preview|monitor/i',$_SERVER['HTTP_USER_AGENT']??'') || empty($_SERVER['HTTP_USER_AGENT']); }
function aurum_analytics_visitor($id='') {
 if(!$id)$id=$_COOKIE['aurum_analytics_visitor']??'';
 if(!preg_match('/^[a-f0-9-]{36}$/i',$id))return '';
 return hash_hmac('sha256',$id,wp_salt('auth'));
}
function aurum_analytics_record($kind,$post_id,$visitor) {
 if(!aurum_analytics_enabled() || !$visitor || aurum_analytics_bot())return false;
 global $wpdb;
 $day=gmdate('Y-m-d');
 $key=hash('sha256',$kind.':'.$post_id.':'.$visitor.':'.$day);
 return $wpdb->query($wpdb->prepare("INSERT IGNORE INTO {$wpdb->prefix}aurum_measured_events (event_key,visitor,kind,post_id,day) VALUES (%s,%s,%s,%d,%s)",$key,$visitor,$kind,$post_id,$day));
}
add_action('wp_enqueue_scripts',function(){
 if(!aurum_analytics_enabled() || current_user_can('edit_posts') || is_preview())return;
 wp_enqueue_script('aurum-measured-analytics',AURUM_VIDEO_CORE_URL.'assets/analytics.js',array(),AURUM_VIDEO_CORE_VERSION,true);
 $post_id=is_singular()?get_queried_object_id():0;
 if($post_id && (!get_post_meta($post_id,'aurum_movie_id',true) && get_post_type($post_id)!=='video'))$post_id=0;
 wp_localize_script('aurum-measured-analytics','AurumMeasuredAnalytics',array('endpoint'=>rest_url('aurum-analytics/v1/event'),'postId'=>$post_id));
});
function aurum_analytics_event($request) {
 if(!aurum_analytics_enabled())return new WP_Error('disabled','Analytics disabled',array('status'=>503));
 $origin=$request->get_header('origin');$home=wp_parse_url(home_url());$parts=wp_parse_url($origin);
 if(!$parts || strtolower($parts['host']??'')!==strtolower($home['host']??'') || ($parts['scheme']??'')!==($home['scheme']??'') || ($parts['port']??null)!==($home['port']??null))return new WP_Error('origin','Invalid origin',array('status'=>403));
 if(current_user_can('edit_posts') || aurum_analytics_bot())return rest_ensure_response(array('accepted'=>false));
 $data=$request->get_json_params();$kind=$data['kind']??'';$post_id=absint($data['postId']??0);
 if(!in_array($kind,array('visitor','view'),true))return new WP_Error('kind','Invalid event',array('status'=>422));
 $visitor=aurum_analytics_visitor($data['visitor']??'');
 if(!$visitor)return new WP_Error('visitor','Invalid visitor',array('status'=>422));
 if($kind==='view' && (!$post_id || get_post_status($post_id)!=='publish' || post_password_required($post_id) || (!get_post_meta($post_id,'aurum_movie_id',true)&&get_post_type($post_id)!=='video')))return new WP_Error('post','Invalid video',array('status'=>422));
 $rate='aa_'.hash_hmac('sha256',($_SERVER['REMOTE_ADDR']??'').':'.gmdate('YmdH'),wp_salt());
 $n=(int)get_transient($rate);if($n>=300)return new WP_Error('rate','Too many events',array('status'=>429));set_transient($rate,$n+1,HOUR_IN_SECONDS);
 if(aurum_analytics_record($kind,$kind==='visitor'?0:$post_id,$visitor)===false)return new WP_Error('storage','Could not record event',array('status'=>500));
 return rest_ensure_response(array('accepted'=>true));
}
function aurum_analytics_snapshot() {
 global $wpdb;
 $table=$wpdb->prefix.'aurum_measured_events';$from=gmdate('Y-m-d',strtotime('-27 days'));$to=gmdate('Y-m-d');
 $count=function($kind)use($wpdb,$table,$from){return (int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $table WHERE day >= %s AND kind=%s",$from,$kind));};
 $top=function($kind)use($wpdb,$table,$from){$rows=$wpdb->get_results($wpdb->prepare("SELECT post_id,COUNT(*) AS total FROM $table WHERE day >= %s AND kind=%s GROUP BY post_id ORDER BY total DESC,post_id ASC LIMIT 5",$from,$kind));return array_map(function($r){return array('postId'=>(int)$r->post_id,'title'=>wp_strip_all_tags(get_the_title($r->post_id))?:'Video #'.$r->post_id,'count'=>(int)$r->total);},$rows);};
 $wpdb->query($wpdb->prepare("DELETE FROM $table WHERE day < %s LIMIT 5000",gmdate('Y-m-d',strtotime('-90 days'))));
 $data=array('version'=>1,'from'=>$from,'to'=>$to,'startedAt'=>get_option('aurum_analytics_started'),'visitors'=>(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(DISTINCT visitor) FROM $table WHERE day >= %s AND kind='visitor'",$from)), 'views'=>$count('view'),'likes'=>$count('like'),'topViews'=>$top('view'),'topLikes'=>$top('like'),'publishedVideos'=>(int)$wpdb->get_var("SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->posts} p LEFT JOIN {$wpdb->postmeta} m ON m.post_id=p.ID AND m.meta_key='aurum_movie_id' WHERE p.post_status='publish' AND (p.post_type='video' OR (m.meta_value IS NOT NULL AND m.meta_value<>''))"),'nativePlayer'=>true,'iframeTracking'=>false,'likeAdapter'=>has_action('wp_ajax_sevenls_vp_like_video')!==false || has_action('wp_ajax_post-like')!==false || function_exists('aurum_get_reaction_counts'));
 $response=rest_ensure_response($data);$response->header('Cache-Control','private, no-store');return $response;
}
add_action('rest_api_init',function(){
 register_rest_route('aurum-analytics/v1','/event',array('methods'=>'POST','permission_callback'=>'__return_true','callback'=>'aurum_analytics_event'));
 register_rest_route('aurum-analytics/v1','/snapshot',array('methods'=>'GET','permission_callback'=>function(){return current_user_can('manage_options');},'callback'=>'aurum_analytics_snapshot'));
});
// Only confirmed increases made during a known visitor like request qualify.
// Cron boosts, CSV imports, and admin edits never enter this adapter.
function aurum_analytics_observe_like($post_id,$key) {
 if(!$post_id || get_post_status($post_id)!=='publish' || current_user_can('edit_posts') || (!get_post_meta($post_id,'aurum_movie_id',true) && get_post_type($post_id)!=='video'))return;
 $visitor=aurum_analytics_visitor();if(!$visitor)return;
 $before=(int)get_post_meta($post_id,$key,true);
 $record=function($meta_id,$object_id,$meta_key,$value)use($post_id,$key,$before,$visitor){
 if((int)$object_id===$post_id && $meta_key===$key && (int)$value>$before)aurum_analytics_record('like',$post_id,$visitor);
 };
 add_action('updated_post_meta',$record,10,4);
 add_action('added_post_meta',$record,10,4);
}
add_action('init',function(){
 if(!wp_doing_ajax() || !aurum_analytics_enabled())return;
 $action=sanitize_key($_POST['action']??'');$post_id=absint($_POST['post_id']??$_POST['id']??0);
 if($action==='sevenls_vp_like_video')aurum_analytics_observe_like($post_id,'_sevenls_vp_like_count');
 if($action==='post-like' && ($_POST['post_like']??'')==='like')aurum_analytics_observe_like($post_id,'likes_count');

},99);
add_filter('rest_request_before_callbacks',function($response,$handler,$request){
 if($request->get_method()==='POST' && preg_match('#^/aurum/v1/posts/(\d+)/reaction$#',$request->get_route(),$m) && $request->get_param('type')==='like')aurum_analytics_observe_like((int)$m[1],'_aurum_wp_likes');
 return $response;
},10,3);
