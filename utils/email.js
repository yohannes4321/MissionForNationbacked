const { Resend } = require('resend');

// Helper to remove surrounding quotes if present
function unquoteEnv(value) {
  if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

const resend = new Resend(unquoteEnv(process.env.RESEND_API_KEY));

/**
 * sendMail function
 * Note: Uses the Resend SDK for sending emails.
 */
async function sendMail({ to, subject, html, text }) {
  // Use SMTP_FROM if available, otherwise fallback to Resend default
  const fromAddress = unquoteEnv(process.env.SMTP_FROM) || 'onboarding@resend.dev';

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