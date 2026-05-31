const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3100/callback';

app.get('/login', (req, res) => {
  const scopes = 'streaming user-library-read';
  res.redirect(
    `https://accounts.spotify.com/authorize?`
    + new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: scopes,
    })
  );
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams({
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const data = await response.json();
  res.json(data);
});

const PORT = 3100;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));