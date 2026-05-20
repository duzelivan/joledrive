const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
require('dotenv').config();

const app = express();

// ⚠️ KLJUČNO: Trust proxy PRIJE helmet i rateLimit
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: ['https://joledrive.com', 'https://www.joledrive.com', 'http://localhost:3000', 'http://localhost:4173'],
  credentials: true
}));

// Rate limiting — sada neće crashati
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static('uploads'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/services', require('./routes/services'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/warehouse', require('./routes/warehouse'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/notifications', require('./routes/notifications')); // NOVO - email obavijesti
app.use('/api/settings', require('./routes/settings')); // NOVO - postavke aplikacije

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Automatski cron job - svaki dan u 8:00
cron.schedule('0 8 * * *', async () => {
  console.log('Running daily email reminders...');
  try {
    // Interni API poziv za slanje obavijesti
    const response = await fetch(`http://localhost:${process.env.PORT || 5000}/api/notifications/send-reminders`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.INTERNAL_API_TOKEN || 'dev-token'}`
      }
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('Daily reminders result:', result.message);
    } else {
      console.error('Daily reminders failed:', response.status);
    }
  } catch (error) {
    console.error('Cron job error:', error.message);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`JoleDrive API running on port ${PORT}`);
});
