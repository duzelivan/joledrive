const axios = require('axios');

const EMAIL_API_URL = process.env.EMAIL_API_URL || 'https://joledrive.com/api/send-email.php';
const EMAIL_API_SECRET = process.env.EMAIL_API_SECRET;

// VALIDACIJA: Secret mora postojati prije pokretanja
if (!EMAIL_API_SECRET) {
  console.error('========================================');
  console.error('FATAL: EMAIL_API_SECRET nije postavljen!');
  console.error('Postavi ga u Railway environment variables.');
  console.error('Aplikacija ne može slati emailove bez ovog.');
  console.error('========================================');
  // Ne zaustavljamo server, ali email će vraćati grešku
}

async function sendEmail(to, subject, html) {
  // Provjera konfiguracije
  if (!EMAIL_API_SECRET) {
    console.error('EMAIL_API_SECRET nije postavljen - email nije poslan');
    return { 
      success: false, 
      error: 'Email service not configured. Set EMAIL_API_SECRET in Railway.' 
    };
  }

  // Validacija ulaznih podataka
  if (!to || !subject || !html) {
    console.error('sendEmail: Missing required fields');
    return { success: false, error: 'Missing to, subject or html' };
  }

  try {
    const toString = Array.isArray(to) ? to.join(', ') : to;
    
    console.log('Sending email via hosting API:', EMAIL_API_URL);
    console.log('To:', toString);
    console.log('Subject:', subject);

    const payload = {
      to: toString,
      subject: subject,
      html: html,
      secret: EMAIL_API_SECRET  // ← KLJUČNO: šaljemo secret
    };

    const response = await axios.post(EMAIL_API_URL, payload, {
      timeout: 15000, // 15 sekundi
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Secret': EMAIL_API_SECRET  // ← DODATNA zaštita u headeru
      },
      transformRequest: [(data) => JSON.stringify(data)]
    });

    console.log('Email API response:', response.data);
    
    if (response.data && response.data.success) {
      return { 
        success: true, 
        messageId: response.data.messageId,
        recipients: response.data.recipients
      };
    } else {
      return { 
        success: false, 
        error: response.data?.error || 'Unknown error from email API' 
      };
    }
  } catch (error) {
    console.error('Email API error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data));
    }
    return { 
      success: false, 
      error: error.response?.data?.error || error.message || 'Failed to send email'
    };
  }
}

module.exports = { sendEmail };
