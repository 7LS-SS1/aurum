'use strict';
/**
 * uploads.js — ออก "ใบอนุญาตอัปโหลด" ให้เบราว์เซอร์อัปไฟล์วิดีโอ
 *              ตรงสู่ Cloud Storage โดยไม่ผ่าน Node (ไฟล์ใหญ่ห้าม proxy)
 *
 *   POST /api/uploads/presign  { provider, filename, contentType, size }
 *
 * คืนค่า 1 ใน 2 รูปแบบ:
 *   S3   -> { strategy:'put', uploadUrl, publicUrl, method, headers }   เบราว์เซอร์ PUT ตรง
 *   Bunny-> { strategy:'tus', uploadUrl, tus:{...}, publicUrl }         เบราว์เซอร์ใช้ tus-js-client
 *
 * กุญแจลับ (AWS keys / Bunny API key) อยู่ที่ server เท่านั้น ไม่หลุดไป client
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

/* ---------- AWS S3: presigned PUT ---------- */
// ต้องลง: npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
async function presignS3({ filename, contentType }) {
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

  const s3 = new S3Client({ region: process.env.AWS_REGION });
  const safe = filename.replace(/[^\w.\-]/g, '_');
  const key = `videos/${Date.now()}-${safe}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 3600 }
  );

  // ถ้าใช้ CloudFront ให้เปลี่ยน publicUrl เป็นโดเมน CDN
  const publicUrl = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  return { strategy: 'put', method: 'PUT', uploadUrl, publicUrl, headers: { 'Content-Type': contentType } };
}

/* ---------- Bunny.net Stream: create video + signed TUS ---------- */
async function presignBunny({ filename }) {
  const lib = process.env.BUNNY_LIBRARY_ID;
  const apiKey = process.env.BUNNY_API_KEY;

  // 1) สร้าง video object ฝั่ง server (ใช้ secret key)
  const created = await fetch(`https://video.bunnycdn.com/library/${lib}/videos`, {
    method: 'POST',
    headers: { AccessKey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: filename }),
  }).then((r) => r.json());

  const videoId = created.guid;

  // 2) สร้าง presigned signature สำหรับ TUS (ปลอดภัยสำหรับเบราว์เซอร์)
  //    signature = sha256( library_id + api_key + expire + video_id )
  const expire = Math.floor(Date.now() / 1000) + 3600;
  const signature = crypto
    .createHash('sha256')
    .update(lib + apiKey + expire + videoId)
    .digest('hex');

  return {
    strategy: 'tus',
    uploadUrl: 'https://video.bunnycdn.com/tusupload',
    tus: {
      AuthorizationSignature: signature,
      AuthorizationExpire: String(expire),
      LibraryId: String(lib),
      VideoId: videoId,
    },
    // playback URL (HLS) — ใช้เป็น video_url ของหนัง
    publicUrl: `https://${process.env.BUNNY_CDN_HOST}/${videoId}/playlist.m3u8`,
  };
}

router.post('/presign', async (req, res) => {
  try {
    const { provider, filename, contentType } = req.body;
    if (!filename) return res.status(400).json({ error: 'ต้องมี filename' });

    let result;
    if (provider === 's3') result = await presignS3({ filename, contentType });
    else if (provider === 'bunny') result = await presignBunny({ filename });
    else return res.status(400).json({ error: 'provider ต้องเป็น s3 หรือ bunny' });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
