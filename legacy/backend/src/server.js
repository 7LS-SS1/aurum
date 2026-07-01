'use strict';
require('dotenv').config();
const express = require('express');
const apiRoutes = require('./routes/movies');
const uploadRoutes = require('./routes/uploads');

const app = express();
app.use(express.json({ limit: '2mb' }));

// CORS เปิดให้ frontend dashboard เรียก (ปรับ origin ตามจริงใน production)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', apiRoutes);
app.use('/api/uploads', uploadRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Distribution API running on :${PORT}`));
