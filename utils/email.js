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
  auth: {
    user: process.env.SMTP_USER,
    pass: smtpPassword
  }
});

async function sendMail({ to, subject, html, text }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const info = await transporter.sendMail({ from, to, subject, html, text });
  return info;
}

module.exports = { sendMail };
