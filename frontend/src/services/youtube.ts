/**
 * YouTube data service for OldPod.fm.
 *
 * YouTube is a free, login-less source backed by the YouTube Data API v3. This
 * service implements the browse/search side of `MusicProvider` (text search,
 * scoped to the Music category, plus a "Trending" default list from the
 * mostPopular chart). Playback is NOT handled here — videos play through the
 * YouTube IFrame Player API (see `hooks/useYouTubePlayer.ts`), so the
 * `MusicPlayerController` methods are intentionally no-ops, mirroring the Audius
 * and demo services. App.tsx routes real playback by provider id.
 *
 * The API key is read from `import.meta.env.VITE_YOUTUBE_API_KEY`. When it is
 * absent the service stays constructible and degrades gracefully: browse/search
 * throw a clear, non-technical "needs an API key" error that the existing
 * `describeDataError` pattern surfaces in the UI, rather than crashing the app
 * or blocking other sources.
 *
 * Example:
 *   const yt = createYouTubeService();
 *   const tracks = await yt.search('lofi');
 *   // tracks[0].id is the videoId the IFrame player loads.
 */
import { getProviderMeta } from './providers/registry';
import type {
  Album,
  MusicPlayerController,
  MusicProvider,
  Playlist,
  Track,
} from './providers/types';

export type YouTubeService = MusicProvider & MusicPlayerController;

const BASE = 'https://www.googleapis.com/youtube/v3';
// Category 10 is "Music" — keeps search/trending focused on songs.
const MUSIC_CATEGORY_ID = '10';
const MAX_RESULTS = 25;

/** User-facing message shown when no API key is configured. */
export const YOUTUBE_NO_KEY_MESSAGE = 'YouTube needs an API key (not configured).';

/** True when a YouTube Data API key is available in the environment. */
export function isYouTubeKeyConfigured(): boolean {
  return typeof import.meta.env.VITE_YOUTUBE_API_KEY === 'string' &&
    import.meta.env.VITE_YOUTUBE_API_KEY.length > 0;
}

// ── Loose API shapes (fields can be missing/null) ──────────

interface YtThumbnail {
  url?: string;
}
interface YtThumbnails {
  default?: YtThumbnail;
  medium?: YtThumbnail;
  high?: YtThumbnail;
  standard?: YtThumbnail;
  maxres?: YtThumbnail;
}
interface YtSnippet {
  title?: string;
  channelTitle?: string;
  thumbnails?: YtThumbnails;
}
interface YtSearchItem {
  id?: { videoId?: string };
  snippet?: YtSnippet;
}
interface YtVideoItem {
  id?: string;
  snippet?: YtSnippet;
  contentDetails?: { duration?: string };
  status?: { embeddable?: boolean };
}

// ── Helpers ────────────────────────────────────────────────

function requireKey(): string {
  const key = import.meta.env.VITE_YOUTUBE_API_KEY;
  if (typeof key !== 'string' || key.length === 0) throw new Error(YOUTUBE_NO_KEY_MESSAGE);
  return key;
}

/** Decode HTML entities YouTube returns in titles (e.g. "Doesn&#39;t", "Rock &amp; Roll"). */
function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
    if (code[0] === '#') {
      const isHex = code[1] === 'x' || code[1] === 'X';
      const num = isHex ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : match;
    }
    const named: Record<string, string> = {
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    };
    return named[code] ?? match;
  });
}

/** Parse an ISO-8601 duration (e.g. "PT3M14S") into milliseconds. */
function parseIsoDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const hours = /(\d+)H/.exec(iso);
  const mins = /(\d+)M/.exec(iso);
  const secs = /(\d+)S/.exec(iso);
  const total =
    (hours ? Number(hours[1]) : 0) * 3600 +
    (mins ? Number(mins[1]) : 0) * 60 +
    (secs ? Number(secs[1]) : 0);
  return total * 1000;
}

function bestThumbnail(thumbs: YtThumbnails | undefined): string | null {
  if (!thumbs) return null;
  return (
    thumbs.maxres?.url ||
    thumbs.standard?.url ||
    thumbs.high?.url ||
    thumbs.medium?.url ||
    thumbs.default?.url ||
    null
  );
}

function mapTrack(id: string, snippet: YtSnippet | undefined, durationMs: number): Track {
  return {
    id,
    uri: `youtube:video:${id}`,
    name: decodeEntities(snippet?.title?.trim() || '') || 'Untitled',
    artist: decodeEntities(snippet?.channelTitle?.trim() || '') || 'Unknown',
    // YouTube has no album concept for videos.
    album: '',
    albumArt: bestThumbnail(snippet?.thumbnails),
    durationMs,
  };
}

