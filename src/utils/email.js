const axios = require('axios');

const EMAIL_API_URL = process.env.EMAIL_API_URL || 'https://joledrive.com/api/send-email.php';

async function sendEmail(to, subject, html) {
  try {
    const toString = Array.isArray(to) ? to.join(', ') : to;
    
    console.log('Sending email via hosting API:', EMAIL_API_URL);
    console.log('To:', toString);
    console.log('Subject:', subject);

    const payload = {
      to: toString,
      subject: subject,
      html: html,
      from: process.env.SMTP_USER || 'info@joledrive.com'
    };
    
    console.log('Payload:', JSON.stringify(payload));

    const response = await axios.post(EMAIL_API_URL, payload, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      // Isključi transformaciju koja može uzrokovati probleme
      transformRequest: [(data) => JSON.stringify(data)]
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
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data));
    }
    return { success: false, error: error.message };
  }
}

module.exports = { sendEmail };
