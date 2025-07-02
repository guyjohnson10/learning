require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/business', async (req, res) => {
  const { business_name, business_type, phone_number } = req.body;

  console.log('POST /business called with:', req.body);

  if (!business_name || !business_type || !phone_number) {
    console.error('Missing required fields');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is missing from environment!');
    return res.status(500).json({ error: 'Server misconfigured. No API key.' });
  }

  const prompt = `Act as an expert web developer and copywriter. Generate the complete HTML code for a professional, single-page website for a ${business_type} named ${business_name}. The contact phone number is ${phone_number}. Use professional, royalty-free stock photos from unsplash.com as placeholders. The entire response must be ONLY the raw HTML code, starting with <!DOCTYPE html>.`;

  try {
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent',
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
      console.error('Gemini response did not return valid HTML.');
      return res.status(500).json({ error: 'Gemini returned unexpected output' });
    }

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('Gemini API Error:', JSON.stringify(err?.response?.data || err.message || err, null, 2));

    // Optional fallback
    const fallbackHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>Fallback Site</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:2rem;">
        <h1>${business_name}</h1>
        <h2>(${business_type})</h2>
        <p>Call us: ${phone_number}</p>
        <p style="color:red;">⚠️ AI content failed to generate. This is a placeholder.</p>
      </body>
      </html>
    `;

    res.set('Content-Type', 'text/html');
    res.status(200).send(fallbackHtml);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log('🔑 GEMINI_API_KEY loaded:', !!process.env.GEMINI_API_KEY);
});
