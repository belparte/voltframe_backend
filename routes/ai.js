const express = require('express');

const router = express.Router();

// This replaces the old VF_PROXY_URL role: the app's Anthropic API key
// lives here, server-side, and is never exposed to the client.
router.post('/messages', async (req, res) => {
  try {
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
    res.status(response.status).json(data);
  } catch (err) {
    console.error('AI proxy error:', err.message);
    res.status(500).json({ error: 'AI request failed' });
  }
});

module.exports = router;
