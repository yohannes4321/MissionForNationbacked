const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure =
  process.env.SMTP_SECURE !== undefined
    ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
    : smtpPort === 465;

// Gmail app passwords are often copied with spaces; normalize for transport auth.
const smtpPassword = (process.env.SMTP_PASS || '').replace(/\s+/g, '');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: smtpPort,
  secure: smtpSecure,
  connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
  greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
  socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15000),
  auth: {
    user: process.env.SMTP_USER,
    pass: smtpPassword
  }
});

async function sendMail({ to, subject, html, text }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  try {
    const info = await transporter.sendMail({ from, to, subject, html, text });
    return info;
  } catch (err) {
    // Normalize common network timeout failure shapes so route handlers can map them consistently.
    if (!err.code && /timeout/i.test(String(err.message || ''))) {
      err.code = 'ETIMEDOUT';
    }
    throw err;
  }
}

module.exports = { sendMail };
