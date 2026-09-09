import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import authRoutes from './routes/auth.js';
import issueRoutes from './routes/issues.js';

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  console.error('Missing DATABASE_URL or JWT_SECRET. Copy .env.example to .env first.');
  process.exit(1);
}

const app = express();
const dir = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(dir, 'uploads')));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/issues', issueRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'That photo is over 8 MB.' });
  res.status(500).json({ error: err.message || 'Something went wrong on the server.' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`CivicFix API on http://localhost:${port}`));
