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
  return nodemailer.createTransport({
    host: smtpHost,
    port,
    secure,
    family: smtpFamily,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15000),
    tls: {
      rejectUnauthorized: tlsRejectUnauthorized,
      minVersion: tlsMinVersion
    },
    auth: {
      user: smtpUser,
      pass: smtpPassword
    }
  });
}

const primaryTransporter = createTransport(smtpPort, smtpSecure);

async function sendMail({ to, subject, html, text }) {
  const from = smtpFrom || smtpUser;
  try {
    const info = await primaryTransporter.sendMail({ from, to, subject, html, text });
    return info;
  } catch (err) {
    // Normalize common network timeout failure shapes so route handlers can map them consistently.
    if (!err.code && /timeout/i.test(String(err.message || ''))) {
      err.code = 'ETIMEDOUT';
    }

    console.error('[SMTP] Primary send failed', {
      to,
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      code: err && err.code,
      errno: err && err.errno,
      syscall: err && err.syscall,
      command: err && err.command,
      responseCode: err && err.responseCode,
      message: err && err.message,
      address: err && err.address
    });

    const canRetryWithStartTls =
      smtpHost === 'smtp.gmail.com' &&
      smtpPort !== 587 &&
      (err.code === 'ETIMEDOUT' || err.code === 'ECONNECTION' || err.code === 'ESOCKET' || err.code === 'ENOTFOUND');
    if (canRetryWithStartTls) {
      try {
        console.warn('[SMTP] Retrying with gmail STARTTLS fallback on port 587');
        const fallbackTransporter = createTransport(587, false);
        const info = await fallbackTransporter.sendMail({ from, to, subject, html, text });
        return info;
      } catch (fallbackErr) {
        if (!fallbackErr.code && /timeout/i.test(String(fallbackErr.message || ''))) {
          fallbackErr.code = 'ETIMEDOUT';
        }
        console.error('[SMTP] Fallback send failed', {
          to,
          host: smtpHost,
          port: 587,
          secure: false,
          code: fallbackErr && fallbackErr.code,
          errno: fallbackErr && fallbackErr.errno,
          syscall: fallbackErr && fallbackErr.syscall,
          command: fallbackErr && fallbackErr.command,
          responseCode: fallbackErr && fallbackErr.responseCode,
          message: fallbackErr && fallbackErr.message,
          address: fallbackErr && fallbackErr.address
        });
        throw fallbackErr;
      }
    }

    throw err;
  }
}

module.exports = { sendMail };
