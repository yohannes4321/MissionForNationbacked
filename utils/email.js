const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

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
