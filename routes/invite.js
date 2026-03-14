const express = require('express');
const router = express.Router();
const db = require('../db');
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const { sendMail } = require('../utils/email');
const { authRequired, requireRole } = require('../middleware/auth');
require('dotenv').config();

function buildAcceptInviteUrl(token) {
  const base = process.env.INVITE_ACCEPT_URL_BASE || `http://localhost:${process.env.PORT || 4000}`;
  return `${base}/accept-invite?token=${token}`;
}

function mapInviteError(err) {
  if (!err) return { status: 500, error: 'Server error', code: 'UNKNOWN', detail: null };

  if (err.code === '23503') {
    return { status: 400, error: 'Invalid region_id', code: err.code, detail: err.message || null };
  }

  if (
    err.code === 'EAUTH' ||
    err.code === 'EENVELOPE' ||
    err.code === 'ESOCKET' ||
    err.code === 'ECONNECTION' ||
    err.code === 'ETIMEDOUT' ||
    err.code === 'ECONNRESET' ||
    err.code === 'ENOTFOUND'
  ) {
    return {
      status: 502,
      error: 'Failed to send invitation email. Check SMTP configuration.',
      code: err.code || 'SMTP_ERROR',
      detail: err.message || null
    };
  }

  return {
    status: 500,
    error: 'Server error',
    code: err.code || 'UNEXPECTED',
    detail: err.message || null
  };
}

function logInviteContext(req, details = {}) {
  console.log('[INVITE] /send request', {
    method: req.method,
    path: req.originalUrl,
    by_user_id: req.user && req.user.id,
    by_role: req.user && req.user.role,
    email: details.email,
    role: details.role,
    region_id: details.region_id,
    ip: req.ip
  });
}

// Send invitation (super user)
router.post('/send', authRequired, requireRole('super'), async (req, res) => {
  const { email, role, region_id } = req.body;
  logInviteContext(req, { email, role, region_id });

  if (!email || !role) {
    console.warn('[INVITE] Validation failed: missing fields', { email, role, region_id });
    return res.status(400).json({ error: 'Missing fields' });
  }
  const allowedRoles = new Set(['regional_admin', 'user', 'super']);
  if (!allowedRoles.has(role)) {
    console.warn('[INVITE] Validation failed: invalid role', { email, role, region_id });
    return res.status(400).json({ error: 'Invalid role' });
  }
  // require region_id created by a super user (no auto-creation here)
  if (!region_id) {
    console.warn('[INVITE] Validation failed: missing region_id', { email, role });
    return res.status(400).json({ error: 'region_id is required. Create a region via /api/regions as a super user first.' });
  }
  if (!uuidValidate(region_id)) {
    console.warn('[INVITE] Validation failed: region_id is not UUID', { email, role, region_id });
    return res.status(400).json({ error: 'region_id must be a UUID' });
  }
  const rr = await db.query('SELECT name FROM regions WHERE id=$1', [region_id]);
  if (rr.rowCount !== 1) {
    console.warn('[INVITE] Validation failed: region not found', { email, role, region_id });
    return res.status(400).json({ error: 'region not found; create it first via /api/regions' });
  }
  const regionId = region_id;
  const regionName = rr.rows[0].name;
  try {
    const startedAt = Date.now();
    const token = uuidv4();
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days
    const id = uuidv4();
    await db.query('INSERT INTO invitations(id,email,role,region_id,token,expires_at,sent_count,accepted) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id, email, role, regionId, token, expires, 1, false]);
    const url = buildAcceptInviteUrl(token);
    const mailInfo = await sendMail({ to: email, subject: 'Invitation', html: `<p>You are invited as ${role} in region ${regionName || ''}. Accept: <a href="${url}">${url}</a></p>` });
    console.log('Invite email delivered', {
      to: email,
      region_id: regionId,
      messageId: mailInfo && mailInfo.messageId,
      duration_ms: Date.now() - startedAt
    });
    return res.json({ ok: true, token, region_id: regionId, region_name: regionName });
  } catch (err) {
    console.error("error",err)
    console.error('[INVITE] Send failed', {
      email,
      role,
      region_id: regionId,
      code: err && err.code,
      message: err && err.message,
      stack: err && err.stack
    });
    const mapped = mapInviteError(err);
    return res.status(mapped.status).json({
      error: mapped.error,
      code: mapped.code,
      detail: mapped.detail
    });
  }
});

// Resend invitation
router.post('/resend', authRequired, requireRole('super'), async (req, res) => {
  const { invitation_id } = req.body;
  if (!invitation_id) return res.status(400).json({ error: 'Missing invitation_id' });
  if (!uuidValidate(invitation_id)) return res.status(400).json({ error: 'invitation_id must be a UUID' });
  try {
    const startedAt = Date.now();
    const invr = await db.query('SELECT * FROM invitations WHERE id=$1', [invitation_id]);
    if (invr.rowCount !== 1) return res.status(404).json({ error: 'Not found' });
    const inv = invr.rows[0];
    const token = uuidv4();
    await db.query('UPDATE invitations SET token=$1,expires_at=$2,sent_count=sent_count+1 WHERE id=$3', [token, new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), invitation_id]);
    const url = buildAcceptInviteUrl(token);
    const mailInfo = await sendMail({ to: inv.email, subject: 'Invitation (resend)', html: `<p>Accept: <a href="${url}">${url}</a></p>` });
    console.log('Invite resend email delivered', {
      to: inv.email,
      invitation_id,
      messageId: mailInfo && mailInfo.messageId,
      duration_ms: Date.now() - startedAt
    });
    return res.json({ ok: true, token, invitation_url: url });
  } catch (err) {
    console.error('Invite resend failed:', err);
    const mapped = mapInviteError(err);
    return res.status(mapped.status).json({
      error: mapped.error,
      code: mapped.code,
      detail: mapped.detail
    });
  }
});

// Validate invitation token for frontend accept-invite page
router.get('/validate', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Missing token' });
  try {
    const invr = await db.query('SELECT id,email,role,region_id,expires_at,accepted FROM invitations WHERE token=$1', [token]);
    if (invr.rowCount !== 1) return res.status(404).json({ error: 'Invitation not found' });
    const inv = invr.rows[0];
    if (inv.accepted) return res.status(400).json({ error: 'Invitation already accepted' });
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) return res.status(400).json({ error: 'Invitation expired' });
    // Get region name
    let region_name = null;
    if (inv.region_id) {
      const rr = await db.query('SELECT name FROM regions WHERE id=$1', [inv.region_id]);
      if (rr.rowCount === 1) region_name = rr.rows[0].name;
    }
    return res.json({
      ok: true,
      invitation: {
        id: inv.id,
        email: inv.email,
        role: inv.role,
        region_id: inv.region_id,
        region_name,
        expires_at: inv.expires_at
      },
      token
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
