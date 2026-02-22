const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { sendMail } = require('../utils/email');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

router.post('/register', async (req, res) => {
  const { email, password, token } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    // If token provided, link to invitation
    let role = 'user';
    let region_id = null;
    if (token) {
      const inv = await db.query('SELECT * FROM invitations WHERE token=$1 AND accepted=false', [token]);
      if (inv.rowCount === 1) {
        role = inv.rows[0].role;
        region_id = inv.rows[0].region_id;
        await db.query('UPDATE invitations SET accepted=true WHERE id=$1', [inv.rows[0].id]);
      }
    }
    const id = uuidv4();
    await db.query('INSERT INTO users(id,email,password,role) VALUES($1,$2,$3,$4)', [id, email, hashed, role]);
    if (region_id) {
      await db.query('INSERT INTO user_regions(user_id, region_id) VALUES($1,$2)', [id, region_id]);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const user = await db.query('SELECT * FROM users WHERE email=$1', [email]);
    if (user.rowCount !== 1) return res.status(401).json({ error: 'Invalid credentials' });
    const u = user.rows[0];
    if (!u.password) return res.status(400).json({ error: 'No password set; accept invitation first' });
    const ok = await bcrypt.compare(password, u.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: u.id, email: u.email, role: u.role }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Missing email' });
  try {
    const user = await db.query('SELECT * FROM users WHERE email=$1', [email]);
    if (user.rowCount !== 1) return res.json({ ok: true });
    const token = uuidv4();
    const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
    await db.query('INSERT INTO password_resets(id,user_id,token,expires_at) VALUES($1,$2,$3,$4)', [uuidv4(), user.rows[0].id, token, expires]);
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
    await sendMail({ to: email, subject: 'Reset password', html: `<p>Reset: <a href="${url}">${url}</a></p>` });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const row = await db.query('SELECT * FROM password_resets WHERE token=$1', [token]);
    if (row.rowCount !== 1) return res.status(400).json({ error: 'Invalid token' });
    const pr = row.rows[0];
    if (new Date(pr.expires_at) < new Date()) return res.status(400).json({ error: 'Expired' });
    const hashed = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password=$1 WHERE id=$2', [hashed, pr.user_id]);
    await db.query('DELETE FROM password_resets WHERE id=$1', [pr.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
