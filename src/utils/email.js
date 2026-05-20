const nodemailer = require('nodemailer');

// Environment varijable
const SMTP_HOST = process.env.SMTP_HOST || 'pro3.crohost.net';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;  // 587 umjesto 465!
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

console.log('SMTP Config:', {
  host: SMTP_HOST,
  port: SMTP_PORT,
  user: SMTP_USER ? 'SET' : 'MISSING',
  pass: SMTP_PASS ? 'SET' : 'MISSING'
});

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,          // STARTTLS umjesto SSL
  requireTLS: true,       // Zahtijevaj TLS
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false  // Za self-signed certifikate
  },
  debug: true,
  logger: true
});

async function sendEmail(to, subject, html) {
  try {
    console.log('Verifying SMTP connection...');
    await transporter.verify();
    console.log('SMTP connection OK');
    
    const result = await transporter.sendMail({
      from: `"JoleDrive" <${SMTP_USER}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html
    });
    console.log('Email sent:', result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email error:', error.code, error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendEmail };
