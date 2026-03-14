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
const requestedSmtpPort = Number(unquoteEnv(process.env.SMTP_PORT) || 587);
const allowPort25 = unquoteEnv(process.env.SMTP_ALLOW_PORT_25).toLowerCase() === 'true';

// Most cloud providers block outbound port 25 by default; prefer 587 unless explicitly allowed.
const smtpPort = requestedSmtpPort === 25 && !allowPort25 ? 587 : requestedSmtpPort;
if (requestedSmtpPort === 25 && !allowPort25) {
  console.warn('[SMTP] Port 25 requested but blocked by default on many cloud platforms; using 587 instead');
}

const smtpSecure =
  process.env.SMTP_SECURE !== undefined
    ? unquoteEnv(process.env.SMTP_SECURE).toLowerCase() === 'true'
    : smtpPort === 465;

const tlsRejectUnauthorized =
  process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== undefined
    ? unquoteEnv(process.env.SMTP_TLS_REJECT_UNAUTHORIZED).toLowerCase() !== 'false'
    : true;
const tlsMinVersion = unquoteEnv(process.env.SMTP_TLS_MIN_VERSION) || 'TLSv1.2';
const smtpFamily = Number(unquoteEnv(process.env.SMTP_FAMILY) || 4);

// Gmail app passwords are often copied with spaces; normalize for transport auth.
const smtpPassword = unquoteEnv(process.env.SMTP_PASS).replace(/\s+/g, '');

console.log('[SMTP] Transport configured', {
  host: smtpHost || '(missing)',
  port: smtpPort,
  secure: smtpSecure,
  family: smtpFamily,
  has_user: Boolean(smtpUser),
  has_password: Boolean(smtpPassword),
  from: smtpFrom || smtpUser || '(missing)',
  tls_reject_unauthorized: tlsRejectUnauthorized,
  tls_min_version: tlsMinVersion
});

function createTransport(port, secure) {
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  async function sendMail({ to, subject, html, text }) {
    const from = 'onboarding@resend.dev'; // For testing, use Resend's test sender
    const info = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text
    });
    return info;
  }

  module.exports = { sendMail };
module.exports = { sendMail };
