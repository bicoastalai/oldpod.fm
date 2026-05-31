# # OldPod.fm

A classic iPod interface powered by Spotify. Built with React, TypeScript, and the Spotify Web Playback SDK.

-----

## What It Is

OldPod.fm recreates the 5th generation iPod experience in the browser. Click wheel navigation, retro LCD screen, album art, and full playback control, all wired to your Spotify account.

-----

## Features

- Authentic 5th gen iPod UI with white body and color LCD screen
- Functional click wheel with circular gesture detection
- Five-zone click wheel: Menu, Play/Pause, Next, Previous, Select
- iPod-style menu navigation: Music, Now Playing, Settings
- Retro LCD font on the screen
- Now Playing view: album art, track name, artist, progress bar
- Spotify playlist browsing via the Music menu
- Full playback control: play, pause, skip, seek, volume
- Spotify OAuth login on load

-----

## Tech Stack

**Frontend**

- React with TypeScript
- Vite
- Tailwind CSS

**Backend**

- Node.js with Express
- Spotify OAuth token exchange

**External**

- Spotify Web Playback SDK
- Spotify Web API

-----

## Requirements

- Spotify Premium account (required by the Web Playback SDK)
- Spotify Developer app credentials
- Node.js 18+

-----

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/bicoastalai/oldpod.fm.git
cd oldpod.fm
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Spotify credentials

Go to [developer.spotify.com](https://developer.spotify.com), create an app, and grab your Client ID and Client Secret.

Set your redirect URI to:

```
http://localhost:3001/callback
```

### 4. Create environment variables

Create a `.env` file in the root:

```
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=http://localhost:3001/callback
```

### 5. Run the backend

```bash
npm run server
```

Backend runs on port 3001.

### 6. Run the frontend

```bash
npm run dev
```

Frontend runs on port 5173. Open <http://localhost:5173>.

-----

## How It Works

1. Open the app in your browser
1. Log in with your Spotify account
1. Browse your playlists using the click wheel
1. Select a playlist and start listening
1. Control playback from the Now Playing screen

**Click wheel controls**

- Rotate clockwise: scroll down / volume up
- Rotate counterclockwise: scroll up / volume down
- Menu button: go back
- Center button: select
- Play/Pause: play or pause
- Next/Previous: skip tracks

-----

## Deployment

**Frontend:** Deploy to Vercel. Set environment variables in the Vercel dashboard.

**Backend:** Deploy to Railway. Add your environment variables in the Railway project settings. Update your Spotify redirect URI to match the Railway URL.

Update SPOTIFY_REDIRECT_URI in both your .env and your Spotify Developer dashboard when deploying.

-----

## Roadmap

- [ ] PWA support for home screen install
- [ ] Shuffle and repeat controls
- [ ] Search via click wheel
- [ ] Album browsing
- [ ] Dark mode / classic black iPod skin
- [ ] Recently played history

-----

## Legal

OldPod.fm is an independent project and is not affiliated with Apple or Spotify. iPod is a trademark of Apple Inc. This project does not use Apple’s trademarks or intellectual property. Spotify playback is handled entirely through the official Spotify Web Playback SDK under Spotify’s developer terms.

-----

## License

MIT