'use strict';
/**
 * crypto.js — เข้ารหัส/ถอดรหัสกุญแจของ WordPress แต่ละเว็บ
 * ใช้ AES-256-GCM (มี auth tag ป้องกันการแก้ไข ciphertext)
 *
 * สร้าง ENCRYPTION_KEY (32 byte / 64 hex) ครั้งเดียวแล้วเก็บใน .env / secret manager:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * !! ถ้า key หาย = ถอดรหัส app password ทุกเว็บไม่ได้ ต้องตั้งใหม่ทั้งหมด !!
 */
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY ต้องเป็น hex 64 ตัว (32 byte)');
  }
  return Buffer.from(hex, 'hex');
}

/** @returns {{ciphertext:string, iv:string, tag:string}} */
function encrypt(plaintext) {
  const iv = crypto.randomBytes(12); // 96-bit nonce แนะนำสำหรับ GCM
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
  };
}

/** @param {{ciphertext:string, iv:string, tag:string}} payload */
function decrypt({ ciphertext, iv, tag }) {
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

module.exports = { encrypt, decrypt };
