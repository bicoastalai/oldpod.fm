/**
 * Podcast search/charts proxy.
 *
 * The iTunes Search API (`itunes.apple.com/search`) and the Apple Marketing
 * Tools charts feed don't send CORS headers, so the browser can't call them
 * directly. This function forwards their JSON unchanged (search/lookup result
 * shape: `{ resultCount, results: [...] }`) with a short CDN cache.
 *
 * Modes:
 *   GET /api/podcast-search?term=radiolab[&limit=25][&country=US]
 *     → iTunes podcast search results.
 *   GET /api/podcast-search?mode=top[&limit=25][&country=us]
 *     → top-charts podcasts: reads the Apple RSS charts for the ids, then
 *       batch-resolves them through `itunes.apple.com/lookup` so the response
 *       has the same shape as search results (including `feedUrl`).
 *
 * Classic Node `(req, res)` handler (the Web Request/Response export style is
 * not honored by this project's Vercel runtime — see apple-developer-token.ts).
 * No dependencies; types are declared inline so no @types/node is needed.
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const UPSTREAM_TIMEOUT_MS = 10_000;
const CACHE_SECONDS = 300;

/** Minimal shapes of Node's req/res so we don't need @types/node. */
interface NodeRequest {
  url?: string;
}
interface NodeResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk: string): void;
}

function send(res: NodeResponse, status: number, body: unknown, cacheSeconds = 0): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader(
    'cache-control',
    cacheSeconds > 0 ? `public, max-age=0, s-maxage=${cacheSeconds}` : 'no-store'
  );
  res.end(JSON.stringify(body));
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`upstream ${r.status}`);
    return (await r.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function clampLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(n));
}

/** Sanitise a country code to two letters (iTunes storefront). */
function countryParam(raw: string | null): string {
  return /^[a-zA-Z]{2}$/.test(raw ?? '') ? (raw as string).toLowerCase() : 'us';
}

async function topPodcasts(limit: number, country: string): Promise<unknown> {
  const chart = (await fetchJson(
    `https://rss.marketingtools.apple.com/api/v2/${country}/podcasts/top/${limit}/podcasts.json`
  )) as { feed?: { results?: Array<{ id?: unknown }> } };
  const ids = (chart.feed?.results ?? [])
    .map((r) => r?.id)
    .filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id));
  if (ids.length === 0) return { resultCount: 0, results: [] };
  // Batch lookup resolves chart ids → full search-shaped records with feedUrl.
  return fetchJson(
    `https://itunes.apple.com/lookup?id=${ids.join(',')}&media=podcast&country=${country}`
  );
}

export default async function handler(req: NodeRequest, res: NodeResponse): Promise<void> {
  const params = new URL(req.url ?? '/', 'https://internal').searchParams;
  const limit = clampLimit(params.get('limit'));
  const country = countryParam(params.get('country'));

  try {
    if (params.get('mode') === 'top') {
      send(res, 200, await topPodcasts(limit, country), CACHE_SECONDS);
      return;
    }

    const term = params.get('term')?.trim();
    if (!term) {
      send(res, 400, { error: 'Missing term' });
      return;
    }
    const upstream = await fetchJson(
      `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(term)}&limit=${limit}&country=${country}`
    );
    send(res, 200, upstream, CACHE_SECONDS);
  } catch {
    send(res, 502, { error: 'Podcast directory unavailable' });
  }
}
