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