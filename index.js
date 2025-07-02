require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const cors = require('cors');
app.use(cors());
app.use(express.json());

app.post('/business', async (req, res) => {
  const { business_name, business_type, phone_number } = req.body;

  if (!business_name || !business_type || !phone_number) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const prompt = `Act as an expert web developer and copywriter. Generate the complete HTML code for a professional, single-page website for a ${business_type} named ${business_name}. The contact phone number is ${phone_number}. Use professional, royalty-free stock photos from unsplash.com as placeholders. The entire response must be ONLY the raw HTML code, starting with <!DOCTYPE html>.`;

  try {
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent'
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

    const html = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!html || !html.startsWith('<!DOCTYPE html>')) {
      return res.status(500).json({ error: 'Unexpected response from Gemini' });
    }

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
