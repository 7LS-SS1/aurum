'use strict';
/**
 * wordpressClient.js — ตัวเชื่อมต่อ WordPress REST API หนึ่งเว็บ
 *
 * รองรับ Auth 2 แบบ:
 *   - Application Passwords -> Basic base64(user:app_password)   (แนะนำ, ไม่ต้องลงปลั๊กอิน)
 *   - JWT                   -> Bearer <token>                    (ต้องลงปลั๊กอิน JWT บน WP)
 *
 * ใช้ global fetch / FormData ของ Node 18+ (ไม่ต้องลง axios)
 */
class WordPressClient {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl   เช่น https://site1.com
   * @param {'app_password'|'jwt'} opts.authType
   * @param {string} [opts.username]
   * @param {string} opts.credential  app password หรือ jwt token (ถอดรหัสแล้ว)
   * @param {string} [opts.postType='posts']
   * @param {string} [opts.categoryRestBase='categories']
   * @param {string} [opts.tagRestBase='tags']
   */
  constructor(opts) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.authType = opts.authType || 'app_password';
    this.username = opts.username;
    this.credential = opts.credential;
    this.postType = opts.postType || 'posts';
    this.categoryRestBase = opts.categoryRestBase || 'categories';
    this.tagRestBase = opts.tagRestBase || 'tags';
  }

  get api() {
    return `${this.baseUrl}/wp-json/wp/v2`;
  }

  authHeader() {
    if (this.authType === 'jwt') return `Bearer ${this.credential}`;
    const token = Buffer.from(`${this.username}:${this.credential}`).toString('base64');
    return `Basic ${token}`;
  }

  async _json(url, init = {}) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: this.authHeader(), ...(init.headers || {}) },
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = data?.message || `HTTP ${res.status} ${res.statusText}`;
      const err = new Error(`[${this.baseUrl}] ${msg}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  /** เช็คว่าเว็บ + กุญแจใช้งานได้ไหม (สำหรับ health check) */
  async ping() {
    // /users/me จะ 401 ถ้า auth ผิด
    return this._json(`${this.api}/users/me?context=edit`);
  }

  /**
   * WordPress รับ category/tag เป็น "ID ของ term" ไม่ใช่ชื่อ
   * ค้นหาชื่อ -> ถ้าเจอใช้ ID เดิม / ถ้าไม่เจอสร้างใหม่
   * @param {string} restBase 'categories' | 'tags' | rest_base ของ custom taxonomy
   * @param {string} name
   * @param {number} [parentId=0] term แม่ (ใช้กับ category แบบ hierarchical: หมวดหมู่หลัก->ย่อย)
   * @returns {Promise<number>} term id
   */
  async resolveTerm(restBase, name, parentId = 0) {
    const found = await this._json(
      `${this.api}/${restBase}?search=${encodeURIComponent(name)}&per_page=100`
    );
    if (Array.isArray(found)) {
      const exact = found.find(
        (t) => t.name?.toLowerCase() === name.toLowerCase() && (parentId ? t.parent === parentId : true)
      );
      if (exact) return exact.id;
    }
    const body = { name };
    if (parentId) body.parent = parentId;
    const created = await this._json(`${this.api}/${restBase}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return created.id;
  }

  /**
   * สร้าง/หา หมวดหมู่หลัก (แม่) + หมวดหมู่ย่อย (ลูก) แล้วคืน term id ทั้งหมด
   * @returns {Promise<number[]>} [parentId, ...childIds]
   */
  async resolveCategoryTree(restBase, mainCategory, subCategories = []) {
    const ids = [];
    let parentId = 0;
    if (mainCategory) {
      parentId = await this.resolveTerm(restBase, mainCategory, 0);
      ids.push(parentId);
    }
    for (const sub of subCategories) {
      if (!sub) continue;
      try { ids.push(await this.resolveTerm(restBase, sub, parentId)); }
      catch (_) { /* ข้าม term ที่สร้างไม่ได้ */ }
    }
    return [...new Set(ids)];
  }

  async resolveTerms(restBase, names = []) {
    const ids = [];
    for (const name of names) {
      if (!name) continue;
      try { ids.push(await this.resolveTerm(restBase, name)); }
      catch (e) { /* ข้าม term ที่สร้างไม่ได้ ไม่ให้ทั้งโพสต์ fail */ }
    }
    return ids;
  }

  /**
   * อัปโหลดรูปหน้าปกจาก URL (เช่นบน Bunny/S3) ขึ้น Media Library ของเว็บปลายทาง
   * แล้วคืน media id เพื่อใช้เป็น featured_media
   * @returns {Promise<number>}
   */
  async uploadMediaFromUrl(imageUrl) {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`โหลดรูปไม่สำเร็จ ${imgRes.status}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const filename =
      (imageUrl.split('/').pop() || 'thumbnail').split('?')[0] || 'thumbnail.jpg';

    const media = await this._json(`${this.api}/media`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: buffer,
    });
    return media.id;
  }

  /**
   * สร้างโพสต์ใหม่บนเว็บปลายทาง
   * @param {object} payload  รูปแบบตาม WP REST (title, content, status, categories, tags, featured_media, meta...)
   * @returns {Promise<{id:number, link:string, status:string}>}
   */
  async createPost(payload) {
    return this._json(`${this.api}/${this.postType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
}

module.exports = { WordPressClient };
