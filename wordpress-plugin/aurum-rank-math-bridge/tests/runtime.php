<?php
// Local Docker integration check. Creates one temporary draft and deletes it in finally.
require '/var/www/html/wp-load.php';
if ( ! defined( 'RANK_MATH_VERSION' ) ) { throw new RuntimeException( 'Rank Math must already be active for this test.' ); }
if ( ! function_exists( 'aurum_rank_math_register' ) ) { require '/tmp/aurum-rank-math-bridge.php'; }
aurum_rank_math_register();
$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
if ( ! $admins ) { throw new RuntimeException( 'No local test administrator.' ); }
wp_set_current_user( (int) $admins[0] );
function check( $condition, $message ) {
    if ( ! $condition ) { throw new RuntimeException( $message ); }
    echo "PASS: $message\n";
}
$id = 0;
try {
    $cap = rest_do_request( new WP_REST_Request( 'GET', '/aurum-video-core/v1/seo-capabilities' ) );
    check( 200 === $cap->get_status() && in_array( 'posts', $cap->get_data()['postTypes'], true ), 'Rank Math REST capability ready' );
    $seo = array( 'rank_math_title' => 'อัปเดตของเล่นมาใหม่', 'rank_math_description' => 'รู้จักของเล่นมาใหม่ พร้อมรายละเอียดของเล่นในวิดีโอ', 'rank_math_focus_keyword' => 'ของเล่น, ของเล่นมาใหม่' );
    $request = new WP_REST_Request( 'POST', '/wp/v2/posts' );
    $request->set_body_params( array( 'title' => $seo['rank_math_title'], 'status' => 'draft', 'meta' => array_merge( $seo, array( 'aurum_movie_id' => 'aurum-seo-test-' . uniqid(), 'aurum_video_url' => 'https://example.test/video.mp4' ) ) ) );
    $response = rest_do_request( $request );
    $data = $response->get_data();
    $id = isset( $data['id'] ) ? (int) $data['id'] : 0;
    check( 201 === $response->get_status() && $id > 0, 'create video and SEO together through WordPress REST' );
    $read = new WP_REST_Request( 'GET', '/wp/v2/posts/' . $id );
    $read->set_param( 'context', 'edit' );
    $readback = rest_do_request( $read )->get_data();
    foreach ( $seo as $key => $value ) { check( $readback['meta'][$key] === $value, 'REST read-back ' . $key ); }
    check( \RankMath\Post::get_meta( 'description', $id ) === $seo['rank_math_description'], 'Rank Math reads the imported description' );
    check( get_post_meta( $id, 'aurum_video_url', true ) === 'https://example.test/video.mp4', 'video metadata persisted in same import' );
    $update = new WP_REST_Request( 'POST', '/wp/v2/posts/' . $id );
    $update->set_body_params( array( 'meta' => array( 'aurum_video_url' => 'https://example.test/video-updated.mp4' ) ) );
    check( 200 === rest_do_request( $update )->get_status(), 'video-only refresh accepted' );
    foreach ( $seo as $key => $value ) { check( get_post_meta( $id, $key, true ) === $value, 'video-only preserves ' . $key ); }
    wp_set_current_user( 0 );
    check( rest_do_request( $update )->get_status() >= 400, 'anonymous SEO/video write denied' );
    check( rest_do_request( new WP_REST_Request( 'GET', '/aurum-video-core/v1/seo-capabilities' ) )->get_status() >= 400, 'anonymous capability read denied' );
} finally {
    wp_set_current_user( (int) $admins[0] );
    if ( $id ) { wp_delete_post( $id, true ); echo "Temporary draft removed.\n"; }
}
