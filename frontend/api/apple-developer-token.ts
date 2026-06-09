/**
 * Apple Music developer-token endpoint (OldPod.fm's first serverless function).
 *
 * MusicKit JS needs a short-lived **developer token** — an ES256-signed JWT —
 * to configure the client. The signing key (`.p8`) must never reach the browser,
 * so this function mints the token server-side from Vercel environment variables
 * and returns only the signed JWT. The browser then calls `MusicKit.configure`
 * with it and obtains a separate Music User Token via `authorize()`.
 *
 * Runs on Vercel's Node runtime using the classic `(req, res)` signature
 * (typed inline so it needs no extra type dependencies; only `jose` is used,
 * for ES256 signing). The Web `Request`/`Response` default-export style is not
 * honored by this runtime — it invokes the export as a Node request listener,
 * ignores the returned `Response`, and the request hangs forever.
 *
 * Required environment variables (set in Vercel → Settings → Environment
 * Variables; never commit them):
 *   - APPLE_TEAM_ID     Apple Developer Team ID (the JWT `iss`).
 *   - APPLE_KEY_ID      MusicKit private key's Key ID (the JWT header `kid`).
 *   - APPLE_PRIVATE_KEY The MusicKit `.p8` contents (PEM). Base64 of the PEM is
 *                       also accepted, which avoids newline issues in some UIs.
 *
 * When any are absent the function returns 503 `{ error: "Apple Music not
 * configured" }` so the client degrades gracefully instead of crashing.
 */
import { importPKCS8, SignJWT } from 'jose';

// Minimal env accessor so the function needs no @types/node dependency.
declare const process: { env: Record<string, string | undefined> };

// Token validity window. Apple allows up to 6 months; a short window limits
// exposure if a minted token ever leaks. We re-sign well before expiry.
const TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12 hours
// Re-mint a little early so a cached token is never handed out near expiry.
const REFRESH_SKEW_SECONDS = 60 * 60; // 1 hour

interface CachedToken {
  token: string;
  /** Unix seconds at which we should stop serving this cached token. */
  serveUntil: number;
}

// Memoised within the (warm) function instance lifetime to avoid re-signing on
// every request. Cold starts simply re-sign once.
let cached: CachedToken | null = null;

/**
 * Normalise the configured private key. Accepts either the raw PEM (with
 * `-----BEGIN PRIVATE KEY-----` markers) or a base64 encoding of that PEM, and
 * repairs `\n`-escaped newlines that env UIs sometimes introduce.
 */
function normalizePrivateKey(raw: string): string {
  const value = raw.trim();
  if (value.includes('BEGIN PRIVATE KEY')) {
    return value.replace(/\\n/g, '\n');
  }
  // Not PEM as-is — assume base64 of the PEM.
  try {
    const decoded =
      typeof atob === 'function'
        ? atob(value)
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (globalThis as any).Buffer.from(value, 'base64').toString('utf8');
    if (decoded.includes('BEGIN PRIVATE KEY')) return decoded.replace(/\\n/g, '\n');
  } catch {
    /* fall through */
  }
  return value;
}

/** Minimal shape of Node's ServerResponse, so we don't need @types/node. */
interface NodeResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk: string): void;
}

function sendJson(res: NodeResponse, body: unknown, status: number, cacheSeconds = 0): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  if (cacheSeconds > 0) {
    // Let the CDN serve the token for most of its life without re-invoking us.
    res.setHeader('cache-control', `public, max-age=0, s-maxage=${cacheSeconds}`);
  } else {
    res.setHeader('cache-control', 'no-store');
  }
  res.end(JSON.stringify(body));
}

async function mintToken(
  teamId: string,
  keyId: string,
  privateKeyPem: string
): Promise<CachedToken> {
  const key = await importPKCS8(privateKeyPem, 'ES256');
  const nowSeconds = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + TOKEN_TTL_SECONDS)
    .sign(key);
  return { token, serveUntil: nowSeconds + TOKEN_TTL_SECONDS - REFRESH_SKEW_SECONDS };
}

export default async function handler(_req: unknown, res: NodeResponse): Promise<void> {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  const rawKey = process.env.APPLE_PRIVATE_KEY;

  if (!teamId || !keyId || !rawKey) {
    sendJson(res, { error: 'Apple Music not configured' }, 503);
    return;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cached && cached.serveUntil > nowSeconds) {
    const ttl = cached.serveUntil - nowSeconds;
    sendJson(res, { token: cached.token }, 200, ttl);
    return;
  }

  try {
    cached = await mintToken(teamId, keyId, normalizePrivateKey(rawKey));
    const ttl = Math.max(0, cached.serveUntil - nowSeconds);
    sendJson(res, { token: cached.token }, 200, ttl);
  } catch {
    // Don't leak signing internals to the client.
    sendJson(res, { error: 'Could not generate Apple Music token' }, 500);
  }
}
