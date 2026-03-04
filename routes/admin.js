const express = require('express');
const router = express.Router();
const db = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const ALLOWED_CATEGORIES = ['special_program', 'mission', 'program_sunday'];

function parseExpiryDate(expiresInDays) {
  if (expiresInDays === undefined || expiresInDays === null || expiresInDays === '') return null;
  const days = Number(expiresInDays);
  if (!Number.isFinite(days) || days <= 0) return undefined;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function userCanPostToRegion(userId, regionId) {
  const membership = await db.query('SELECT 1 FROM user_regions WHERE user_id=$1 AND region_id=$2', [userId, regionId]);
  return membership.rowCount > 0;
}

async function validateChurchIdsForRegion(churchIds, regionId) {
  if (!Array.isArray(churchIds) || churchIds.length === 0) return true;
  const uniqueChurchIds = [...new Set(churchIds)];
  const c = await db.query('SELECT id FROM churches WHERE region_id=$1 AND id = ANY($2::uuid[])', [regionId, uniqueChurchIds]);
  return c.rowCount === uniqueChurchIds.length;
}

// List users (super)
router.get('/users', authRequired, requireRole('super'), async (req, res) => {
  const result = await db.query('SELECT id,email,role FROM users');
  return res.json({ users: result.rows });
});

// Change role (super)
router.post('/change-role', authRequired, requireRole('super'), async (req, res) => {
  const { user_id, role } = req.body;
  if (!user_id || !role) return res.status(400).json({ error: 'Missing' });
  await db.query('UPDATE users SET role=$1 WHERE id=$2', [role, user_id]);
  return res.json({ ok: true });
});

// Create region (super)
router.post('/regions', authRequired, requireRole('super'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  const id = uuidv4();
  await db.query('INSERT INTO regions(id,name) VALUES($1,$2)', [id, name]);
  return res.json({ ok: true, id });
});

// List regions (super and regional admin)
router.get('/regions', authRequired, requireRole('super', 'regional_admin'), async (req, res) => {
  const r = await db.query('SELECT * FROM regions');
  return res.json({ regions: r.rows });
});

// Add church to a region (super)
router.post('/churches', authRequired, requireRole('super'), async (req, res) => {
  const { name, region_id, location_link } = req.body;
  if (!name || !region_id) return res.status(400).json({ error: 'Missing name or region_id' });

  const rr = await db.query('SELECT id FROM regions WHERE id=$1', [region_id]);
  if (rr.rowCount !== 1) return res.status(400).json({ error: 'Region not found' });

  const id = uuidv4();
  await db.query(
    'INSERT INTO churches(id,name,region_id,location_link,created_at) VALUES($1,$2,$3,$4,NOW())',
    [id, name, region_id, location_link || null]
  );
  return res.json({ ok: true, id });
});

// List churches (super: all; regional admin: own region by default)
router.get('/churches', authRequired, requireRole('super', 'regional_admin'), async (req, res) => {
  const { region_id } = req.query;
  const user = req.user;

  if (user.role === 'regional_admin') {
    if (region_id) {
      const allowed = await userCanPostToRegion(user.id, region_id);
      if (!allowed) return res.status(403).json({ error: 'Forbidden for this region' });
      const c = await db.query('SELECT * FROM churches WHERE region_id=$1 ORDER BY created_at DESC', [region_id]);
      return res.json({ churches: c.rows });
    }
    const c = await db.query(
      `SELECT c.*
       FROM churches c
       JOIN user_regions ur ON ur.region_id = c.region_id
       WHERE ur.user_id = $1
       ORDER BY c.created_at DESC`,
      [user.id]
    );
    return res.json({ churches: c.rows });
  }

  if (region_id) {
    const c = await db.query('SELECT * FROM churches WHERE region_id=$1 ORDER BY created_at DESC', [region_id]);
    return res.json({ churches: c.rows });
  }

  const c = await db.query('SELECT * FROM churches ORDER BY created_at DESC');
  return res.json({ churches: c.rows });
});

// Create blog item for homepage (super only)
router.post('/blogs', authRequired, requireRole('super'), async (req, res) => {
  const { text, image_url, expires_in_days } = req.body;
  if (!text || !image_url) return res.status(400).json({ error: 'Missing text or image_url' });

  const expiresAt = parseExpiryDate(expires_in_days);
  if (expiresAt === undefined) return res.status(400).json({ error: 'expires_in_days must be a positive number' });

  const id = uuidv4();
  await db.query(
    'INSERT INTO blogs(id,author_id,text,image_url,expires_at,created_at) VALUES($1,$2,$3,$4,$5,NOW())',
    [id, req.user.id, text, image_url, expiresAt]
  );
  return res.json({ ok: true, id });
});

// Public list for homepage blog section (search + sort + newest first)
router.get('/blogs', async (req, res) => {
  const { search = '', sort = 'newest', include_expired = 'false' } = req.query;
  const isNewest = sort !== 'oldest';
  const includeExpired = String(include_expired).toLowerCase() === 'true';

  const query = `
    SELECT id, text, image_url, created_at, expires_at
    FROM blogs
    WHERE ($1 = '' OR text ILIKE '%' || $1 || '%')
      AND ($2::boolean = true OR expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at ${isNewest ? 'DESC' : 'ASC'}
  `;

  const r = await db.query(query, [search, includeExpired]);
  return res.json({ blogs: r.rows });
});

// Create post (super or regional admin)
router.post('/posts', authRequired, async (req, res) => {
  const {
    title,
    type,
    content,
    region_id,
    category,
    image_url,
    video_url,
    location_link,
    church_ids,
    expires_in_days
  } = req.body;

  if (!content || !region_id) return res.status(400).json({ error: 'Missing content or region_id' });
  if (!category || !ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${ALLOWED_CATEGORIES.join(', ')}` });
  }

  const expiresAt = parseExpiryDate(expires_in_days);
  if (expiresAt === undefined) return res.status(400).json({ error: 'expires_in_days must be a positive number' });

  const user = req.user;
  // super can post to anywhere; regional can only post to their region
  if (user.role === 'regional_admin') {
    const allowedRegion = await userCanPostToRegion(user.id, region_id);
    if (!allowedRegion) return res.status(403).json({ error: 'Forbidden for this region' });
  } else if (user.role !== 'super') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const validChurches = await validateChurchIdsForRegion(church_ids, region_id);
  if (!validChurches) return res.status(400).json({ error: 'One or more church_ids do not belong to the selected region' });

  const id = uuidv4();
  await db.query(
    `INSERT INTO posts(
      id,author_id,region_id,title,type,content,category,image_url,video_url,location_link,expires_at,created_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
    [
      id,
      user.id,
      region_id,
      title || null,
      type || null,
      content,
      category,
      image_url || null,
      video_url || null,
      location_link || null,
      expiresAt
    ]
  );

  if (Array.isArray(church_ids) && church_ids.length > 0) {
    const uniqueChurchIds = [...new Set(church_ids)];
    for (const churchId of uniqueChurchIds) {
      await db.query('INSERT INTO post_churches(post_id,church_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [id, churchId]);
    }
  }

  return res.json({ ok: true, id });
});

// List posts for region (search + sort + newest first + timestamps)
router.get('/posts', authRequired, async (req, res) => {
  const { region_id, search = '', sort = 'newest', include_expired = 'false', category } = req.query;
  if (!region_id) return res.status(400).json({ error: 'Missing region_id' });

  if (req.user.role === 'regional_admin') {
    const allowed = await userCanPostToRegion(req.user.id, region_id);
    if (!allowed) return res.status(403).json({ error: 'Forbidden for this region' });
  }

  const includeExpired = String(include_expired).toLowerCase() === 'true';
  const isNewest = sort !== 'oldest';
  const normalizedCategory = category || '';

  const r = await db.query(
    `SELECT
      p.id,
      p.author_id,
      p.region_id,
      p.title,
      p.type,
      p.content,
      p.category,
      p.image_url,
      p.video_url,
      p.location_link,
      p.expires_at,
      p.created_at,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'region_id', c.region_id,
            'location_link', c.location_link
          )
        ) FILTER (WHERE c.id IS NOT NULL),
        '[]'::json
      ) AS churches
    FROM posts p
    LEFT JOIN post_churches pc ON pc.post_id = p.id
    LEFT JOIN churches c ON c.id = pc.church_id
    WHERE p.region_id = $1
      AND ($2 = '' OR p.content ILIKE '%' || $2 || '%' OR p.title ILIKE '%' || $2 || '%')
      AND ($3 = '' OR p.category = $3)
      AND ($4::boolean = true OR p.expires_at IS NULL OR p.expires_at > NOW())
    GROUP BY p.id
    ORDER BY p.created_at ${isNewest ? 'DESC' : 'ASC'}`,
    [region_id, search, normalizedCategory, includeExpired]
  );

  return res.json({ posts: r.rows });
});

// Add gallery image for region (super or regional admin)
router.post('/galleries', authRequired, requireRole('super', 'regional_admin'), async (req, res) => {
  const { region_id, church_id, image_url, caption, location_link, expires_in_days } = req.body;
  if (!region_id || !image_url) return res.status(400).json({ error: 'Missing region_id or image_url' });

  const rr = await db.query('SELECT id FROM regions WHERE id=$1', [region_id]);
  if (rr.rowCount !== 1) return res.status(400).json({ error: 'Region not found' });

  if (req.user.role === 'regional_admin') {
    const allowedRegion = await userCanPostToRegion(req.user.id, region_id);
    if (!allowedRegion) return res.status(403).json({ error: 'Forbidden for this region' });
  }

  if (church_id) {
    const validChurch = await db.query('SELECT id FROM churches WHERE id=$1 AND region_id=$2', [church_id, region_id]);
    if (validChurch.rowCount !== 1) return res.status(400).json({ error: 'church_id is invalid for selected region' });
  }

  const expiresAt = parseExpiryDate(expires_in_days);
  if (expiresAt === undefined) return res.status(400).json({ error: 'expires_in_days must be a positive number' });

  const id = uuidv4();
  await db.query(
    `INSERT INTO region_galleries(
      id,author_id,region_id,church_id,caption,image_url,location_link,expires_at,created_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
    [
      id,
      req.user.id,
      region_id,
      church_id || null,
      caption || null,
      image_url,
      location_link || null,
      expiresAt
    ]
  );

  return res.json({ ok: true, id });
});

// List gallery images by region (newest first by default)
router.get('/galleries', authRequired, async (req, res) => {
  const { region_id, search = '', sort = 'newest', include_expired = 'false' } = req.query;
  if (!region_id) return res.status(400).json({ error: 'Missing region_id' });

  if (req.user.role === 'regional_admin') {
    const allowed = await userCanPostToRegion(req.user.id, region_id);
    if (!allowed) return res.status(403).json({ error: 'Forbidden for this region' });
  }

  const includeExpired = String(include_expired).toLowerCase() === 'true';
  const isNewest = sort !== 'oldest';

  const result = await db.query(
    `SELECT
      g.id,
      g.author_id,
      g.region_id,
      g.church_id,
      c.name AS church_name,
      g.caption,
      g.image_url,
      g.location_link,
      g.expires_at,
      g.created_at
    FROM region_galleries g
    LEFT JOIN churches c ON c.id = g.church_id
    WHERE g.region_id = $1
      AND ($2 = '' OR g.caption ILIKE '%' || $2 || '%')
      AND ($3::boolean = true OR g.expires_at IS NULL OR g.expires_at > NOW())
    ORDER BY g.created_at ${isNewest ? 'DESC' : 'ASC'}`,
    [region_id, search, includeExpired]
  );

  return res.json({ galleries: result.rows });
});

module.exports = router;
