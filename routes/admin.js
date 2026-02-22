const express = require('express');
const router = express.Router();
const db = require('../db');
const { authRequired, requireRole } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

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

// List regions
router.get('/regions', authRequired, requireRole('super'), async (req, res) => {
  const r = await db.query('SELECT * FROM regions');
  return res.json({ regions: r.rows });
});

// Create post (super or regional admin)
router.post('/posts', authRequired, async (req, res) => {
  const { title, type, content, region_id } = req.body;
  if (!title || !type || !content) return res.status(400).json({ error: 'Missing fields' });
  const user = req.user;
  // super can post to anywhere; regional can only post to their region
  if (user.role === 'regional_admin') {
    const r = await db.query('SELECT * FROM user_regions WHERE user_id=$1 AND region_id=$2', [user.id, region_id]);
    if (r.rowCount === 0) return res.status(403).json({ error: 'Forbidden for this region' });
  } else if (user.role !== 'super') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const id = uuidv4();
  await db.query('INSERT INTO posts(id,author_id,region_id,title,type,content,created_at) VALUES($1,$2,$3,$4,$5,$6,NOW())', [id, user.id, region_id, title, type, content]);
  return res.json({ ok: true });
});

// List posts for region (any authenticated)
router.get('/posts', authRequired, async (req, res) => {
  const { region_id } = req.query;
  if (!region_id) return res.status(400).json({ error: 'Missing region_id' });
  const r = await db.query('SELECT * FROM posts WHERE region_id=$1 ORDER BY created_at DESC', [region_id]);
  return res.json({ posts: r.rows });
});

module.exports = router;
