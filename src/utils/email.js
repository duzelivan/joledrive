const axios = require('axios');

const EMAIL_API_URL = process.env.EMAIL_API_URL || 'https://joledrive.com/api/send-email.php';

async function sendEmail(to, subject, html) {
  try {
    // Pretvori array u string (comma-separated)
    const toString = Array.isArray(to) ? to.join(', ') : to;
    
    console.log('Sending email via hosting API:', EMAIL_API_URL);
    console.log('To:', toString);
    
    const response = await axios.post(EMAIL_API_URL, {
      to: toString,           // Sada šaljemo string, ne array
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
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Status:', error.response.status);
    }
    return { success: false, error: error.message };
  }
}

module.exports = { sendEmail };
