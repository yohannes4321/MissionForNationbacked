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

// Configuration Parsing
const smtpHost = unquoteEnv(process.env.SMTP_HOST);
const smtpUser = unquoteEnv(process.env.SMTP_USER);
const smtpFrom = unquoteEnv(process.env.SMTP_FROM);
const requestedSmtpPort = Number(unquoteEnv(process.env.SMTP_PORT) || 587);
const allowPort25 = unquoteEnv(process.env.SMTP_ALLOW_PORT_25).toLowerCase() === 'true';

const smtpPort = requestedSmtpPort === 25 && !allowPort25 ? 587 : requestedSmtpPort;
if (requestedSmtpPort === 25 && !allowPort25) {
  console.warn('[SMTP] Port 25 requested but blocked by default; using 587 instead');
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
const smtpPassword = unquoteEnv(process.env.SMTP_PASS).replace(/\s+/g, '');

console.log('[SMTP] Transport configured', {
  host: smtpHost || '(missing)',
  port: smtpPort,
  secure: smtpSecure,
  has_user: Boolean(smtpUser),
  from: smtpFrom || smtpUser || '(missing)'
});

// Initialize Resend
const { Resend } = require('resend');
const resend = new Resend(unquoteEnv(process.env.RESEND_API_KEY));

/**
 * sendMail function
 * Note: Since you are using the Resend SDK, the SMTP variables above 
 * are mostly for logging/referencing unless you switch to Nodemailer transport.
 */
async function sendMail({ to, subject, html, text }) {
  // Use SMTP_FROM if available, otherwise fallback to Resend default
  const fromAddress = smtpFrom || 'onboarding@resend.dev';

  try {
    const info = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
      text
    });
    return info;
  } catch (error) {
    console.error('[SMTP] Error sending email:', error);
    throw error;
  }
}

// Export the function so it can be used in other files
module.exports = { sendMail };