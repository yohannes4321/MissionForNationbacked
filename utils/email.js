const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

function unquoteEnv(value) {
  if (value === undefined || value === null) return '';
  const str = String(value).trim();
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    return str.slice(1, -1).trim();
  }
  return str;
}

const smtpHost = unquoteEnv(process.env.SMTP_HOST);
const smtpUser = unquoteEnv(process.env.SMTP_USER);
const smtpFrom = unquoteEnv(process.env.SMTP_FROM);
const smtpPort = Number(unquoteEnv(process.env.SMTP_PORT) || 587);
const smtpSecure =
  process.env.SMTP_SECURE !== undefined
    ? unquoteEnv(process.env.SMTP_SECURE).toLowerCase() === 'true'
    : smtpPort === 465;

// Gmail app passwords are often copied with spaces; normalize for transport auth.
const smtpPassword = unquoteEnv(process.env.SMTP_PASS).replace(/\s+/g, '');

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
  greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
  socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15000),
  auth: {
    user: smtpUser,
    pass: smtpPassword
  }
});

async function sendMail({ to, subject, html, text }) {
  const from = smtpFrom || smtpUser;
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
