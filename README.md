# OldPod.fm

An iPod-style browser audio player for Apple Music, Audius, YouTube, Live Radio, Podcasts, Spotify, and Demo playback. Built with React, TypeScript, Vite, HTML5 audio, MusicKit, provider APIs, and small Vercel serverless functions where a browser needs help.

---

## What It Is

OldPod.fm recreates the 5th generation iPod experience in the browser: click wheel navigation, a retro LCD screen, album art, tactile feedback, lyrics, source switching, and full playback controls.

It is no longer a Spotify-only player. The first-run gate offers exactly three paths: **Listen Free**, **Spotify**, and **Apple Music**. Returning users skip the gate. You can connect multiple provider accounts, but only one source is active at a time; switch through **Main Menu → Sources**. There is no catalog merging.

**Listen Free** starts with Audius by default. YouTube, Demo, Live Radio, and Podcasts are also available from Sources without user login. Spotify and Apple Music are premium, logged-in sources with provider-specific setup.

---

## Features

- **iPod Classic** black aluminum skin (default) or original white 5th-gen look
- Functional click wheel with circular gesture detection (drag to scroll)
- Five-zone controls: Menu, Play/Pause, Next, Previous, Select
- iPod-style menu navigation
- **First-run gate** with Listen Free, Spotify, and Apple Music choices
- **Source switcher** under Main Menu → Sources; one active source at a time
- **Music browsing**: Playlists, Albums, Artists, Recently Played, search, and source-specific catalogs where available
- **Search** composed via the click wheel (on-screen keypad)
- **Now Playing**: album art or video, track info, progress bar, shuffle/repeat indicators, and source-specific playback behavior
- **Lyrics**: synced/plain lyrics via [LRCLib](https://lrclib.net) — press center on Now Playing
- **Shuffle and Repeat** (Off / All / One) controls in Settings
- **Tactile feedback**: synthesized iPod-like click sounds plus haptics where supported, with Settings toggles
- **Themes**: iPod Classic black (default) or white 5th-gen — Settings → Theme
- **PWA**: installable to your home screen, with the app shell available offline
- **Audius**: free, no-login indie catalog and the default Listen Free source
- **YouTube**: free, no-login search/trending playback through the official IFrame player when an API key is configured
- **Live Radio**: free, keyless station search and streaming through the Radio Browser API
- **Podcasts**: free, no-login podcast search through iTunes Search, RSS metadata proxying, and episode playback through HTML5 audio
- **Apple Music**: premium full-catalog playback via MusicKit JS and a serverless developer-token endpoint
- **Spotify**: premium playback via PKCE, Spotify Web API, and Web Playback SDK; currently best treated as a development-mode source
- **Demo**: built-in mock catalog — no login required

---

## Tech Stack

- React + TypeScript
- Vite
- Tailwind CSS
- HTML5 audio for browser-playable sources
- MusicKit JS + Vercel serverless developer-token function for Apple Music
- Spotify Web Playback SDK + Spotify Web API
- YouTube Data API v3 + YouTube IFrame Player API
- Audius API
- Radio Browser API
- iTunes Search API + RSS podcast proxy functions
- Vercel serverless functions in `frontend/api/`

---

## Requirements

- Node.js 18+
- For **Listen Free / Audius / Demo**: no provider account and no secrets
- For **Live Radio**: no login and no API key; network access is required for Radio Browser and live streams
- For **Podcasts**: no login and no secrets; network access is required for iTunes Search, RSS metadata, and episode audio
- For **YouTube**: `VITE_YOUTUBE_API_KEY` for YouTube Data API search/trending; playback uses the official IFrame player
- For **Apple Music**: Apple Developer Program access plus `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` for the serverless developer token
- For **Spotify**: Spotify Premium, a Spotify Developer app Client ID, and allowlisted users while the app is in Spotify Development Mode

> No Premium account? Choose **Listen Free** on first run. It starts on Audius, and you can switch to YouTube, Demo, Radio, or Podcasts from Sources.

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/bicoastalai/oldpod.fm.git
cd oldpod.fm
```

### 2. Install dependencies

The app lives in `frontend/`:

```bash
cd frontend
npm install
```

(Or from the repo root: `npm run install:all`.)

### 3. Create local env

Create `frontend/.env` (you can copy `frontend/.env.example`):

```bash
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
VITE_YOUTUBE_API_KEY=your_youtube_api_key_here

# Server-side only; needed for Apple Music when running through Vercel.
APPLE_TEAM_ID=your_10_char_team_id
APPLE_KEY_ID=your_10_char_music_key_id
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

All provider env vars are optional unless you want to use that source. Audius, Demo, Radio, and Podcasts require no secrets.

### 4. Run the dev server

```bash
npm run dev
```

Open **http://127.0.0.1:5173**. The port is fixed (`strictPort`) so it always matches Spotify's registered redirect URI when Spotify is configured.

Use `npm run dev` for the Vite app. Use `vercel dev` from `frontend/` when testing serverless endpoints locally, including Apple Music and the podcast metadata proxy.

### 5. (Optional) Enable Spotify — premium, Development Mode

Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard), create an app, and copy its **Client ID**. You do **not** need the client secret.

