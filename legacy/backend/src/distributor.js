'use strict';
/**
 * distributor.js — Distribution Engine
 * รับ movieId + รายชื่อ siteIds ที่แอดมินติ๊กเลือก
 * แล้วยิงไปสร้างโพสต์บนทุกเว็บ "พร้อมกัน" ด้วย Promise.allSettled
 * (เว็บไหน fail ไม่ทำให้เว็บอื่นพัง + บันทึกสถานะรายเว็บลง distributions)
 */
const { pool } = require('./db');
const { decrypt } = require('./crypto');
const { WordPressClient } = require('./wordpressClient');

/** รวมเนื้อหา + ฝัง video เป็น fallback กันลิงก์หาย หาก meta ไม่ถูกอ่าน */
function buildContent(movie) {
  let html = movie.content || movie.excerpt || '';
  if (movie.video_url) {
    html += `\n\n<!-- distributed-video -->\n` +
      `<div class="movie-video"><a href="${movie.video_url}" rel="nofollow">▶ ดูหนัง</a></div>`;
  }
  return html;
}

/** map ข้อมูลหนัง -> payload ของ WP สำหรับเว็บหนึ่งๆ */
async function buildPayload(client, movie, site) {
  const payload = {
    title: movie.title,
    content: buildContent(movie),
    excerpt: movie.excerpt || '',
    status: site.default_status || 'publish',
    // meta ต้องถูก register บน WP ด้วย show_in_rest=true (หรือใช้ ACF) จึงจะบันทึกได้
    meta: {
      video_url: movie.video_url || '',
      video_provider: movie.video_provider || '',
      ...(movie.extra_meta || {}),
    },
  };
  if (movie.slug) payload.slug = movie.slug;

  // featured image
  if (movie.thumbnail_url) {
    try {
      payload.featured_media = await client.uploadMediaFromUrl(movie.thumbnail_url);
    } catch (_) { /* รูปพังก็ยังโพสต์ต่อ */ }
  }

  // หมวดหมู่: หลัก (แม่) + ย่อย (ลูก) -> term id แบบ hierarchical
  const subs = Array.isArray(movie.categories) ? movie.categories : [];
  const mainCat = movie.main_category || (movie.extra_meta && movie.extra_meta.main_category) || '';
  if (mainCat || subs.length) {
    payload.categories = await client.resolveCategoryTree(site.category_rest_base, mainCat, subs);
  }
  const tags = Array.isArray(movie.tags) ? movie.tags : [];
  if (tags.length) payload.tags = await client.resolveTerms(site.tag_rest_base, tags);

  return payload;
}

/** กระจายไปเว็บเดียว + อัปเดตสถานะใน distributions */
async function distributeToSite(movie, site) {
  await pool.query(
    `INSERT INTO distributions (movie_id, site_id, status, attempts)
     VALUES ($1,$2,'processing',1)
     ON CONFLICT (movie_id, site_id)
     DO UPDATE SET status='processing', attempts=distributions.attempts+1, updated_at=now()`,
    [movie.id, site.id]
  );

  try {
    const credential = decrypt({
      ciphertext: site.credential_enc,
      iv: site.credential_iv,
      tag: site.credential_tag,
    });

    const client = new WordPressClient({
      baseUrl: site.base_url,
      authType: site.auth_type,
      username: site.wp_username,
      credential,
      postType: site.post_type,
      categoryRestBase: site.category_rest_base,
      tagRestBase: site.tag_rest_base,
    });

    const payload = await buildPayload(client, movie, site);
    const post = await client.createPost(payload);

    await pool.query(
      `UPDATE distributions
         SET status='success', remote_post_id=$3, remote_post_url=$4,
             error_message=NULL, distributed_at=now(), updated_at=now()
       WHERE movie_id=$1 AND site_id=$2`,
      [movie.id, site.id, post.id, post.link]
    );

    return { siteId: site.id, site: site.name, status: 'success', postId: post.id, url: post.link };
  } catch (err) {
    await pool.query(
      `UPDATE distributions
         SET status='failed', error_message=$3, updated_at=now()
       WHERE movie_id=$1 AND site_id=$2`,
      [movie.id, site.id, String(err.message).slice(0, 1000)]
    );
    return { siteId: site.id, site: site.name, status: 'failed', error: err.message };
  }
}

/**
 * จุดเรียกหลัก: กระจายหนังไปหลายเว็บพร้อมกัน
 * @param {number} movieId
 * @param {number[]} siteIds เว็บที่แอดมินติ๊กเลือก
 */
async function distributeMovie(movieId, siteIds) {
  const { rows: movies } = await pool.query('SELECT * FROM movies WHERE id=$1', [movieId]);
  const movie = movies[0];
  if (!movie) throw new Error('ไม่พบหนัง id นี้');

  const { rows: sites } = await pool.query(
    'SELECT * FROM target_sites WHERE id = ANY($1) AND is_active = true',
    [siteIds]
  );
  if (!sites.length) throw new Error('ไม่มีเว็บปลายทางที่ใช้งานได้');

  await pool.query(`UPDATE movies SET status='distributing', updated_at=now() WHERE id=$1`, [movieId]);

  // ★ ยิงทุกเว็บพร้อมกัน
  const settled = await Promise.allSettled(sites.map((s) => distributeToSite(movie, s)));
  const results = settled.map((r) =>
    r.status === 'fulfilled' ? r.value : { status: 'failed', error: r.reason?.message }
  );

  const okCount = results.filter((r) => r.status === 'success').length;
  const finalStatus = okCount === 0 ? 'failed' : okCount === results.length ? 'done' : 'partial';
  await pool.query(`UPDATE movies SET status=$2, updated_at=now() WHERE id=$1`, [movieId, finalStatus]);

  return { movieId, status: finalStatus, summary: { total: results.length, success: okCount }, results };
}

module.exports = { distributeMovie, distributeToSite };
