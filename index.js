require('dotenv').config();

const requiredEnv = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_ID',
  'REDIS_URL',
  'GEMINI_API_KEY',
];

const missingEnv = requiredEnv.filter((name) => !process.env[name]);
if (missingEnv.length) {
  console.error(
    `Missing required environment variables: ${missingEnv.join(', ')}`
  );
  process.exit(1);
}
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { createClient } = require('redis');
const crypto = require('crypto');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3000;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Redis setup
const redis = createClient({ url: process.env.REDIS_URL });
redis.connect().catch(console.error);

// ✅ Stripe webhook - must come BEFORE express.json middleware
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
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

// ❗ JSON middleware comes AFTER webhook
app.use(cors());
app.use(express.json());

// 🔁 Create Stripe Checkout Session
app.post('/create-checkout-session', async (req, res) => {
  const { redis_key } = req.body;

  if (!redis_key) {
    return res.status(400).json({ error: 'Missing redis_key' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: 'https://your-app-domain.lovable.app/success',
      cancel_url: 'https://your-app-domain.lovable.app/cancel',
      metadata: {
        redis_key,
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('❌ Stripe session creation failed:', error.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// 🌐 Business Website Generator
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

// 🚀 Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
