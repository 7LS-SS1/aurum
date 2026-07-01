-- ============================================================
--  Multi-Site WP Content Distribution — Database Schema
--  Dialect: PostgreSQL (MySQL notes inline)
-- ============================================================

-- 1) เนื้อหาหนัง (master content) — อัปโหลดครั้งเดียว เก็บที่นี่ที่เดียว
CREATE TABLE movies (
    id              BIGSERIAL PRIMARY KEY,
    title           VARCHAR(500) NOT NULL,            -- ชื่อเรื่อง
    slug            VARCHAR(500),                     -- ถ้าเว้นว่าง WP จะ gen ให้เอง
    excerpt         TEXT,                             -- เรื่องย่อ (สั้น)
    content         TEXT,                             -- เนื้อหา/รายละเอียดเต็ม (HTML)
    main_category   VARCHAR(255),                     -- หมวดหมู่หลัก (= category แม่บน WP) เช่น หนัง/คลิป/AV
    categories      JSONB    DEFAULT '[]',            -- หมวดหมู่ย่อย (= category ลูก) เช่น ["ดราม่า","ไซไฟ"]
    tags            JSONB    DEFAULT '[]',            -- ["2024","HD"]
    thumbnail_url   TEXT,                             -- URL รูปหน้าปก (อยู่บน S3/Bunny แล้ว)
    video_url       TEXT,                             -- ลิงก์วิดีโอ หรือ URL ไฟล์บน cloud
    video_provider  VARCHAR(50),                      -- 's3' | 'bunny' | 'external'
    extra_meta      JSONB    DEFAULT '{}',            -- {"year":2024,"duration":"120","quality":"1080p"}
    status          VARCHAR(20) DEFAULT 'draft',      -- draft | distributing | done | partial | failed
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 2) เว็บ WordPress ปลายทาง + กุญแจความปลอดภัย (เข้ารหัสไว้)
CREATE TABLE target_sites (
    id                 BIGSERIAL PRIMARY KEY,
    name               VARCHAR(255) NOT NULL,         -- ชื่อเรียกเว็บ (โชว์ใน dashboard)
    base_url           TEXT NOT NULL,                 -- https://site1.com  (ไม่ต้องมี / ปิดท้าย)
    auth_type          VARCHAR(20) DEFAULT 'app_password', -- 'app_password' | 'jwt'
    wp_username        VARCHAR(255),                  -- ใช้กับ app_password (Basic Auth)
    -- --- กุญแจถูกเข้ารหัสด้วย AES-256-GCM ห้ามเก็บ plaintext ---
    credential_enc     TEXT NOT NULL,                 -- ciphertext (base64)
    credential_iv      VARCHAR(32) NOT NULL,          -- IV (hex)
    credential_tag     VARCHAR(32) NOT NULL,          -- auth tag (hex)
    -- --- ปลายทางจะลงเป็น post type / taxonomy อะไร ---
    post_type          VARCHAR(100) DEFAULT 'posts',  -- 'posts' หรือ rest_base ของ CPT เช่น 'movies'
    category_rest_base VARCHAR(100) DEFAULT 'categories',
    tag_rest_base      VARCHAR(100) DEFAULT 'tags',
    default_status     VARCHAR(20)  DEFAULT 'publish',-- publish | draft | pending
    is_active          BOOLEAN DEFAULT true,
    health_status      VARCHAR(20) DEFAULT 'unknown', -- ok | error | unknown
    last_checked_at    TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT now()
);

-- 3) สถานะการกระจาย รายหนัง x รายเว็บ (junction + status tracking)
--    ใช้ตารางนี้ตอบโจทย์ "ดึง ID/URL ที่สร้างสำเร็จกลับมาแสดง" และ "retry เฉพาะเว็บที่ fail"
CREATE TABLE distributions (
    id              BIGSERIAL PRIMARY KEY,
    movie_id        BIGINT NOT NULL REFERENCES movies(id)       ON DELETE CASCADE,
    site_id         BIGINT NOT NULL REFERENCES target_sites(id) ON DELETE CASCADE,
    status          VARCHAR(20) DEFAULT 'pending', -- pending | processing | success | failed
    remote_post_id  BIGINT,                        -- WP post ID ที่ได้กลับมา
    remote_post_url TEXT,                           -- WP post URL ที่ได้กลับมา
    error_message   TEXT,
    attempts        INT DEFAULT 0,
    distributed_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE (movie_id, site_id)                      -- idempotent: 1 หนัง ต่อ 1 เว็บ = 1 record
);

CREATE INDEX idx_dist_movie  ON distributions(movie_id);
CREATE INDEX idx_dist_site   ON distributions(site_id);
CREATE INDEX idx_dist_status ON distributions(status);

-- ============================================================
--  หมายเหตุสำหรับ MySQL:
--    BIGSERIAL        -> BIGINT AUTO_INCREMENT
--    JSONB            -> JSON
--    TIMESTAMPTZ      -> DATETIME / TIMESTAMP
--    BOOLEAN          -> TINYINT(1)
-- ============================================================
