# OldPod.fm — Privacy Policy

_Last updated: June 8, 2026 • Draft for review (not legal advice — have counsel review before publishing)_

OldPod.fm ("OldPod", "we", "us") is a free, browser-based music player with a
classic iPod-style interface. This policy explains what we do — and mostly don't
do — with your data.

## The short version
OldPod is a **client-side app**. We do not run user accounts, and we do not
operate a database of your personal information. Most data stays in your own
browser. When you connect a music service, you authenticate directly with that
service and we only hold the resulting access token locally to make the app work.

## What we collect

- **Music-service authentication tokens.** When you sign in to a provider
  (e.g. Spotify or Apple Music), the provider issues an access/refresh token.
  These are stored **locally in your browser** (`localStorage`/`sessionStorage`)
  so the app can play music and read your library. They are not transmitted to
  or stored on our servers.
- **Local preferences.** Your selected source, theme, and demo flag are stored
  locally in your browser.
- **No analytics / no tracking / no advertising.** We do not embed third-party
  trackers, advertising SDKs, or sell data. We do not build user profiles.

## Limited server processing
OldPod is otherwise static, with one exception: small **serverless functions**
that mint short-lived developer tokens required by some providers (for example,
signing an Apple Music developer token, or issuing a SoundCloud application
token). These functions:

- run on demand and **do not store your personal data**;
- never receive or store your music-service password;
- exist only to keep provider API secrets off the client.

## Third-party services
When you use a connected source, your use is also governed by that provider's
own terms and privacy policy, including:

- **Spotify** — playback and library access via the Spotify Web API / Web
  Playback SDK.
- **Apple Music** — playback and catalog/library access via Apple MusicKit.
- **Audius** — open, login-free catalog.
- **YouTube** — search and playback via the YouTube Data API and IFrame Player
  (your use is subject to the YouTube Terms of Service and Google Privacy Policy).
- **SoundCloud** — search and playback via the SoundCloud API.
- **LRCLIB** — song lyrics, matched by track metadata.

We are not responsible for the content or data practices of these providers.

## Data retention & deletion
Because tokens and preferences live in your browser, you can remove them at any
time by using **Settings → Sign Out** (which clears stored tokens) or by clearing
your browser's site data for OldPod.fm.

## Children
OldPod is not directed to children under 13 (or the minimum age required by your
jurisdiction) and we do not knowingly collect their data.

## Changes
We may update this policy; material changes will be reflected by the "Last
updated" date above.

## Contact
Questions: **privacy@bicoastalai.com** (update to your preferred address).
