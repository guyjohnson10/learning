const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// POST endpoint returning HTML
app.post('/business', (req, res) => {
  const html = '<!DOCTYPE html><html><head><title>Business</title></head><body><h1>Awesome Business</h1></body></html>';
  res.set('Content-Type', 'text/html');
  res.send(html);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});