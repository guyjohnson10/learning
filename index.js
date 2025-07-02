require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { createClient } = require('redis');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const redis = createClient({ url: process.env.REDIS_URL });
redis.connect().catch(console.error);

app.post('/business', async (req, res) => {
  const { business_name, business_type, phone_number } = req.body;

  if (!business_name || !business_type || !phone_number) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Create unique hash key
  const cacheKey = `site:${crypto
    .createHash('sha256')
    .update(`${business_name}-${business_type}-${phone_number}`)
    .digest('hex')}`;

  try {
    // Check Redis
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log('Cache hit!');
      res.set('Content-Type', 'text/html');
      return res.send(cached);
    }

    // Generate with Gemini
    const prompt = `Act as an expert web developer and copywriter. Generate the complete HTML code for a professional, single-page website for a ${business_type} named ${business_name}. The contact phone number is ${phone_number}. Use professional, royalty-free stock photos from unsplash.com as placeholders. The entire response must be ONLY the raw HTML code, starting with <!DOCTYPE html>.`;

    const geminiResponse = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',

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

    const html = geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!html || !html.startsWith('<!DOCTYPE html>')) {
      return res.status(500).json({ error: 'Unexpected response from Gemini' });
    }

    // Cache result
    await redis.set(cacheKey, html);

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('Gemini API Error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to generate content' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
