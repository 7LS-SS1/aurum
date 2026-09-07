<?php
/** Local WordPress integration only; deletes its own randomly identified fixtures. */
if ( 'cli' !== PHP_SAPI || '1' !== getenv( 'AURUM_ACTOR_TEST_ALLOW_WRITE' ) ) { exit( "Set AURUM_ACTOR_TEST_ALLOW_WRITE=1 for local tests.\n" ); }
require getenv( 'WP_LOAD_PATH' );
require_once dirname( __DIR__ ) . '/includes/actor-sync.php';
aurum_actor_sync_register();
$admins = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) );
if ( ! $admins ) { throw new RuntimeException( 'No local test administrator.' ); }
wp_set_current_user( (int) $admins[0] );
$external = 'test' . bin2hex( random_bytes( 12 ) );
$payload = array(
 'externalId' => $external, 'slug' => 'aurum-actor-' . $external, 'name' => 'นักแสดงทดสอบ',
 'bio' => 'ประวัติทดสอบ', 'profileImageUrl' => 'https://cdn.example.test/a.webp',
 'metadata' => array( 'age' => 25, 'heightCm' => null, 'weightKg' => null,
 'measurementBust' => null, 'measurementWaist' => null, 'measurementHip' => null ),
);
function actor_test_request( $method, $id, $payload = null ) {
 $req = new WP_REST_Request( $method, '/aurum-video-core/v1/actors/' . $id );
 if ( null !== $payload ) { $req->set_header( 'content-type', 'application/json' ); $req->set_body( wp_json_encode( $payload ) ); }
 return rest_do_request( $req );
}
function actor_test_expect( $value, $message ) { if ( ! $value ) { throw new RuntimeException( $message ); } }
$id = 0;
$attachments_before = (int) wp_count_posts( 'attachment' )->inherit;
try {
 $read = actor_test_request( 'GET', $external );
 actor_test_expect( 200 === $read->get_status() && null === $read->get_data(), 'missing read' );
 $result = actor_test_request( 'PUT', $external, $payload );
 actor_test_expect( ! $result->is_error(), 'create: ' . wp_json_encode( $result->get_data() ) );
 $data = $result->get_data(); $id = (int) $data['remoteId'];
 actor_test_expect( 'created' === $data['status'], 'created result' );
 for ( $i = 0; $i < 3; $i++ ) {
  $data = actor_test_request( 'PUT', $external, $payload )->get_data();
  actor_test_expect( $id === $data['remoteId'] && 'skipped' === $data['status'], 'repeat keeps ID' );
 }
 $payload['name'] = 'ชื่อใหม่';
 $data = actor_test_request( 'PUT', $external, $payload )->get_data();
 actor_test_expect( $id === $data['remoteId'] && 'updated' === $data['status'], 'rename keeps ID' );
 $payload['bio'] = '<script>alert(1)</script> ประวัติ';
 $data = actor_test_request( 'PUT', $external, $payload )->get_data();
 actor_test_expect( $payload['bio'] === $data['payload']['bio'] && false === strpos( get_post( $id )->post_content, '<script>' ), 'bio displayed as plain text' );
 $payload['profileImageUrl'] = 'https://cdn.example.test/b.webp';
 $data = actor_test_request( 'PUT', $external, $payload )->get_data();
 actor_test_expect( 'image_updated' === $data['status'] && $id === $data['remoteId'], 'image replacement' );
 $payload['profileImageUrl'] = null;
 $data = actor_test_request( 'PUT', $external, $payload )->get_data();
 actor_test_expect( 'image_removed' === $data['status'] && null === $data['payload']['profileImageUrl'], 'image removal' );
 actor_test_expect( $attachments_before === (int) wp_count_posts( 'attachment' )->inherit, 'no duplicate attachments' );
 $invalid = $payload; $invalid['profileImageUrl'] = 'javascript:alert(1)';
 actor_test_expect( 422 === actor_test_request( 'PUT', $external, $invalid )->get_status(), 'invalid image rejected' );
 wp_set_current_user( 0 );
 actor_test_expect( 401 === actor_test_request( 'PUT', $external, $payload )->get_status(), 'anonymous denied' );
 wp_set_current_user( (int) $admins[0] );
 wp_trash_post( $id );
 actor_test_expect( 409 === actor_test_request( 'GET', $external )->get_status(), 'trashed actor cannot be skipped as success' );
 actor_test_expect( 409 === actor_test_request( 'PUT', $external, $payload )->get_status(), 'trashed actor not recreated' );
 echo "ACTOR_REST_INTEGRATION_OK: create, repeat, rename, replace, remove, no attachments, validation, permission, trash\n";
} finally {
 // Scope cleanup by the unique test identity, including creates with a lost response.
 $posts = get_posts( array( 'post_type' => 'aurum_actor', 'post_status' => array( 'publish', 'trash', 'draft' ), 'name' => 'aurum-actor-' . $external, 'numberposts' => -1 ) );
 foreach ( $posts as $post ) { wp_delete_post( $post->ID, true ); }
 if ( $id ) { wp_delete_post( $id, true ); }
}