/**
 * Fetch + parse, translating HTTP failures into clear, non-technical messages
 * (routed through the existing `describeDataError` pattern, which passes plain
 * Error messages through unchanged).
 */
async function ytFetch(url: string): Promise<{ items?: unknown }> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('Could not reach YouTube — check your connection.');
  }
  if (!res.ok) {
    let reason = '';
    try {
      const body = (await res.json()) as {
        error?: { status?: string; errors?: Array<{ reason?: string }> };
      };
      reason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? '';
    } catch {
      /* body not JSON — fall through to status-based message */
    }
    if (res.status === 403) {
      if (/quota/i.test(reason)) {
        throw new Error("YouTube's daily limit was reached — try again later.");
      }
      throw new Error('YouTube API key is invalid or restricted.');
    }
    if (res.status === 400) {
      throw new Error('YouTube rejected the request — check the API key.');
    }
    throw new Error('YouTube request failed — try again.');
  }
  return (await res.json()) as { items?: unknown };
}

// Search results omit duration, so resolve it in a single batched videos call.
async function fetchDurations(ids: string[], key: string): Promise<Map<string, number>> {
  const url = `${BASE}/videos?part=contentDetails&id=${ids.join(',')}&key=${key}`;
  const json = await ytFetch(url);
  const map = new Map<string, number>();
  const items = Array.isArray(json.items) ? (json.items as YtVideoItem[]) : [];
  for (const it of items) {
    if (typeof it.id === 'string') map.set(it.id, parseIsoDuration(it.contentDetails?.duration));
  }
  return map;
}

// ── Service ────────────────────────────────────────────────

export function createYouTubeService(): YouTubeService {
  const noTracks = async (): Promise<Track[]> => [];

  return {
    meta: getProviderMeta('youtube')!,

    // YouTube exposes no personal library, albums or artists in this mode.
    async getPlaylists(): Promise<Playlist[]> {
      return [];
    },
    getTracks: noTracks,
    async getAlbums(): Promise<Album[]> {
      return [];
    },
    getAlbumTracks: noTracks,
    // Surfaced in the Music menu as "Trending" (YouTube has no listening history).
    getRecentlyPlayed: noTracks,

    async getTrending(): Promise<Track[]> {
      const key = requireKey();
      // `status` lets us drop non-embeddable videos (the chart can't pre-filter).
      const url =
        `${BASE}/videos?part=snippet,contentDetails,status&chart=mostPopular` +
        `&videoCategoryId=${MUSIC_CATEGORY_ID}&maxResults=${MAX_RESULTS}&regionCode=US&key=${key}`;
      const json = await ytFetch(url);
      const items = Array.isArray(json.items) ? (json.items as YtVideoItem[]) : [];
      const out: Track[] = [];
      for (const it of items) {
        if (typeof it.id !== 'string') continue;
        if (it.status?.embeddable === false) continue;
        out.push(mapTrack(it.id, it.snippet, parseIsoDuration(it.contentDetails?.duration)));
      }
      return out;
    },

    async search(query: string): Promise<Track[]> {
      const q = query.trim();
      if (!q) return [];
      const key = requireKey();
      // videoEmbeddable/videoSyndicated keep out videos that can't play in the
      // IFrame player (e.g. many official VEVO uploads disable embedding).
      const searchUrl =
        `${BASE}/search?part=snippet&type=video&videoCategoryId=${MUSIC_CATEGORY_ID}` +
        `&videoEmbeddable=true&videoSyndicated=true` +
        `&maxResults=${MAX_RESULTS}&q=${encodeURIComponent(q)}&key=${key}`;
      const json = await ytFetch(searchUrl);
      const items = Array.isArray(json.items) ? (json.items as YtSearchItem[]) : [];

      const ids: string[] = [];
      const snippetById = new Map<string, YtSnippet | undefined>();
      for (const it of items) {
        const id = it.id?.videoId;
        if (typeof id === 'string') {
          ids.push(id);
          snippetById.set(id, it.snippet);
        }
      }
      if (ids.length === 0) return [];

      const durations = await fetchDurations(ids, key);
      return ids.map((id) => mapTrack(id, snippetById.get(id), durations.get(id) ?? 0));
    },

    // Playback is handled by the IFrame player hook, routed by provider id, so
    // the controller surface is a no-op (kept to satisfy the shared type).
    async play() {},
    async pause() {},
    async resume() {},
    async next() {},
    async previous() {},
    async seek() {},
    async setVolume() {},
    async setShuffle() {},
    async setRepeat() {},
  };
}