In the app's **Redirect URIs**, add this exact value:

```text
http://127.0.0.1:5173
```

> **Use `127.0.0.1`, not `localhost`.** Spotify's redirect-URI policy allows plain `http` only on loopback IP addresses (`127.0.0.1`), and browsers treat `127.0.0.1` as a secure context, which the Web Playback SDK requires.

Set `VITE_SPOTIFY_CLIENT_ID` in `frontend/.env`. Spotify Premium is required for real playback, and users must be allowlisted in the Spotify dashboard while the app remains in Development Mode.

### 6. (Optional) Enable YouTube — free, no login

YouTube is backed by the **YouTube Data API v3** for search/trending and the **YouTube IFrame Player API** for playback. Without a key the rest of the app works normally and YouTube shows a friendly not-configured message.

To turn it on:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create or pick a project.
2. Enable **YouTube Data API v3**.
3. Create an API key.
4. Restrict the key to HTTP referrers, such as:

   ```text
   https://oldpod.online/*
   https://www.oldpod.online/*
   http://127.0.0.1:5173/*
   http://localhost:5173/*
   ```

5. Add the key to `frontend/.env.local` or `.env`:

   ```bash
   VITE_YOUTUBE_API_KEY=your_youtube_api_key_here
   ```

For production, add the same `VITE_YOUTUBE_API_KEY` in **Vercel → Project → Settings → Environment Variables** and redeploy.

> **Quota note:** the YouTube Data API has a free quota of **10,000 units/day**. A `search` call costs about 100 units, so heavy searching can exhaust the daily quota. Other sources keep working when this happens.

> Playback is the official YouTube IFrame player, kept **visible** in Now Playing (the album-art region becomes the video) to comply with YouTube's Terms.

### 7. (Optional) Enable Apple Music — premium, logged-in

Apple Music is a premium, full-catalog source. It uses **MusicKit JS v3** in the browser for search, library, and playback, plus a serverless function (`api/apple-developer-token.ts`) to mint a short-lived, ES256-signed **developer token**. The signing key (`.p8`) is read only on the server and never reaches the browser.

How it degrades and plays:

- **No server secrets**: Apple Music shows a graceful not-configured state.
- **Subscriber**: full-catalog DRM playback through MusicKit.
- **Authorized but no subscription**: fallback to 30-second preview URLs when available.

Owner setup:

