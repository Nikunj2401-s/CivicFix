import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { sign, requireAuth, requireAdmin } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

const r = Router();
const shape = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at,
  office: u.office_lat != null && u.office_lng != null
    ? { latitude: u.office_lat, longitude: u.office_lng, label: u.office_label || 'Ward office' }
    : null
});

r.post('/register', authLimiter, async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are all required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Use a password of at least 6 characters.' });

  const exists = await q('SELECT 1 FROM users WHERE email = $1', [email]);
  if (exists.rowCount) return res.status(409).json({ error: 'That email is already registered. Sign in instead.' });

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await q(
    'INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING *',
    [name, email, hash]
  );
  res.status(201).json({ token: sign(rows[0]), user: shape(rows[0]) });
});

r.post('/login', authLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const { rows } = await q('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(req.body.password || '', user.password_hash));
  if (!ok) return res.status(401).json({ error: 'Email or password is wrong.' });
  res.json({ token: sign(user), user: shape(user) });
});

r.get('/me', requireAuth, async (req, res) => {
  const { rows } = await q('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Account not found.' });
  const stats = await q(
    `SELECT
       (SELECT count(*) FROM issues WHERE user_id = $1)                         AS reported,
       (SELECT count(*) FROM issues WHERE user_id = $1 AND status = 'resolved') AS resolved,
       (SELECT count(*) FROM issue_upvotes WHERE user_id = $1)                  AS backed,
       (SELECT coalesce(sum(upvotes),0) FROM issues WHERE user_id = $1)         AS support_received`,
    [req.user.id]
  );
  res.json({ user: shape(rows[0]), stats: stats.rows[0] });
});

r.patch('/me', requireAuth, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name cannot be empty.' });
  const { rows } = await q('UPDATE users SET name = $1 WHERE id = $2 RETURNING *', [name, req.user.id]);
  res.json({ user: shape(rows[0]) });
});

/* where the crew starts from — admin only */
r.patch('/office', requireAuth, requireAdmin, async (req, res) => {
  const lat = Number(req.body.latitude), lng = Number(req.body.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Give the office a latitude and longitude.' });
  }
  const label = (req.body.label || 'Ward office').trim().slice(0, 80);
  const { rows } = await q(
    'UPDATE users SET office_lat = $1, office_lng = $2, office_label = $3 WHERE id = $4 RETURNING *',
    [lat, lng, label, req.user.id]
  );
  res.json({ user: shape(rows[0]) });
});

export default r;
