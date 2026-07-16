const express = require('express');
const { findOrCreateUser, isDevicePremium, getAiUsage, incrementAiUsage } = require('../db');

const router = express.Router();

const FREE_AI_MESSAGE_LIMIT = 10;

// This replaces the old VF_PROXY_URL role: the app's Anthropic API key
// lives here, server-side, and is never exposed to the client.
//
// Premium status and free-tier usage are both checked HERE, server-side,
// using deviceId — not trusted from the client's local cache. This closes
// the gap where a tampered client-side flag could get unlimited AI calls
// (which cost real money) for free.
router.post('/v1/messages', async (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) {
      return res.status(400).json({ error: 'x-device-id header is required' });
    }

    await findOrCreateUser(deviceId);
    const premium = await isDevicePremium(deviceId);

    if (!premium) {
      const used = await getAiUsage(deviceId);
      if (used >= FREE_AI_MESSAGE_LIMIT) {
        return res.status(403).json({
          error: 'free_limit_reached',
          message: `Free tier includes ${FREE_AI_MESSAGE_LIMIT} AI messages. Upgrade to Premium for unlimited access.`
        });
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    if (response.ok && !premium) {
      await incrementAiUsage(deviceId);
    }

    res.status(response.status).json(data);
  } catch (err) {
    console.error('AI proxy error:', err.message);
    res.status(500).json({ error: 'AI request failed' });
  }
});

module.exports = router;