1. Apple Developer Program membership is required.
2. In the [Apple Developer portal](https://developer.apple.com/account), create a MusicKit identifier.
3. Create a MusicKit key, download the `.p8` file once, and note the **Key ID**.
4. Find your **Team ID** in Apple Developer membership details.
5. Set these in Vercel environment variables, unprefixed and never committed:

   ```bash
   APPLE_TEAM_ID=your_10_char_team_id
   APPLE_KEY_ID=your_10_char_music_key_id
   APPLE_PRIVATE_KEY=<contents of the .p8 file>
   ```

`APPLE_PRIVATE_KEY` accepts the raw PEM. If your environment mangles newlines, a base64 encoding of the PEM is also accepted. For local Apple Music testing, use `vercel dev`; plain Vite does not serve `/api/...`.

> **Token security:** the developer token is the only Apple value the browser ever sees, and it is a short-lived JWT minted on demand. The `.p8` private key, Team ID, and Key ID stay server-side in Vercel env vars.

### 8. Radio and Podcasts — free, no login

Live Radio uses the public Radio Browser API. It is keyless and account-free, but streams are live: there is no seeking or duration metadata.

Podcasts use iTunes Search plus two serverless endpoints: `api/podcast-search.ts` and `api/podcast-feed.ts`. They need no secrets. Episodes play through HTML5 audio, while the feed proxy helps with CORS and RSS metadata.

---

## How It Works

1. Open the app at `http://127.0.0.1:5173`.
2. On first run, choose **Listen Free**, **Spotify**, or **Apple Music**. Returning users skip this gate.
3. Browse the active source, or open **Main Menu → Sources** to switch between Audius, YouTube, Demo, Radio, Podcasts, Spotify, and Apple Music.
4. Select a track to start playback and land on **Now Playing**.
5. Press **center** on Now Playing or select to open **Lyrics** — lines highlight in sync when available.
6. Toggle **Shuffle**, **Repeat**, **Theme**, click sounds, and haptics in **Settings**.

The service worker keeps the PWA shell available offline, but it does not cache `/api/*`. Dynamic APIs and network playback sources still require a connection.

### Click wheel controls

- Drag clockwise: scroll down; on Now Playing, seek forward when the active source supports seeking
- Drag counterclockwise: scroll up; on Now Playing, seek backward when the active source supports seeking
- **Menu**: go back
- **Center**: select; on Now Playing opens **Lyrics**
- **Play/Pause**: toggle playback
- **Next / Previous**: skip tracks

Volume controls are hidden or limited on phones because mobile browsers restrict programmatic volume changes. Live radio streams do not support seeking or duration.

You can also click list items and on-screen keys directly with the mouse.

---

## Available Scripts

Run from `frontend/` (or use the matching root script):

- `npm run dev`: start the Vite dev server on `http://127.0.0.1:5173`
- `npm run build`: production build to `dist/`
- `npm run preview`: preview the production build locally

---

## Deployment (oldpod.online + Namecheap)

The app is a Vite build with Vercel serverless functions. **Vercel** is the simplest path to HTTPS for `oldpod.online` and deploys `frontend/api/*` alongside the app when the root directory is `frontend`.

### 1. Deploy on Vercel

1. Push this repo to GitHub, if it is not already there.
2. [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. **Root Directory:** `frontend`.
4. Framework preset: **Vite**. Defaults are fine: `npm run build`, output `dist`.
5. **Environment variables** (Production):
   - `VITE_SPOTIFY_CLIENT_ID` = your Spotify Client ID, if enabling Spotify
   - Do **not** set `VITE_SPOTIFY_REDIRECT_URI` — production uses the page origin.
   - `VITE_YOUTUBE_API_KEY` = optional YouTube Data API key
   - `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` = optional Apple Music server-side secrets
   - No secrets are needed for Audius, Demo, Radio, or Podcasts. The podcast functions deploy automatically and only proxy public search/feed metadata.
6. Deploy. You will get a `*.vercel.app` URL; confirm the app loads there first.

### 2. Attach oldpod.online in Vercel

1. Vercel project → **Settings → Domains**.
2. Add `oldpod.online` and `www.oldpod.online`.
3. Vercel shows the DNS records to create. For Namecheap, they are usually:
   - A Record: host `@`, value `76.76.21.21`
   - CNAME Record: host `www`, value `cname.vercel-dns.com`

Use the exact values Vercel displays if they differ.

### 3. Namecheap Advanced DNS

1. [Namecheap](https://www.namecheap.com) → **Domain List** → **oldpod.online** → **Manage** → **Advanced DNS**.
2. Delete the parking record if present: `CNAME` / `www` / `parkingpage.namecheap.com`.
3. Add the A and CNAME records from Vercel.
4. Leave unrelated records, such as SPF `TXT` for email, unless they conflict.
5. Wait 5–60 minutes for DNS to propagate. Vercel will show **Valid** when ready.

Optional: in Vercel, set `www.oldpod.online` to redirect to `oldpod.online` so you only need one Spotify redirect URI.

### 4. Spotify Developer Dashboard

[developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → your app → **Settings** → **Redirect URIs**:

```text
https://oldpod.online
http://127.0.0.1:5173
```

Add `https://www.oldpod.online` only if you use `www` without redirecting to apex.

Your Spotify user must still be listed under **User Management** while the app is in Development Mode.

### 5. Test

1. Open `https://oldpod.online` on your phone.
2. First-run gate should show **Listen Free**, **Spotify**, and **Apple Music**.
3. Choose **Listen Free** to confirm Audius playback, then use **Sources** to check any configured optional sources.

> **Note:** Web Playback works best in desktop Chrome. iPhone Safari may log in but fail to play Spotify audio — that is a platform limitation, not a DNS issue.

---

## Roadmap

- [x] Shuffle and repeat controls
- [x] Search via click wheel
- [x] Album browsing
- [x] Artist browsing
- [x] Recently played history
- [x] Dark mode / classic black iPod skin
- [x] PWA support for home screen install
- [x] Synced lyrics (LRCLib) on Now Playing
- [x] Haptics and synthesized click feedback
- [x] Audius as a free, no-login source
- [x] YouTube as a free, no-login source (Data API + IFrame player)
- [x] Live Radio through Radio Browser
- [x] Podcasts through iTunes Search, RSS proxying, and HTML5 audio
- [x] Apple Music (MusicKit JS + serverless developer-token endpoint)
- [ ] Shareable mixtapes
- [ ] Now Playing share cards
- [ ] Cover Flow album view
- [ ] Playlists and on-the-go playlist building

---

## Legal

OldPod.fm is an independent project and is not affiliated with Apple, Spotify, YouTube, Audius, Radio Browser, Apple Podcasts, or podcast publishers. iPod is a trademark of Apple Inc. The tactile click sound is synthesized by OldPod.fm and does not use Apple's original iPod click sound.

Spotify playback is handled through Spotify's official APIs and SDK under Spotify's developer terms. Apple Music playback is handled through Apple's official **MusicKit JS** under Apple's MusicKit terms, with Apple Music attribution shown in the app. YouTube playback uses the official IFrame player.

Privacy and Terms links live in **Settings**, not the first-run gate. The Privacy Policy and Terms are hosted on bicoastalai.com.

---

## License

MIT
