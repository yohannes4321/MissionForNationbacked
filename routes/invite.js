const express = require('express');
const router = express.Router();
const db = require('../db');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const { sendMail } = require('../utils/email');
const { authRequired, requireRole } = require('../middleware/auth');
require('dotenv').config();

// Send invitation (super user)
router.post('/send', authRequired, requireRole('super'), async (req, res) => {
  const { email, role, region_id } = req.body;
  if (!email || !role) return res.status(400).json({ error: 'Missing fields' });
  // require region_id created by a super user (no auto-creation here)
  if (!region_id) {
    return res.status(400).json({ error: 'region_id is required. Create a region via /api/regions as a super user first.' });
  }
  if (!uuidValidate(region_id)) return res.status(400).json({ error: 'region_id must be a UUID' });
  const rr = await db.query('SELECT name FROM regions WHERE id=$1', [region_id]);
  if (rr.rowCount !== 1) return res.status(400).json({ error: 'region not found; create it first via /api/regions' });
  const regionId = region_id;
  const regionName = rr.rows[0].name;
  try {
    const token = uuidv4();
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days
    const id = uuidv4();
    await db.query('INSERT INTO invitations(id,email,role,region_id,token,expires_at,sent_count,accepted) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id, email, role, regionId, token, expires, 1, false]);
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`;
    await sendMail({ to: email, subject: 'Invitation', html: `<p>You are invited as ${role} in region ${regionName || ''}. Accept: <a href="${url}">${url}</a></p>` });
    return res.json({ ok: true, token, region_id: regionId, region_name: regionName });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Resend invitation
router.post('/resend', authRequired, requireRole('super'), async (req, res) => {
  const { invitation_id } = req.body;
  if (!invitation_id) return res.status(400).json({ error: 'Missing invitation_id' });
  if (!uuidValidate(invitation_id)) return res.status(400).json({ error: 'invitation_id must be a UUID' });
  try {
    const invr = await db.query('SELECT * FROM invitations WHERE id=$1', [invitation_id]);
    if (invr.rowCount !== 1) return res.status(404).json({ error: 'Not found' });
    const inv = invr.rows[0];
    const token = uuidv4();
    await db.query('UPDATE invitations SET token=$1,expires_at=$2,sent_count=sent_count+1 WHERE id=$3', [token, new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), invitation_id]);
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`;
    await sendMail({ to: inv.email, subject: 'Invitation (resend)', html: `<p>Accept: <a href="${url}">${url}</a></p>` });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
