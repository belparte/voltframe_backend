require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initSchema } = require('./db');
const checkoutRouter = require('./routes/checkout');
const webhookRouter = require('./routes/webhook');
const premiumRouter = require('./routes/premium');
const aiRouter = require('./routes/ai');

const app = express();

app.use(cors());

// The Stripe webhook needs the RAW request body to verify its signature,
// so this must be mounted before the global express.json() below.
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), webhookRouter);

app.use(express.json());

app.use('/api/checkout', checkoutRouter);
app.use('/api/premium-status', premiumRouter);
app.use('/api/ai', aiRouter);

app.get('/', (req, res) => {
  res.json({ status: 'VoltFrame backend running' });
});

const PORT = process.env.PORT || 3000;

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`VoltFrame backend listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database schema:', err.message);
    process.exit(1);
  });
