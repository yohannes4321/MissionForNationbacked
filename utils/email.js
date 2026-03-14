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
