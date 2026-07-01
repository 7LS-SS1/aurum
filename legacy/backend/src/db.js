'use strict';
/** db.js — PostgreSQL connection pool */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl: { rejectUnauthorized: false }, // เปิดถ้า DB อยู่บน managed host
  max: 10,
});

module.exports = { pool };
