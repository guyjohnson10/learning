require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const Redis = require('ioredis');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to Redis
const redis = new Redis(process.env.REDIS_URL);

app.use(cors());
app.use(express.json());

// Utility to hash user input into a Redis-safe key
function generateCacheKey({ business_name, business_type, phone_number }) {
  const raw = `${business_name}|${business_type}|${phone_number}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

app.post('/business', async (req, res) => {
  const { business_name, business_type, phone_number } = req.body;

  if (!business_name || !business_type || !phone_number) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY missing from environment');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const cacheKey = generateCacheKey(req.body);

  try {
    // 1. Check Redis
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log('✅ Cache hit:', cacheKey);
      return res.set('Content-Type', 'text/html').send(cached);
    }

    console.log('❌ Cache miss. Calling Gemini API...');

    const prompt = `Act as an expert web developer and copywriter. Generate the complete HTML code for a professional, single-page website for a ${business_type} named ${business_name}. The contact phone number is ${phone_number}. Use professional, royalty-free stock photos from unsplash.com as placeholders. The entire response must be ONLY the raw HTML code, starting with <!DOCTYPE html>.`;

    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      {
        contents: [{ parts: [{ text: prompt }] }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        }
      }
    );

    const html =
