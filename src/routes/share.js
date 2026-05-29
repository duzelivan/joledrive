const express = require('express');
const crypto = require('crypto');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// ============================================
// KONFIGURACIJA
// ============================================
const ENCRYPTION_KEY = process.env.SHARE_ENCRYPTION_KEY 
  ? Buffer.from(process.env.SHARE_ENCRYPTION_KEY.padEnd(32, '!').slice(0, 32))
  : Buffer.from('JOLEDRIVE_DEFAULT_SHARE_KEY_2024!');
const IV_LENGTH = 16;
const SHARE_BASE_URL = process.env.SHARE_BASE_URL || 'https://joledrive.com/share.php';

// ============================================
// ENKRIPCIJA / DEŠIFRIRANJE
// ============================================
function encryptToken(payload) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + encrypted;
}

function decryptToken(token) {
  try {
    if (token.length < IV_LENGTH * 2) return null;
    const iv = Buffer.from(token.slice(0, IV_LENGTH * 2), 'hex');
    const encrypted = token.slice(IV_LENGTH * 2);
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('Token decrypt error:', err.message);
    return null;
  }
}

// ============================================
// KREIRAJ SHARE TOKEN (autenticiran)
// ============================================
router.post('/create', authenticate, async (req, res) => {
  try {
    const { type, id } = req.body;

    if (!type || !id) {
      return res.status(400).json({ error: 'Type and ID are required' });
    }

    if (!['document', 'invoice', 'vehicle', 'service'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }

    const token = encryptToken({ type, id: parseInt(id), ts: Date.now() });
    const shareUrl = `${SHARE_BASE_URL}?token=${encodeURIComponent(token)}`;

    res.json({ token, shareUrl });
  } catch (error) {
    console.error('Create share error:', error);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// ============================================
// PREGLEDAJ SHARE (javno, bez autentikacije)
// ============================================
router.get('/view/:token', async (req, res) => {
  try {
    const payload = decryptToken(req.params.token);

    if (!payload) {
      return res.status(400).send(renderErrorPage('Neispravan link', 'Token nije valjan ili je istekao.'));
    }

    // Token ističe nakon 2 dana
    const thirtyDaysMs = 2 * 24 * 60 * 60 * 1000;
    if (Date.now() - payload.ts > thirtyDaysMs) {
      return res.status(410).send(renderErrorPage('Link je istekao', 'Ovaj link za dijeljenje je istekao. Zatražite novi od pošiljatelja.'));
    }

    const { type, id } = payload;
    let data = null;

    // Dohvati podatke ovisno o tipu
    if (type === 'document') {
      const [docs] = await pool.execute(
        `SELECT d.*, v.manufacturer, v.model, v.license_plate, u.name as user_name
         FROM documents d
         LEFT JOIN vehicles v ON d.vehicle_id = v.id
         LEFT JOIN users u ON d.user_id = u.id
         WHERE d.id = ?`,
        [id]
      );
      data = docs[0] || null;
    } else if (type === 'invoice') {
      const [invs] = await pool.execute(
        `SELECT i.*, v.manufacturer, v.model, v.license_plate,
          COALESCE(SUM(p.amount), 0) as paid_amount
         FROM invoices i
         LEFT JOIN vehicles v ON i.vehicle_id = v.id
         LEFT JOIN invoice_payments p ON i.id = p.invoice_id
         WHERE i.id = ?
         GROUP BY i.id`,
        [id]
      );
      data = invs[0] || null;
    } else if (type === 'vehicle') {
      const [vehs] = await pool.execute(
        `SELECT v.*, u.name as assigned_name
         FROM vehicles v
         LEFT JOIN users u ON v.assigned_to = u.id
         WHERE v.id = ?`,
        [id]
      );
      data = vehs[0] || null;
    }

    if (!data) {
      return res.status(404).send(renderErrorPage('Nije pronađeno', 'Dokument, račun ili vozilo više ne postoji.'));
    }

    res.send(renderSharePage(type, data));
  } catch (error) {
    console.error('Share view error:', error);
    res.status(500).send(renderErrorPage('Greška', 'Došlo je do greške pri učitavanju.'));
  }
});

// ============================================
// DOWNLOAD SHARED FILE (javno)
// ============================================
router.get('/download/:token', async (req, res) => {
  try {
    const payload = decryptToken(req.params.token);
    if (!payload) return res.status(400).send('Invalid token');

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - payload.ts > thirtyDaysMs) {
      return res.status(410).send('Link expired');
    }

    const { type, id } = payload;
    let filePath = null;
    let title = '';

    if (type === 'document') {
      const [docs] = await pool.execute('SELECT title, file_path FROM documents WHERE id = ?', [id]);
      if (docs[0]) { filePath = docs[0].file_path; title = docs[0].title; }
    } else if (type === 'invoice') {
      const [invs] = await pool.execute('SELECT invoice_number, file_path FROM invoices WHERE id = ?', [id]);
      if (invs[0]) { filePath = invs[0].file_path; title = invs[0].invoice_number; }
    }

    if (!filePath) {
      return res.status(404).send('File not found');
    }

    // Redirect na stvarnu datoteku
    const fullUrl = `https://joledrive.com${filePath}`;
    res.redirect(fullUrl);
  } catch (error) {
    console.error('Share download error:', error);
    res.status(500).send('Error');
  }
});

// ============================================
// HTML RENDERERI
// ============================================
function renderErrorPage(title, message) {
  return `<!DOCTYPE html>
<html lang="hr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - JoleDrive</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;color:#1f2937}
    .box{background:#fff;padding:48px 32px;border-radius:16px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:420px;width:90%}
    .logo{font-size:28px;font-weight:800;color:#4f46e5;margin-bottom:24px}
    .icon{font-size:56px;margin-bottom:16px}
    h2{color:#dc2626;margin-bottom:12px;font-size:20px}
    p{color:#6b7280;line-height:1.6}
    .footer{margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af}
  </style>
</head>
<body>
  <div class="box">
    <div class="logo">JoleDrive</div>
    <div class="icon">⚠️</div>
    <h2>${title}</h2>
    <p>${message}</p>
    <div class="footer">JoleDrive d.o.o - Evidencija vozila</div>
  </div>
</body>
</html>`;
}

function formatDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('hr-HR');
}

function formatAmount(amount) {
  return parseFloat(amount || 0).toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function formatFileSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderSharePage(type, data) {
  const styles = `<style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#f3f4f6;color:#1f2937;line-height:1.6}
    .container{max-width:720px;margin:0 auto;padding:24px 16px}
    .logo{text-align:center;font-size:28px;font-weight:800;color:#4f46e5;margin-bottom:32px}
    .card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden}
    .header{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:28px 24px}
    .header h1{font-size:22px;margin-bottom:4px}
    .header .subtitle{opacity:0.9;font-size:14px}
    .body{padding:24px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    @media(max-width:480px){.grid{grid-template-columns:1fr}}
    .field{padding:12px;background:#f9fafb;border-radius:10px}
    .field-label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
    .field-value{font-size:15px;font-weight:600;color:#111827}
    .status-badge{display:inline-block;padding:4px 14px;border-radius:999px;font-size:12px;font-weight:600;margin-top:8px}
    .status-paid{background:#d1fae5;color:#065f46}
    .status-partial{background:#fef3c7;color:#92400e}
    .status-unpaid{background:#fee2e2;color:#991b1b}
    .actions{padding:20px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;display:flex;gap:12px;flex-wrap:wrap}
    .btn{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer;border:none;transition:opacity 0.2s}
    .btn:hover{opacity:0.9}
    .btn-primary{background:#4f46e5;color:#fff}
    .btn-green{background:#10b981;color:#fff}
    .btn-gray{background:#e5e7eb;color:#374151}
    .footer{text-align:center;padding:24px;font-size:12px;color:#9ca3af}
    .description{padding:16px 0;border-top:1px solid #e5e7eb;margin-top:16px}
    .description-label{font-size:12px;color:#6b7280;margin-bottom:6px}
    .file-section{padding:16px;background:#f0fdf4;border-radius:10px;margin-top:16px;display:flex;align-items:center;gap:16px}
    .file-icon{font-size:32px}
    .file-info{flex:1}
    .file-name{font-weight:600;margin-bottom:2px}
    .file-meta{font-size:12px;color:#6b7280}
  </style>`;

  let headerTitle = '';
  let headerSubtitle = '';
  let fieldsHtml = '';

  if (type === 'document') {
    headerTitle = data.title || 'Dokument';
    headerSubtitle = data.document_type ? data.document_type.toUpperCase() : 'DOKUMENT';

    fieldsHtml = `
      <div class="field"><div class="field-label">Vozilo</div><div class="field-value">${data.manufacturer ? `${data.manufacturer} ${data.model}` : '-'}</div></div>
      <div class="field"><div class="field-label">Korisnik</div><div class="field-value">${data.user_name || '-'}</div></div>
      <div class="field"><div class="field-label">Tip</div><div class="field-value">${data.document_type || '-'}</div></div>
      <div class="field"><div class="field-label">Veličina</div><div class="field-value">${formatFileSize(data.file_size)}</div></div>
      <div class="field"><div class="field-label">Datum</div><div class="field-value">${formatDate(data.created_at)}</div></div>
    `;
  } else if (type === 'invoice') {
    const isPaid = parseFloat(data.paid_amount || 0) >= parseFloat(data.amount || 0);
    const isPartial = !isPaid && parseFloat(data.paid_amount || 0) > 0;
    const statusClass = isPaid ? 'status-paid' : isPartial ? 'status-partial' : 'status-unpaid';
    const statusText = isPaid ? 'Plaćen' : isPartial ? 'Djelomično plaćen' : 'Neplaćen';
    const typeText = data.invoice_type === 'expense' ? 'Trošak' : 'Prihod';
    const typeColor = data.invoice_type === 'expense' ? '#dc2626' : '#059669';

    headerTitle = data.invoice_number || 'Račun';
    headerSubtitle = typeText.toUpperCase();

    fieldsHtml = `
      <div class="field"><div class="field-label">Iznos</div><div class="field-value" style="color:${typeColor}">${formatAmount(data.amount)}</div></div>
      <div class="field"><div class="field-label">Plaćeno</div><div class="field-value" style="color:#059669">${formatAmount(data.paid_amount)}</div></div>
      <div class="field"><div class="field-label">Preostalo</div><div class="field-value" style="color:#dc2626">${formatAmount(parseFloat(data.amount || 0) - parseFloat(data.paid_amount || 0))}</div></div>
      <div class="field"><div class="field-label">Status</div><div class="field-value"><span class="status-badge ${statusClass}">${statusText}</span></div></div>
      <div class="field"><div class="field-label">Vozilo</div><div class="field-value">${data.manufacturer ? `${data.manufacturer} ${data.model}` : '-'}</div></div>
      <div class="field"><div class="field-label">Dospijeće</div><div class="field-value">${formatDate(data.due_date)}</div></div>
    `;
  }

  const downloadBtn = data.file_path 
    ? `<a href="https://joledrive.com${data.file_path}" target="_blank" class="btn btn-green">📎 Preuzmi datoteku</a>`
    : '';

  const descriptionSection = data.description 
    ? `<div class="description"><div class="description-label">Opis</div><div>${data.description}</div></div>` 
    : '';

  return `<!DOCTYPE html>
<html lang="hr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headerTitle} - JoleDrive</title>
  ${styles}
</head>
<body>
  <div class="container">
    <div class="logo">JoleDrive</div>
    <div class="card">
      <div class="header">
        <h1>${headerTitle}</h1>
        <div class="subtitle">${headerSubtitle}</div>
      </div>
      <div class="body">
        <div class="grid">
          ${fieldsHtml}
        </div>
        ${descriptionSection}
        ${data.file_path ? `
        <div class="file-section">
          <div class="file-icon">📎</div>
          <div class="file-info">
            <div class="file-name">Priložena datoteka</div>
            <div class="file-meta">Kliknite "Preuzmi" za skidanje</div>
          </div>
        </div>` : ''}
      </div>
      <div class="actions">
        ${downloadBtn}
        <button onclick="window.print()" class="btn btn-gray">🖨️ Printaj</button>
      </div>
    </div>
    <div class="footer">JoleDrive d.o.o · Podijeljeno preko JoleDrive sustava · ${new Date().getFullYear()}</div>
  </div>
</body>
</html>`;
}

module.exports = router;
