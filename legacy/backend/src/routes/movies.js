'use strict';
/**
 * routes.js — REST endpoints ให้ Admin Dashboard (frontend) เรียกใช้
 *
 *  POST  /api/sites                 ลงทะเบียนเว็บ WP ปลายทาง (เข้ารหัสกุญแจให้อัตโนมัติ)
 *  GET   /api/sites                 รายชื่อเว็บ (สำหรับ checkbox เลือกปลายทาง)
 *  POST  /api/movies                บันทึกข้อมูลหนัง (master)
 *  POST  /api/movies/:id/distribute "บันทึกและกระจาย" -> คืน id/url ของทุกเว็บ
 *  GET   /api/movies/:id/status     ดูสถานะการกระจายรายเว็บ
 */
const express = require('express');
const { pool } = require('./db');
const { encrypt } = require('./crypto');
const { distributeMovie } = require('./distributor');

const router = express.Router();

// ---- ลงทะเบียนเว็บปลายทาง ----
router.post('/sites', async (req, res) => {
  try {
    const {
      name, base_url, auth_type = 'app_password', wp_username, credential,
      post_type = 'posts', category_rest_base = 'categories', tag_rest_base = 'tags',
      default_status = 'publish',
    } = req.body;

    if (!name || !base_url || !credential) {
      return res.status(400).json({ error: 'ต้องมี name, base_url, credential' });
    }
    const enc = encrypt(credential); // <- กุญแจถูกเข้ารหัสก่อนลง DB

    const { rows } = await pool.query(
      `INSERT INTO target_sites
        (name, base_url, auth_type, wp_username, credential_enc, credential_iv, credential_tag,
         post_type, category_rest_base, tag_rest_base, default_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, name, base_url, post_type, is_active`,
      [name, base_url, auth_type, wp_username, enc.ciphertext, enc.iv, enc.tag,
       post_type, category_rest_base, tag_rest_base, default_status]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- รายชื่อเว็บ (ไม่ส่งกุญแจกลับ) ----
router.get('/sites', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, base_url, post_type, default_status, is_active, health_status
       FROM target_sites ORDER BY id`
  );
  res.json(rows);
});

// ---- บันทึกหนัง ----
router.post('/movies', async (req, res) => {
  try {
    const {
      title, slug, excerpt, content, main_category, categories = [], tags = [],
      thumbnail_url, video_url, video_provider, extra_meta = {},
    } = req.body;
    if (!title) return res.status(400).json({ error: 'ต้องมี title' });

    const { rows } = await pool.query(
      `INSERT INTO movies
        (title, slug, excerpt, content, main_category, categories, tags,
         thumbnail_url, video_url, video_provider, extra_meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [title, slug, excerpt, content, main_category, JSON.stringify(categories), JSON.stringify(tags),
       thumbnail_url, video_url, video_provider, JSON.stringify(extra_meta)]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- บันทึกและกระจาย ----
router.post('/movies/:id/distribute', async (req, res) => {
  try {
    const movieId = Number(req.params.id);
    const siteIds = req.body.siteIds; // [1,2,5]
    if (!Array.isArray(siteIds) || !siteIds.length) {
      return res.status(400).json({ error: 'ต้องเลือกเว็บปลายทางอย่างน้อย 1 เว็บ (siteIds)' });
    }
    const result = await distributeMovie(movieId, siteIds);
    res.json(result); // <- frontend เอา result.results[].url ไปแสดงได้เลย
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- ดูสถานะรายเว็บ (และ retry: เรียก /distribute ซ้ำเฉพาะ siteId ที่ failed) ----
router.get('/movies/:id/status', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.site_id, s.name AS site_name, d.status,
            d.remote_post_id, d.remote_post_url, d.error_message, d.attempts, d.distributed_at
       FROM distributions d JOIN target_sites s ON s.id = d.site_id
      WHERE d.movie_id = $1 ORDER BY d.site_id`,
    [Number(req.params.id)]
  );
  res.json(rows);
});

module.exports = router;
