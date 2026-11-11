import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { statsRouter } from './routes/stats.js';
import { cacheMiddleware } from './lib/cache.js';
import { runCollection } from './collector/collect.js';
import { runMaintenance } from './maintenance.js';

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function createApp({ pool, config, collect = (p) => runCollection(p), maintain = (p) => runMaintenance(p) }) {
  const app = express();
  app.set('trust proxy', 1); // Render berada di belakang proksi
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '10kb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

  app.get('/api/health', async (_req, res) => {
    try { await pool.query('SELECT 1'); res.json({ ok: true }); }
    catch { res.status(503).json({ ok: false }); }
  });

  // Dipanggil oleh penjadual luaran (cron-job.org / GitHub Actions) setiap 5 minit.
  app.post('/api/collect', async (req, res, next) => {
    try {
      if (!config.collectorSecret) return res.status(503).json({ error: 'COLLECTOR_SECRET belum ditetapkan' });
      const given = req.get('x-collector-secret');
      if (!given || !safeEqual(given, config.collectorSecret)) return res.status(401).json({ error: 'Tidak dibenarkan' });
      const result = await collect(pool);
      // 200 walaupun feed gagal: penjadual tidak perlu cuba semula; kegagalan sudah dilog.
      res.status(result.ok || result.skipped ? 200 : 502).json(result);
    } catch (e) { next(e); }
  });

  // Ringkasan setiap jam + retensi 30 hari. Dipanggil sekali sehari oleh penjadual luaran.
  app.post('/api/maintenance', async (req, res, next) => {
    try {
      if (!config.collectorSecret) return res.status(503).json({ error: 'COLLECTOR_SECRET belum ditetapkan' });
      const given = req.get('x-collector-secret');
      if (!given || !safeEqual(given, config.collectorSecret)) return res.status(401).json({ error: 'Tidak dibenarkan' });
      res.json(await maintain(pool));
    } catch (e) { next(e); }
  });
  app.use('/api/stats', cacheMiddleware(config.cacheTtlMs), statsRouter(pool));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Tidak ditemui' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.status === 400) return res.status(400).json({ error: err.message, issues: err.issues });
    console.error(err);
    res.status(500).json({ error: 'Ralat pelayan' });
  });
  return app;
}
