require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { createClient } = require('redis');
const crypto = require('crypto');
const Stripe = require('stripe');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Redis setup
const redis = createClient({ url: process.env.REDIS_URL });
redis.connect().catch(console.error);

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.raw({ type: 'application/json' })); // Needed for Stripe webhooks

// Website generation endpoint
app.post('/business', async (req, res) => {
  const { business_name, business_type, phone_number } = req.body;

  if (!business_name || !business_type || !phone_number) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const cacheKey = `site:${crypto
    .createHash('sha256')
    .update(`${business_name}-${business_type}-${phone_number}`)
    .digest('hex')}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log('✅ Cache hit');
      res.set('Content-Type', 'text/html');
      return res.send(cached);
    }

    const prompt = `Act as an expert web developer and copywriter. Generate the complete HTML code for a professional, single-page website for a ${business_type} named ${business_name}. The contact phone number is ${phone_number}. Use professional, royalty-free stock photos from unsplash.com as placeholders. The entire response must be ONLY the raw HTML code, starting with <!DOCTYPE html>.`;

    const geminiResponse = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-002:generateContent',
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
      }
    );

    const content = geminiResponse.data?.candidates?.[0]?.content;
    const html = content?.parts?.[0]?.text || content?.text;

    if (!html || !html.includes('<!DOCTYPE html>')) {
      console.error('❌ Unexpected Gemini response:', JSON.stringify(geminiResponse.data, null, 2));
      return res.status(500).json({ error: 'Unexpected response from Gemini' });
    }

    await redis.set(cacheKey, html);

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('Gemini API Error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

// Stripe webhook
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const redisKey = session.metadata?.redis_key;

    if (!redisKey) {
      console.error('❌ No redis_key found in metadata');
    } else {
      console.log(`✅ PAYMENT SUCCESS: Site [${redisKey}] is ready to be published.`);
    }
  }

  res.json({ received: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});