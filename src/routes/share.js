const express = require('express');
const pool = require('../config/database');
const { authenticate } = require('../middleware/auth');
const crypto = require('crypto');
const router = express.Router();

// Cache za share tokene (u produkciji koristite Redis)
const shareTokens = new Map();

// Vrijeme isteka linka (7 dana)
const SHARE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// ============================================
// HELPER: Generiraj public URL za share
// ============================================
function generateShareUrl(req, token) {
  // Koristi env var ako postoji, inače dinamicki iz requesta
  const publicUrl = process.env.SHARE_PUBLIC_URL || process.env.PUBLIC_URL;
  
  if (publicUrl) {
    // Ako je postavljen PUBLIC_URL, koristi ga (npr. https://joledrive.com)
    return `${publicUrl}/share.php?token=${token}`;
  }
  
  // Fallback: dinamicki iz requesta (Railway URL)
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${protocol}://${host}/api/share/view/${token}`;
}

// ============================================
// POST /api/share/:type/:id - Generiraj share link
// type = 'document' | 'invoice'
// ============================================
router.post('/:type/:id', authenticate, async (req, res) => {
  try {
    const { type, id } = req.params;
    
    if (type !== 'document' && type !== 'invoice') {
      return res.status(400).json({ error: 'Invalid type. Use document or invoice' });
    }
    
    // Dohvati file_path iz baze
    let filePath, title;
    
    if (type === 'document') {
      const [docs] = await pool.execute(
        'SELECT file_path, title FROM documents WHERE id = ?',
        [id]
      );
      if (docs.length === 0) return res.status(404).json({ error: 'Document not found' });
      filePath = docs[0].file_path;
      title = docs[0].title;
    } else {
      const [invs] = await pool.execute(
        'SELECT file_path, invoice_number as title FROM invoices WHERE id = ?',
        [id]
      );
      if (invs.length === 0) return res.status(404).json({ error: 'Invoice not found' });
      filePath = invs[0].file_path;
      title = invs[0].title;
    }
    
    if (!filePath) {
      return res.status(400).json({ error: 'No file attached' });
    }
    
    // Generiraj token
    const token = crypto.randomBytes(16).toString('hex');
    
    // Spremi u cache
    shareTokens.set(token, {
      filePath,
      title,
      type,
      entityId: id,
      createdBy: req.user.id,
      createdAt: Date.now()
    });
    
    // Generiraj URL
    const shareUrl = generateShareUrl(req, token);
    
    res.json({
      success: true,
      shareUrl,
      token,
      title,
      expiresIn: '7 dana'
    });
    
  } catch (error) {
    console.error('Share error:', error);
    res.status(500).json({ error: 'Failed to generate share link' });
  }
});

// ============================================
// GET /api/share/view/:token - Javni pregled fajla
// Nema autentikacije - dostupno svima
// ============================================
router.get('/view/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const shareData = shareTokens.get(token);
    
    if (!shareData) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Link je istekao</title>
        <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;}
        .box{background:white;padding:40px;border-radius:16px;text-align:center;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:400px;margin:20px;}
        .icon{font-size:48px;margin-bottom:16px;}h2{color:#1f2937;margin-bottom:8px;}p{color:#6b7280;}</style>
        </head>
        <body>
          <div class="box">
            <div class="icon">🔗</div>
            <h2>Link nije važeći ili je istekao</h2>
            <p>Zatražite od pošiljatelja novi link.</p>
          </div>
        </body>
        </html>
      `);
    }
    
    // Provjeri istek
    if (Date.now() - shareData.createdAt > SHARE_EXPIRY_MS) {
      shareTokens.delete(token);
      return res.status(410).send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Link je istekao</title>
        <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh;}
        .box{background:white;padding:40px;border-radius:16px;text-align:center;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:400px;margin:20px;}
        .icon{font-size:48px;margin-bottom:16px;}h2{color:#1f2937;margin-bottom:8px;}p{color:#6b7280;}</style>
        </head>
        <body>
          <div class="box">
            <div class="icon">⏰</div>
            <h2>Link je istekao</h2>
            <p>Ovaj link je bio važeći 7 dana. Zatražite novi.</p>
          </div>
        </body>
        </html>
      `);
    }
    
    // Redirect na stvarni fajl
    const fileUrl = `https://joledrive.com${shareData.filePath}`;
    
    // Detektiraj tip fajla za inline pregled
    const ext = shareData.filePath.split('.').pop().toLowerCase();
    const isPDF = ext === 'pdf';
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    
    if (isPDF || isImage) {
      // Za PDF i slike - redirect na direktni fajl (browser će otvoriti inline)
      return res.redirect(fileUrl);
    } else {
      // Za ostale - stranica s preglednikom
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${shareData.title}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: #f3f4f6; }
            .header { background: white; padding: 16px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: space-between; }
            .header h1 { font-size: 16px; color: #1f2937; }
            .header .badge { background: #dbeafe; color: #1d4ed8; padding: 4px 12px; border-radius: 999px; font-size: 12px; }
            .content { max-width: 900px; margin: 24px auto; padding: 0 16px; }
            .preview-box { background: white; border-radius: 12px; padding: 48px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .file-icon { font-size: 64px; margin-bottom: 16px; }
            .file-name { font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 8px; }
            .file-type { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
            .btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; transition: all 0.2s; }
            .btn-primary { background: #2563eb; color: white; }
            .btn-primary:hover { background: #1d4ed8; }
            .btn-secondary { background: #f3f4f6; color: #374151; margin-left: 8px; }
            .btn-secondary:hover { background: #e5e7eb; }
            .footer { text-align: center; padding: 24px; color: #9ca3af; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📄 JoleDrive - Dijeljeni dokument</h1>
            <span class="badge">${ext.toUpperCase()}</span>
          </div>
          <div class="content">
            <div class="preview-box">
              <div class="file-icon">📎</div>
              <div class="file-name">${shareData.title}</div>
              <div class="file-type">Tip datoteke: ${ext.toUpperCase()}</div>
              <a href="${fileUrl}" class="btn btn-primary" download>⬇ Preuzmi datoteku</a>
              <a href="${fileUrl}" class="btn btn-secondary" target="_blank">👁 Otvori</a>
            </div>
          </div>
          <div class="footer">
            <p>Dokument je sigurno podijeljen putem JoleDrive sustava.</p>
          </div>
        </body>
        </html>
      `);
    }
    
  } catch (error) {
    console.error('Share view error:', error);
    res.status(500).send('<h2>Greška</h2>');
  }
});

// Cleanup starih tokena svakih 24h
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [token, data] of shareTokens) {
    if (now - data.createdAt > SHARE_EXPIRY_MS) {
      shareTokens.delete(token);
      cleaned++;
    }
  }
  if (cleaned > 0) console.log(`[SHARE] Očišćeno ${cleaned} isteklih tokena`);
}, 24 * 60 * 60 * 1000);

module.exports = router;
