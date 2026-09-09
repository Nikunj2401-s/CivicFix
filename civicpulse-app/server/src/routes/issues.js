import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { q } from '../db.js';
import exifr from 'exifr';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { reportLimiter, voteLimiter } from '../middleware/rateLimit.js';
import { classifyLand } from '../lib/gis.js';

const r = Router();
const DUPE_RADIUS_M = 50;
const REQUIRE_GEOTAG = process.env.REQUIRE_GEOTAG !== 'false';
const REQUIRE_VIDEO  = process.env.REQUIRE_VIDEO  !== 'false';
const REQUIRE_PUBLIC_LAND = process.env.REQUIRE_PUBLIC_LAND !== 'false';
const MAX_EXIF_DRIFT_M = Number(process.env.MAX_EXIF_DRIFT_M || 150);
const CATEGORIES = ['pothole', 'garbage', 'water_leakage', 'broken_streetlight', 'road_damage'];
const STATUSES = ['pending', 'in_progress', 'resolved'];

/* ---------- photo upload ---------- */
const uploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 40 * 1024 * 1024 },   // videos need the headroom
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
    if (!ok) return cb(new Error('Upload a photo or a video.'));
    cb(null, true);
  }
});

/* one place that decides what an issue looks like over the wire */
const SELECT = `
  SELECT i.*, u.name AS reporter,
         EXISTS (SELECT 1 FROM issue_upvotes v WHERE v.issue_id = i.id AND v.user_id = $1) AS backed_by_me,
         (SELECT ver.verdict FROM issue_verifications ver
            WHERE ver.issue_id = i.id AND ver.user_id = $1) AS my_verdict
  FROM issues i JOIN users u ON u.id = i.user_id`;

/* ---------- duplicate detection ----------
   same category + within 50 m + not already resolved.
   A bounding box narrows the scan with the (category, latitude, longitude)
   index, then distance_m() does the exact great-circle check.            */
