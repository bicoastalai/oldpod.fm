# OldPod.fm

A classic iPod interface powered by Spotify. Built with React, TypeScript, Vite, and the Spotify Web Playback SDK.

---

## What It Is

OldPod.fm recreates the 5th generation iPod experience in the browser. Click wheel navigation, retro LCD screen, album art, and full playback control, all wired to your Spotify account. There's also a **Demo Mode** so you can explore the whole interface without a Spotify account.

It's a **frontend-only** app: authentication uses Spotify's PKCE flow directly from the browser, so there is no backend and no client secret to manage.

---

## Features

- **iPod Classic** black aluminum skin (default) or original white 5th-gen look
- Functional click wheel with circular gesture detection (drag to scroll)
- Five-zone controls: Menu, Play/Pause, Next, Previous, Select
- iPod-style menu navigation
- **Music browsing**: Playlists, Albums, and Recently Played
- **Search** composed via the click wheel (on-screen keypad)
- **Now Playing**: album art (from Spotify), track info, progress bar, volume, shuffle/repeat indicators
- **Lyrics**: synced/plain lyrics via [LRCLib](https://lrclib.net) — press center on Now Playing
- **Shuffle and Repeat** (Off / All / One) controls in Settings
- **Themes**: iPod Classic black (default) or white 5th-gen — Settings → Theme
- **PWA**: installable to your home screen, works offline for the app shell
- **Demo Mode**: a built-in mock catalog — no login required
- **Free, no-login sources**: Audius (open indie catalog) and YouTube (huge catalog, real video) — no account needed
- Spotify login via PKCE (no client secret, no backend)

---

## Tech Stack

- React + TypeScript
- Vite
- Tailwind CSS
- Spotify Web Playback SDK + Spotify Web API

---

## Requirements

- **Spotify Premium** account (required by the Web Playback SDK for real playback)
- A Spotify Developer app (Client ID only — no secret needed)
- Node.js 18+

> No Premium account? Use **Demo Mode** from the login screen to explore the full UI with mock data.

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

### 3. Create a Spotify app

Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard), create an app, and copy its **Client ID**. You do **not** need the client secret.

In the app's **Redirect URIs**, add this exact value:

```
http://127.0.0.1:5173
```

> **Use `127.0.0.1`, not `localhost`.** Spotify's redirect-URI policy allows plain
> `http` only on loopback IP addresses (`127.0.0.1`), and browsers treat
> `127.0.0.1` as a secure context, which the Web Playback SDK requires. This is
> why no HTTPS/self-signed certificate is needed in development.

### 4. Add your Client ID

Create `frontend/.env` (you can copy `frontend/.env.example`):

```
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id_here
```

### 5. Run the dev server

```bash
npm run dev
```

Open **http://127.0.0.1:5173**. The port is fixed (`strictPort`) so it always
matches your registered redirect URI.

### 6. (Optional) Enable YouTube — free, no login

YouTube is a free, login-less source backed by the **YouTube Data API v3** for
search/trending and the **YouTube IFrame Player API** for playback. It is fully
optional: without a key the rest of the app works normally and YouTube simply
shows a friendly *"YouTube needs an API key (not configured)"* message.

To turn it on:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and
   create (or pick) a project.
2. **APIs & Services → Library →** enable **"YouTube Data API v3"**.
3. **APIs & Services → Credentials → Create credentials → API key.**
4. Restrict the key (recommended) → **Application restrictions → HTTP referrers**,
   and add:

   ```
   https://oldpod.online/*
   https://www.oldpod.online/*
   http://127.0.0.1:5173/*
   http://localhost:5173/*
   ```

   Optionally also restrict it under **API restrictions** to just *YouTube Data
   API v3*.
5. Add the key to `frontend/.env.local` (or `.env`):

   ```
   VITE_YOUTUBE_API_KEY=your_youtube_api_key_here
   ```

6. For production, add the same `VITE_YOUTUBE_API_KEY` in
   **Vercel → Project → Settings → Environment Variables** and redeploy.

> **Quota note:** the YouTube Data API has a free quota of **10,000 units/day**.
> A `search` call costs ~100 units, so heavy searching can exhaust the daily
> quota; when that happens YouTube shows *"YouTube's daily limit was reached —
> try again later."* and the other sources keep working.

> Playback is the official YouTube IFrame player, kept **visible** in Now Playing
> (the album-art region becomes the video) to comply with YouTube's Terms.

