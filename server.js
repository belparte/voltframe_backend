require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
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

// Device IDs are client-generated and unauthenticated — the free-tier
// message cap in routes/ai.js counts per device ID, but nothing stops
// someone from generating unlimited device IDs to get unlimited free AI
// calls, each of which costs real Anthropic API spend. This caps requests
// per IP as a backstop the client can't route around.
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later.' }
});

app.use('/api/checkout', checkoutRouter);
app.use('/api/premium-status', premiumRouter);
app.use('/api/ai', aiLimiter, aiRouter);

app.get('/', (req, res) => {
  res.json({ status: 'VoltFrame backend running' });
});

// Stripe's success_url/cancel_url must be real https URLs — it rejects
// custom app schemes (voltframe://) outright. These two routes are the
// "fallback page" Stripe's own docs describe: a real HTTPS page that
// immediately redirects into the app's custom scheme, which Android's
// intent filter then intercepts.
function deepLinkRedirectPage(target) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<script>window.location.href = '${target}';</script>
</head><body style="font-family:sans-serif;text-align:center;padding-top:60px;color:#666">
<p>Returning to VoltFrame…</p>
<p><a href="${target}">Tap here if you're not redirected automatically.</a></p>
</body></html>`;
}

app.get('/checkout-success', (req, res) => {
  res.send(deepLinkRedirectPage('voltframe://premium-success'));
});

app.get('/checkout-cancel', (req, res) => {
  res.send(deepLinkRedirectPage('voltframe://premium-cancel'));
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