async function findNearby(userId, category, lat, lng) {
  const dLat = DUPE_RADIUS_M / 111320;
  const dLng = DUPE_RADIUS_M / (111320 * Math.cos((lat * Math.PI) / 180) || 1);
  const { rows } = await q(
    `${SELECT}
     WHERE i.category = $2
       AND i.status <> 'resolved'
       AND i.latitude  BETWEEN $3 AND $4
       AND i.longitude BETWEEN $5 AND $6
       AND distance_m($7, $8, i.latitude, i.longitude) <= $9
     ORDER BY distance_m($7, $8, i.latitude, i.longitude) ASC
     LIMIT 5`,
    [userId, category, lat - dLat, lat + dLat, lng - dLng, lng + dLng, lat, lng, DUPE_RADIUS_M]
  );
  return rows.map((row) => ({
    ...row,
    distance_m: Math.round(haversine(lat, lng, row.latitude, row.longitude))
  }));
}
function haversine(a1, o1, a2, o2) {
  const R = 6371000, t = (x) => (x * Math.PI) / 180;
  const h = Math.sin(t(a2 - a1) / 2) ** 2 + Math.cos(t(a1)) * Math.cos(t(a2)) * Math.sin(t(o2 - o1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

r.use(requireAuth);

/* everything on the map, with the filters the spec asks for */
r.get('/', async (req, res) => {
  const { category, status, sort } = req.query;
  const where = [], params = [req.user.id];
  if (category && CATEGORIES.includes(category)) { params.push(category); where.push(`i.category = $${params.length}`); }
  if (status && STATUSES.includes(status)) { params.push(status); where.push(`i.status = $${params.length}`); }
  const order = sort === 'newest' ? 'i.created_at DESC'
    : sort === 'upvotes' ? 'i.upvotes DESC, i.created_at DESC'
    : 'i.priority_score DESC, i.created_at DESC';
  const { rows } = await q(
    `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}`,
    params
  );
  res.json(rows);
});

r.get('/mine', async (req, res) => {
  const { rows } = await q(
    `${SELECT} WHERE i.user_id = $1
        OR i.id IN (SELECT issue_id FROM issue_upvotes WHERE user_id = $1)
      ORDER BY i.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

/* called by the report form before it submits */
r.post('/check-duplicate', async (req, res) => {
  const { category, latitude, longitude } = req.body;
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Unknown category.' });
  const lat = Number(latitude), lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Location is missing.' });
  res.json({ radius_m: DUPE_RADIUS_M, duplicates: await findNearby(req.user.id, category, lat, lng) });
});

/* the report form calls this once the pin settles, so the resident learns about a
   private-property problem before uploading a video over venue wifi */
r.post('/check-land', async (req, res) => {
  const lat = Number(req.body.latitude), lng = Number(req.body.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Location is missing.' });
  res.json({ ...(await classifyLand(lat, lng)), enforced: REQUIRE_PUBLIC_LAND });
});

r.get('/:id', async (req, res) => {
  const { rows } = await q(`${SELECT} WHERE i.id = $2`, [req.user.id, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'That report no longer exists.' });
  const history = await q('SELECT status, changed_at FROM status_history WHERE issue_id = $1 ORDER BY changed_at', [req.params.id]);
  res.json({ ...rows[0], history: history.rows });
});

/* file a report. The 50 m check runs again here so the API is safe on its own. */
const evidence = upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'video', maxCount: 1 }]);

r.post('/', reportLimiter, evidence, async (req, res) => {
  const photoFile = req.files?.photo?.[0] || null;
  const videoFile = req.files?.video?.[0] || null;
  const { category, description } = req.body;
  const lat = Number(req.body.latitude), lng = Number(req.body.longitude);
  const severity = Math.min(5, Math.max(1, Number(req.body.severity) || 3));
  const confirmed = req.body.confirm === 'true' || req.body.confirm === true;

  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Pick one of the five categories.' });
  if (!description || description.trim().length < 10) return res.status(400).json({ error: 'Add at least 10 characters of description.' });
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'We need a location for the report.' });

  if (!confirmed) {
    const duplicates = await findNearby(req.user.id, category, exif_lat ?? lat, exif_lng ?? lng);
    if (duplicates.length) {
      return res.status(409).json({
        error: 'Possible issue already reported nearby',
        radius_m: DUPE_RADIUS_M,
        duplicates
      });
    }
  }

  /* Evidence rules. A report has to carry a geotagged still and a clip, because a
     picture plus a GPS tag plus moving footage is far harder to fabricate than any
     one of them alone. Both rules can be relaxed from .env if devices cannot meet them. */
  if (!photoFile) {
    return res.status(422).json({ error: 'A photo of the issue is required.' });
  }
  if (!photoFile.mimetype.startsWith('image/')) {
    return res.status(422).json({ error: 'The photo field must hold an image.' });
  }
  if (REQUIRE_VIDEO && !videoFile) {
    return res.status(422).json({ error: 'A short video of the issue is required.' });
  }
  if (videoFile && !videoFile.mimetype.startsWith('video/')) {
    return res.status(422).json({ error: 'The video field must hold a video.' });
  }

  const photo_url = `/uploads/${photoFile.filename}`;
  const video_url = videoFile ? `/uploads/${videoFile.filename}` : null;
  const media_type = videoFile ? 'video' : 'photo';

  /* A photo may carry its own GPS tag. We never reject a file for lacking one —
     phone cameras in a browser produce none, and messaging apps strip EXIF — but
     when it is present we record it and how far it sits from the submitted pin.
     That difference is a trust signal the ward office can weigh. */
  let exif_lat = null, exif_lng = null, exif_drift_m = null;
  let geo_source = req.body.pinned_by_hand === 'true' ? 'manual' : 'device';

  try {
    const tags = await exifr.gps(photoFile.path);
    if (tags && Number.isFinite(tags.latitude) && Number.isFinite(tags.longitude)) {
      exif_lat = tags.latitude;
      exif_lng = tags.longitude;
      exif_drift_m = Math.round(haversine(lat, lng, exif_lat, exif_lng));
      geo_source = 'exif';
    }
  } catch { /* unreadable EXIF is treated as absent */ }

  if (REQUIRE_GEOTAG && exif_lat === null) {
    return res.status(422).json({
      error: 'This photo carries no location tag. Take it with your phone camera app with location switched on — photos captured inside a browser, or sent through messaging apps, have the tag stripped.'
    });
  }

  /* Where the camera says it stood beats where the form says the pin is. */
  const finalLat = exif_lat ?? lat;
  const finalLng = exif_lng ?? lng;

  /* The device's own reading, sent alongside, is a second independent witness.
     If the photo was taken somewhere else entirely, these two disagree — which is
     exactly the shape of a report filed from an old picture or someone else's. */
  const deviceLat = Number(req.body.device_lat);
  const deviceLng = Number(req.body.device_lng);
  const hasDeviceFix = Number.isFinite(deviceLat) && Number.isFinite(deviceLng);

  if (exif_lat !== null && hasDeviceFix) {
    const gap = Math.round(haversine(exif_lat, exif_lng, deviceLat, deviceLng));
    if (gap > MAX_EXIF_DRIFT_M) {
      return res.status(422).json({
        error: `The issue location is not where this photo was taken. The camera recorded a spot ${gap} m away from your device's current position. Report the issue from where it is, using a photo taken there.`,
        exif_drift_m: gap,
        exif: { latitude: exif_lat, longitude: exif_lng },
        device: { latitude: deviceLat, longitude: deviceLng }
      });
    }
  }

  /* GIS: is this public space at all? Fails open if OpenStreetMap is unreachable. */
  const land = await classifyLand(finalLat, finalLng);
  if (REQUIRE_PUBLIC_LAND && land.land_class === 'private') {
    return res.status(422).json({
      error: `This location looks like private property. ${land.land_note} The register covers roads, footpaths, drains and public spaces — for anything inside a private plot, contact the owner or the ward office directly.`,
      land_class: land.land_class,
      land_note: land.land_note
    });
  }
  const { rows } = await q(
    `INSERT INTO issues (user_id, photo_url, category, description, severity, latitude, longitude,
                         media_type, geo_source, exif_lat, exif_lng, exif_drift_m, video_url,
                         land_class, land_note, device_lat, device_lng)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [req.user.id, photo_url, category, description.trim(), severity, finalLat, finalLng,
     media_type, geo_source, exif_lat, exif_lng, exif_drift_m, video_url,
     land.land_class, land.land_note, hasDeviceFix ? deviceLat : null, hasDeviceFix ? deviceLng : null]
  );
  // the person filing it is its first supporter
  await q('INSERT INTO issue_upvotes (issue_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [rows[0].id, req.user.id]);
  const created = await q(`${SELECT} WHERE i.id = $2`, [req.user.id, rows[0].id]);
  res.status(201).json(created.rows[0]);
});

/* community upvotes */
r.post('/:id/upvote', voteLimiter, async (req, res) => {
  const ins = await q(
    'INSERT INTO issue_upvotes (issue_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING issue_id',
    [req.params.id, req.user.id]
  );
  if (!ins.rowCount) return res.status(409).json({ error: 'You are already backing this issue.' });
  const { rows } = await q(`${SELECT} WHERE i.id = $2`, [req.user.id, req.params.id]);
  res.json(rows[0]);
});

r.delete('/:id/upvote', async (req, res) => {
  await q('DELETE FROM issue_upvotes WHERE issue_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  const { rows } = await q(`${SELECT} WHERE i.id = $2`, [req.user.id, req.params.id]);
  res.json(rows[0]);
});

/* community verification: is this actually there?
   One verdict per person per issue, enforced by the table's primary key. */
r.post('/:id/verify', voteLimiter, async (req, res) => {
  const verdict = req.body.verdict;
  if (!['confirm', 'dispute'].includes(verdict)) {
    return res.status(400).json({ error: "Verdict must be 'confirm' or 'dispute'." });
  }
  const owner = await q('SELECT user_id FROM issues WHERE id = $1', [req.params.id]);
  if (!owner.rowCount) return res.status(404).json({ error: 'That report no longer exists.' });
  if (owner.rows[0].user_id === req.user.id) {
    return res.status(403).json({ error: 'You cannot verify your own report.' });
  }
  await q(
    `INSERT INTO issue_verifications (issue_id, user_id, verdict) VALUES ($1,$2,$3)
     ON CONFLICT (issue_id, user_id) DO UPDATE SET verdict = EXCLUDED.verdict, created_at = now()`,
    [req.params.id, req.user.id, verdict]
  );
  const { rows } = await q(`${SELECT} WHERE i.id = $2`, [req.user.id, req.params.id]);
  res.json(rows[0]);
});

r.delete('/:id/verify', async (req, res) => {
  await q('DELETE FROM issue_verifications WHERE issue_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  const { rows } = await q(`${SELECT} WHERE i.id = $2`, [req.user.id, req.params.id]);
  res.json(rows[0]);
});

/* status tracking — admin only */
r.patch('/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Status must be pending, in_progress or resolved.' });
  const upd = await q('UPDATE issues SET status = $1 WHERE id = $2 RETURNING id', [status, req.params.id]);
  if (!upd.rowCount) return res.status(404).json({ error: 'That report no longer exists.' });
  await q('UPDATE status_history SET changed_by = $1 WHERE id = (SELECT max(id) FROM status_history WHERE issue_id = $2)', [req.user.id, req.params.id]);
  const { rows } = await q(`${SELECT} WHERE i.id = $2`, [req.user.id, req.params.id]);
  res.json(rows[0]);
});

r.get('/admin/stats', requireAdmin, async (_req, res) => {
  const { rows } = await q(
    `SELECT count(*)                                        AS total,
            count(*) FILTER (WHERE status = 'pending')      AS pending,
            count(*) FILTER (WHERE status = 'in_progress')  AS in_progress,
            count(*) FILTER (WHERE status = 'resolved')     AS resolved,
            coalesce(sum(upvotes), 0)                       AS supporters,
            coalesce(max(priority_score), 0)                AS top_priority,
            coalesce(sum(confirmations), 0)                 AS confirmations,
            count(*) FILTER (WHERE disputes > confirmations) AS disputed
     FROM issues`
  );
  res.json(rows[0]);
});

export default r;