---

## How It Works

1. Open the app at `http://127.0.0.1:5173`.
2. Choose **Login with Spotify** (PKCE flow) or **Demo Mode**.
3. Browse **Music → Playlists / Albums / Recently Played**, or use **Search**.
4. Select a track to start playback and land on **Now Playing**.
5. Press **center** on Now Playing (or select) to open **Lyrics** — lines highlight in sync when available.
6. Toggle **Shuffle**, **Repeat**, and the **Theme** in **Settings**.

### Click wheel controls

- Drag clockwise: scroll down (volume up on Now Playing)
- Drag counterclockwise: scroll up (volume down on Now Playing)
- **Menu**: go back
- **Center**: select; on Now Playing opens **Lyrics**
- **Play/Pause**: toggle playback
- **Next / Previous**: skip tracks

You can also click list items and on-screen keys directly with the mouse.

---

## Available Scripts

Run from `frontend/` (or use the matching root script):

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server on `http://127.0.0.1:5173` |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |

---

## Deployment (oldpod.online + Namecheap)

The app is a static Vite build. **Vercel** is the simplest path to HTTPS for
`oldpod.online`.

### 1. Deploy on Vercel

1. Push this repo to GitHub (if it is not already).
2. [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. **Root Directory:** `frontend` (click Edit, set to `frontend`).
4. Framework preset: **Vite** (defaults are fine: `npm run build`, output `dist`).
5. **Environment variables** (Production):
   - `VITE_SPOTIFY_CLIENT_ID` = your Spotify Client ID
   - Do **not** set `VITE_SPOTIFY_REDIRECT_URI` — production uses the page origin.
6. Deploy. You will get a `*.vercel.app` URL; confirm the app loads there first.

### 2. Attach oldpod.online in Vercel

1. Vercel project → **Settings → Domains**.
2. Add `oldpod.online` and `www.oldpod.online`.
3. Vercel shows the DNS records to create. For Namecheap, they are usually:

| Type | Host | Value |
| --- | --- | --- |
| **A Record** | `@` | `76.76.21.21` |
| **CNAME Record** | `www` | `cname.vercel-dns.com` |

Use the exact values Vercel displays if they differ.

### 3. Namecheap Advanced DNS

1. [Namecheap](https://www.namecheap.com) → **Domain List** → **oldpod.online** → **Manage** → **Advanced DNS**.
2. **Delete** the parking record if present:
   - `CNAME` · `www` · `parkingpage.namecheap.com`
3. **Add** the A and CNAME records from Vercel (table above).
4. Leave unrelated records (e.g. SPF `TXT` for email) unless they conflict.
5. Wait 5–60 minutes for DNS to propagate. Vercel will show **Valid** when ready.

Optional: in Vercel, set `www.oldpod.online` to redirect to `oldpod.online` so
you only need one Spotify redirect URI.

### 4. Spotify Developer Dashboard

[developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → your app → **Settings** → **Redirect URIs**:

```
https://oldpod.online
http://127.0.0.1:5173
```

Add `https://www.oldpod.online` only if you use `www` without redirecting to apex.

Your Spotify user must still be listed under **User Management** (Development Mode).

### 5. Test

1. Open `https://oldpod.online` on your phone.
2. Login screen should show redirect URI `https://oldpod.online`.
3. **Connect with Spotify** → browse playlists → play a track.

> **Note:** Web Playback works best in desktop Chrome. iPhone Safari may log in
> but fail to play audio — that is a platform limitation, not a DNS issue.

---

## Roadmap

- [x] Shuffle and repeat controls
- [x] Search via click wheel
- [x] Album browsing
- [x] Recently played history
- [x] Dark mode / classic black iPod skin
- [x] PWA support for home screen install
- [x] Synced lyrics (LRCLib) on Now Playing
- [x] Audius as a free, no-login source
- [x] YouTube as a free, no-login source (Data API + IFrame player)
- [ ] Artist browsing
- [ ] Cover Flow album view
- [ ] Genius-style on-the-go playlists

---

## Legal

OldPod.fm is an independent project and is not affiliated with Apple or Spotify. iPod is a trademark of Apple Inc. This project does not use Apple's trademarks or intellectual property. Spotify playback is handled entirely through the official Spotify Web Playback SDK under Spotify's developer terms.

---

## License

MIT
