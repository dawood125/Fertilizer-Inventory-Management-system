import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDatabase } from './database/connection.js';
import authRoutes from './routes/auth.js';
import settingsRoutes, { setUploadsDir } from './routes/settings.js';
import uploadRoutes, { setUploadsDir as setUploadRoutesDir } from './routes/upload.js';
import { createResourceRouter } from './routes/resources.js';
import { authRequired } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = 3847;

/**
 * Start Express API server.
 * @param {{ userDataPath?: string, port?: number }} options
 * @returns {Promise<{ app: import('express').Express, port: number, server: import('http').Server }>}
 */
export async function startServer(options = {}) {
  const userDataPath = options.userDataPath || path.join(process.cwd(), 'data');
  const port = options.port || Number(process.env.PORT) || DEFAULT_PORT;

  if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
  const uploadsDir = path.join(userDataPath, 'uploads');
  setUploadsDir(uploadsDir);
  setUploadRoutesDir(uploadsDir);

  await initDatabase(userDataPath);

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '10mb' }));

  app.use((req, _res, next) => {
    const start = Date.now();
    _res.on('finish', () => {
      console.log(`[api] ${req.method} ${req.originalUrl} ${_res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, offline: true, time: new Date().toISOString() });
  });

  app.use('/uploads', express.static(uploadsDir));
  app.use('/api/upload', uploadRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/data', createResourceRouter());

  // Placeholder for Phase 2 feature routes — keep authenticated shell ready
  app.get('/api/ready', authRequired, (req, res) => {
    res.json({ ready: true, user: req.user });
  });

  const distDir = path.join(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.originalUrl.startsWith('/api') && !req.originalUrl.startsWith('/uploads')) {
        return res.sendFile(path.join(distDir, 'index.html'));
      }
      next();
    });
  }

  app.use((err, _req, res, _next) => {
    console.error('[api] Error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  const host = options.host || process.env.HOST || '0.0.0.0';
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.on('error', reject);
  });

  console.log(`[api] Server listening on http://${host}:${port}`);
  return { app, port, server };
}

// Auto-start server in standalone Node / PM2 environments (Electron starts it programmatically)
if (!process.versions.electron) {
  startServer().catch((err) => {
    console.error('[server] Failed to start server:', err);
    process.exit(1);
  });
}

export default startServer;
