import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { authRequired } from '../middleware/auth.js';

let uploadsDir = null;

export function setUploadsDir(dir) {
  uploadsDir = dir;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function getUploadsDir() {
  return uploadsDir || path.join(process.cwd(), 'data', 'uploads');
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, getUploadsDir()),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    cb(null, `${cleanName}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const router = Router();

// Generic upload endpoint for any file/image (brand logo, product image, etc.)
router.post('/', authRequired, upload.any(), (req, res) => {
  const file = req.files?.[0] || req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${file.filename}`;
  res.json({ ok: true, url, filename: file.filename });
});

export default router;
