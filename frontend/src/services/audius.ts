/**
 * Audius data service for OldPod.fm.
 *
 * Audius is a free, open, login-less music network. This service implements the
 * browse/search side of `MusicProvider` (text search + a "Trending" default
 * list). Playback is NOT handled here — Audius streams plain audio through an
 * HTML5 `<audio>` element (see `hooks/useAudioPlayer.ts`), so the
 * `MusicPlayerController` methods are intentionally no-ops, mirroring the demo
 * service. App.tsx routes real playback by provider id.
 *
 * No API key or login is required; every request carries `app_name=OldPod.fm`.
 * A discovery host is resolved once per session from https://api.audius.co and
 * cached, with hard-coded fallbacks if discovery is unavailable.
 *
 * Example:
 *   const audius = createAudiusService();
 *   const tracks = await audius.search('lofi');
 *   // tracks[0].uri is a directly-playable stream URL.
 */
import { getProviderMeta } from './providers/registry';
import type {
  Album,
  MusicPlayerController,
  MusicProvider,
  Playlist,
  Track,
} from './providers/types';

export type AudiusService = MusicProvider & MusicPlayerController;

const APP_NAME = 'OldPod.fm';

// Stable production gateways used both as discovery seeds and as fallbacks if
// the discovery endpoint is unreachable.
const FALLBACK_HOSTS = ['https://api.audius.co', 'https://discoveryprovider.audius.co'];

let cachedHost: string | null = null;
let hostPromise: Promise<string> | null = null;

/** Shape of an Audius API track, kept loose — fields can be missing/null. */
interface AudiusTrack {
  id?: string;
  title?: string;
  duration?: number;
  user?: { name?: string; handle?: string };
  artwork?: Record<string, string> | null;
}

async function discoverHost(): Promise<string> {
  if (cachedHost) return cachedHost;
  if (hostPromise) return hostPromise;

  hostPromise = (async () => {
    try {
      const res = await fetch('https://api.audius.co');
      if (res.ok) {
        const json = (await res.json()) as { data?: unknown };
        const hosts = Array.isArray(json.data)
          ? json.data.filter((h): h is string => typeof h === 'string')
          : [];
        const candidate = hosts[0] ?? FALLBACK_HOSTS[0];
        cachedHost = candidate.replace(/\/$/, '');
        return cachedHost;
      }
    } catch {
      /* fall through to fallback */
    }
    cachedHost = FALLBACK_HOSTS[0];
    return cachedHost;
  })();

  try {
    return await hostPromise;
  } finally {
    hostPromise = null;
  }
}

/** Direct, redirect-following stream URL usable as an `<audio>` `src`. */
export function audiusStreamUrl(host: string, trackId: string): string {
  return `${host}/v1/tracks/${trackId}/stream?app_name=${APP_NAME}`;
}

function mapTrack(raw: AudiusTrack, host: string): Track | null {
  const id = typeof raw.id === 'string' ? raw.id : null;
  if (!id) return null;
  const artwork = raw.artwork ?? null;
  const albumArt =
    (artwork && (artwork['480x480'] || artwork['150x150'] || artwork['1000x1000'])) || null;
  const durationSec = typeof raw.duration === 'number' ? raw.duration : 0;
  return {
    id,
    // The stream URL doubles as the playback source for the audio element.
    uri: audiusStreamUrl(host, id),
    name: raw.title?.trim() || 'Untitled',
    artist: raw.user?.name?.trim() || raw.user?.handle?.trim() || 'Unknown artist',
    // Audius has no album concept.
    album: '',
    albumArt,
    durationMs: Math.max(0, Math.round(durationSec * 1000)),
  };
}

async function fetchTracks(path: string): Promise<Track[]> {
  const host = await discoverHost();
  const url = `${host}${path}${path.includes('?') ? '&' : '?'}app_name=${APP_NAME}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Audius request failed (${res.status})`);
  const json = (await res.json()) as { data?: unknown };
  const rows = Array.isArray(json.data) ? (json.data as AudiusTrack[]) : [];
  const out: Track[] = [];
  for (const row of rows) {
    const t = mapTrack(row, host);
    if (t) out.push(t);
  }
  return out;
}

export function createAudiusService(): AudiusService {
  const noTracks = async (): Promise<Track[]> => [];

  return {
    meta: getProviderMeta('audius')!,

    // Audius exposes no personal library or albums in this login-less mode.
    async getPlaylists(): Promise<Playlist[]> {
      return [];
    },
    getTracks: noTracks,
    async getAlbums(): Promise<Album[]> {
      return [];
    },
    getAlbumTracks: noTracks,
    // Surfaced in the Music menu as "Trending" (Audius has no listening history).
    getRecentlyPlayed: noTracks,

    async getTrending(): Promise<Track[]> {
      return fetchTracks('/v1/tracks/trending');
    },

    async search(query: string): Promise<Track[]> {
      const q = query.trim();
      if (!q) return [];
      return fetchTracks(`/v1/tracks/search?query=${encodeURIComponent(q)}`);
    },

    // Playback is handled by the HTML5 audio hook, routed by provider id, so the
    // controller surface is a no-op (kept to satisfy the shared service type).
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
