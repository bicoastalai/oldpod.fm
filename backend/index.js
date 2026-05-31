const express = require('express');
const cors = require('cors');
const spotifyRouter = require('./routes/spotify');

const app = express();

app.use(cors());
app.use('/spotify', spotifyRouter);

const PORT = 3100;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));