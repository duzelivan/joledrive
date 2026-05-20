const nodemailer = require('nodemailer');

console.log('SMTP Config:', {
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  user: process.env.SMTP_USER ? 'SET' : 'MISSING',
  pass: process.env.SMTP_PASS ? 'SET' : 'MISSING'
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'pro3.crohost.net',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false
  },
  debug: true, // Logira sve
  logger: true
});

async function sendEmail(to, subject, html) {
  try {
    // Provjeri konekciju prije slanja
    await transporter.verify();
    console.log('SMTP connection verified');
    
    const result = await transporter.sendMail({
      from: `"JoleDrive" <${process.env.SMTP_USER}>`,
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
