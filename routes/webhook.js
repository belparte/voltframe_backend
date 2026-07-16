const express = require('express');
const Stripe = require('stripe');
const {
  pool,
  findOrCreateUser,
  upsertSubscription,
  getSubscriptionByStripeCustomerId
} = require('../db');

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// NOTE: this route must receive the RAW request body, not JSON-parsed.
// See server.js — express.raw() is mounted on this path before express.json().
router.post('/', async (req, res) => {
  let event;
  try {
    const signature = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const deviceId = session.client_reference_id;
        if (!deviceId) break;

        const user = await findOrCreateUser(deviceId);
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const item = subscription.items.data[0];
        const plan = item?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly';

        await upsertSubscription({
          userId: user.id,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          plan,
          status: subscription.status,
          currentPeriodEnd: new Date(item.current_period_end * 1000)
        });
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const existing = await getSubscriptionByStripeCustomerId(subscription.customer);
        if (!existing) break;

        const item = subscription.items.data[0];
        const plan = item?.price?.recurring?.interval === 'year' ? 'annual' : 'monthly';
        await upsertSubscription({
          userId: existing.user_id,
          stripeCustomerId: subscription.customer,
          stripeSubscriptionId: subscription.id,
          plan,
          status: event.type === 'customer.subscription.deleted' ? 'canceled' : subscription.status,
          currentPeriodEnd: new Date(item.current_period_end * 1000)
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const existing = await getSubscriptionByStripeCustomerId(invoice.customer);
        if (!existing) break;

        await pool.query(
          `UPDATE subscriptions SET status = 'past_due', updated_at = now() WHERE id = $1`,
          [existing.id]
        );
        break;
      }

      default:
        // Unhandled event types are fine to ignore.
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

module.exports = router;
