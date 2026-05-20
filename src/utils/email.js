const axios = require('axios');

const EMAIL_API_URL = process.env.EMAIL_API_URL || 'https://joledrive.com/api/send-email.php';

async function sendEmail(to, subject, html) {
  try {
    console.log('Sending email via hosting API:', EMAIL_API_URL);
    
    const response = await axios.post(EMAIL_API_URL, {
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      from: process.env.SMTP_USER || 'info@joledrive.com'
    }, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('Email API response:', response.data);
    
    if (response.data.success) {
      return { success: true, messageId: response.data.messageId };
    } else {
      return { success: false, error: response.data.error };
    }
  } catch (error) {
    console.error('Email API error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendEmail };
