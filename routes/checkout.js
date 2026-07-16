const express = require('express');
const Stripe = require('stripe');
const { findOrCreateUser } = require('../db');

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  annual: process.env.STRIPE_PRICE_YEARLY
};

router.post('/create-session', async (req, res) => {
  try {
    const { plan, deviceId, successUrl, cancelUrl } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }
    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return res.status(400).json({ error: 'plan must be "monthly" or "annual"' });
    }
    if (!successUrl || !cancelUrl) {
      return res.status(400).json({ error: 'successUrl and cancelUrl are required' });
    }

    await findOrCreateUser(deviceId);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: deviceId,
      success_url: successUrl,
      cancel_url: cancelUrl
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('checkout/create-session error:', err.message);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
});

module.exports = router;
