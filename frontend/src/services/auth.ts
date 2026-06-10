// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SPOTIFY_CLIENT_ID = (import.meta as any).env.VITE_SPOTIFY_CLIENT_ID as string;

function normalizeUri(uri: string): string {
  return uri.trim().replace(/\/$/, '');
}

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost';
}

/** Redirect URI sent to Spotify — must match the dashboard entry character-for-character. */
export function getSpotifyRedirectUri(): string {
  const origin = normalizeUri(window.location.origin);
  const fromEnv = (import.meta as any).env.VITE_SPOTIFY_REDIRECT_URI as string | undefined;
  if (!fromEnv?.trim()) return origin;

  const envUri = normalizeUri(fromEnv);
  // VITE_* is baked in at build time — don't send loopback URIs from a live deployment.
  if (isLoopbackHost(new URL(envUri).hostname) && !isLoopbackHost(window.location.hostname)) {
    return origin;
  }
  return envUri;
}

/** Shown on login when the user opened the app on a host Spotify will reject. */
export function getRedirectUriWarning(): string | null {
  const host = window.location.hostname;
  if (host === 'localhost') {
    return 'Use http://127.0.0.1:5173 — Spotify does not allow http://localhost redirect URIs.';
  }
  const fromEnv = (import.meta as any).env.VITE_SPOTIFY_REDIRECT_URI as string | undefined;
  if (fromEnv?.trim()) {
    try {
      const envHost = new URL(normalizeUri(fromEnv)).hostname;
      if (isLoopbackHost(envHost) && !isLoopbackHost(host)) {
        return 'Production is using this site’s URL for Spotify login (not 127.0.0.1). Add it in the Spotify dashboard.';
      }
    } catch {
      /* ignore malformed env */
    }
  }
  return null;
}

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-library-read',
  'user-follow-read',
  'user-top-read',
  'user-read-recently-played',
].join(' ');

// ── PKCE helpers ───────────────────────────────────────────

function randomBytes(len: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(len));
}

function base64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256(plain: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
  return new Uint8Array(buf);
}

export async function redirectToSpotifyLogin() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(await sha256(verifier));

  sessionStorage.setItem('pkce_verifier', verifier);

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: getSpotifyRedirectUri(),
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const verifier = sessionStorage.getItem('pkce_verifier');
  if (!verifier) throw new Error('No PKCE verifier found');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: getSpotifyRedirectUri(),
      code_verifier: verifier,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error);

  sessionStorage.removeItem('pkce_verifier');
  localStorage.setItem('spot_token', data.access_token);
  if (data.refresh_token) localStorage.setItem('spot_refresh', data.refresh_token);
  localStorage.setItem('spot_expires', String(Date.now() + data.expires_in * 1000));

  return data.access_token;
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('spot_refresh');
  if (!refreshToken) return null;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await res.json();
  if (data.error) return null;

  localStorage.setItem('spot_token', data.access_token);
  localStorage.setItem('spot_expires', String(Date.now() + data.expires_in * 1000));
  return data.access_token;
}

export function getStoredToken(): string | null {
  const token = localStorage.getItem('spot_token');
  const expires = parseInt(localStorage.getItem('spot_expires') ?? '0', 10);
  if (!token || Date.now() > expires - 60_000) return null;
  return token;
}

/**
 * True when a Spotify session exists (a live access token or a refresh token
 * we can exchange). Used for instant boot/switch decisions without a network
 * round-trip — an expired access token still counts as connected because
 * `refreshAccessToken` recovers it lazily.
 */
export function isSpotifyConnected(): boolean {
  return getStoredToken() !== null || localStorage.getItem('spot_refresh') !== null;
}

/**
 * Clear the stored Spotify session only. Deliberately does not touch other
 * providers' state (`source`, `apple_connected`, …) so sign-outs stay
 * per-provider.
 */
export function logout(): void {
  localStorage.removeItem('spot_token');
  localStorage.removeItem('spot_refresh');
  localStorage.removeItem('spot_expires');
  sessionStorage.removeItem('pkce_verifier');
}
