import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { sign, requireAuth } from '../middleware/auth.js';

const r = Router();
const shape = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at });

r.post('/register', async (req, res) => {
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

r.post('/login', async (req, res) => {
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

export default r;
