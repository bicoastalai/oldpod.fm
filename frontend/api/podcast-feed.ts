/**
 * Podcast RSS feed proxy.
 *
 * Podcast feeds rarely send CORS headers, so the browser can't fetch them
 * directly. This function fetches the feed server-side and returns the raw
 * XML bytes untouched — the client parses them with the native `DOMParser`
 * (no XML parsing in Node, no dependencies).
 *
 *   GET /api/podcast-feed?url=<http(s) feed URL>
 *
 * Guards (this is otherwise an open proxy):
 *   - only http/https URLs, no localhost/private-network hosts;
 *   - redirects followed by fetch, 10s timeout, ~5MB response cap;
 *   - obvious non-feed content types (image/video/audio) are rejected;
 *   - content-type is passed through; no other upstream headers are echoed.
 *
 * Classic Node `(req, res)` handler (the Web Request/Response export style is
 * not honored by this project's Vercel runtime — see apple-developer-token.ts).
 */

const UPSTREAM_TIMEOUT_MS = 10_000;
const MAX_BYTES = 5 * 1024 * 1024; // ~5MB — generous for any sane RSS feed
const CACHE_SECONDS = 600;

/** Minimal shapes of Node's req/res so we don't need @types/node. */
interface NodeRequest {
  url?: string;
}
interface NodeResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk: string | Uint8Array): void;
}

function sendError(res: NodeResponse, status: number, message: string): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify({ error: message }));
}

/** Accept only public http(s) URLs — never internal/loopback addresses. */
function parseFeedUrl(raw: string | null): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host === '::1'
  ) {
    return null;
  }
  return url;
}

/** Read the body with a hard size cap, aborting the fetch if it's exceeded. */
async function readCapped(body: ReadableStream<Uint8Array>): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export default async function handler(req: NodeRequest, res: NodeResponse): Promise<void> {
  const params = new URL(req.url ?? '/', 'https://internal').searchParams;
  const feedUrl = parseFeedUrl(params.get('url'));
  if (!feedUrl) {
    sendError(res, 400, 'Invalid or missing feed url');
    return;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(feedUrl.toString(), {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { accept: 'application/rss+xml, application/xml, text/xml, */*' },
    });
    if (!upstream.ok || !upstream.body) {
      sendError(res, 502, `Feed fetch failed (${upstream.status})`);
      return;
    }

    const contentLength = Number(upstream.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BYTES) {
      sendError(res, 502, 'Feed too large');
      return;
    }
    const contentType = upstream.headers.get('content-type') ?? '';
    // Feeds come back as xml/rss/text (and occasionally octet-stream); media
    // types mean the URL isn't a feed — refuse to proxy them.
    if (/^(image|video|audio)\//i.test(contentType)) {
      sendError(res, 502, 'Not a feed');
      return;
    }

    const bytes = await readCapped(upstream.body);
    if (!bytes) {
      sendError(res, 502, 'Feed too large');
      return;
    }

    res.statusCode = 200;
    // Pass the upstream content-type (with its charset) through so the
    // browser decodes the bytes exactly as the publisher served them.
    res.setHeader('content-type', contentType || 'application/xml; charset=utf-8');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('cache-control', `public, max-age=0, s-maxage=${CACHE_SECONDS}`);
    res.end(bytes);
  } catch {
    sendError(res, 504, 'Feed fetch timed out');
  } finally {
    clearTimeout(timer);
  }
}
