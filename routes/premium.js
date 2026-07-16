const express = require('express');
const { getSubscriptionByDeviceId, isSubscriptionActive } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId query param is required' });
    }

    const subscription = await getSubscriptionByDeviceId(deviceId);
    if (!subscription) {
      return res.json({ premium: false });
    }

    res.json({
      premium: isSubscriptionActive(subscription),
      plan: subscription.plan,
      status: subscription.status,
      expires: subscription.current_period_end
    });
  } catch (err) {
    console.error('premium-status error:', err.message);
    res.status(500).json({ error: 'Could not check premium status' });
  }
});

module.exports = router;
