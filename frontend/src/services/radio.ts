/**
 * Live radio service for OldPod.fm, backed by the open Radio Browser API
 * (https://api.radio-browser.info) — no key, no login, CORS-friendly.
 *
 * Implements the browse/search side of `MusicProvider`: text search plus a
 * "Trending" list of the most-listened stations. Stations map onto the app's
 * normalized `Track` shape (station name as title, country/genre tags as the
 * artist line, favicon as artwork, `url_resolved` as a directly-playable
 * stream URL with `durationMs: 0` — live streams have no duration). Playback
 * goes through the shared HTML5 `<audio>` engine (`hooks/useAudioPlayer.ts`),
 * routed by provider id in App.tsx, so the `MusicPlayerController` surface is
 * a no-op like Audius/demo.
 *
 * An API host is resolved once per session from the project's server list and
 * cached, with hard-coded fallbacks — mirroring the Audius host discovery.
 * Quality filters: `hidebroken=true`, `lastcheckok === 1`, and HTTPS-only
 * stream URLs (mixed content is blocked on the https site).
 *
 * Example:
 *   const radio = createRadioService();
 *   const stations = await radio.search('jazz');
 *   // stations[0].uri is a live stream URL playable in an <audio> element.
 */
import { getProviderMeta } from './providers/registry';
import type {
  Album,
  MusicPlayerController,
  MusicProvider,
  Playlist,
  Track,
} from './providers/types';

export type RadioService = MusicProvider & MusicPlayerController;

// Stable public mirrors used when the server-list lookup is unreachable.
const FALLBACK_HOSTS = [
  'https://de1.api.radio-browser.info',
  'https://fi1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

const STATION_LIMIT = 50;

let cachedHost: string | null = null;
let hostPromise: Promise<string> | null = null;

/** Shape of a Radio Browser station, kept loose — fields can be missing. */
interface RadioStation {
  stationuuid?: string;
  name?: string;
  url_resolved?: string;
  favicon?: string;
  country?: string;
  tags?: string;
  lastcheckok?: number;
}

async function discoverHost(): Promise<string> {
  if (cachedHost) return cachedHost;
  if (hostPromise) return hostPromise;

  hostPromise = (async () => {
    try {
      // `all.api...` resolves to a random mirror; ask it for the full server
      // list and pick one at random, per the API's load-balancing etiquette.
      const res = await fetch('https://all.api.radio-browser.info/json/servers');
      if (res.ok) {
        const json = (await res.json()) as unknown;
        const names = Array.isArray(json)
          ? (json as Array<{ name?: unknown }>)
              .map((s) => s?.name)
              .filter((n): n is string => typeof n === 'string' && n.length > 0)
          : [];
        if (names.length > 0) {
          cachedHost = `https://${names[Math.floor(Math.random() * names.length)]}`;
          return cachedHost;
        }
      }
    } catch {
      /* fall through to fallback */
    }
    cachedHost = FALLBACK_HOSTS[Math.floor(Math.random() * FALLBACK_HOSTS.length)];
    return cachedHost;
  })();

  try {
    return await hostPromise;
  } finally {
    hostPromise = null;
  }
}

function mapStation(raw: RadioStation): Track | null {
  const id = typeof raw.stationuuid === 'string' ? raw.stationuuid : null;
  const url = typeof raw.url_resolved === 'string' ? raw.url_resolved.trim() : '';
  // HTTPS-only: http streams are blocked as mixed content on the https site.
  if (!id || !url.startsWith('https://')) return null;
  if (raw.lastcheckok !== 1) return null;

  const tags = (raw.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  const detail = [raw.country?.trim(), tags].filter(Boolean).join(' · ');
  const favicon = raw.favicon?.startsWith('https://') ? raw.favicon : null;

  return {
    id,
    // The resolved stream URL doubles as the <audio> playback source.
    uri: url,
    name: raw.name?.trim() || 'Unknown station',
    artist: detail || 'Live radio',
    album: '',
    albumArt: favicon,
    // Live streams have no duration; the UI treats 0 as "live" (no progress
    // percentage, no remaining time, seek disabled).
    durationMs: 0,
  };
}

async function fetchStations(query: string): Promise<Track[]> {
  const host = await discoverHost();
  const params = new URLSearchParams({
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true',
    limit: String(STATION_LIMIT),
  });
  if (query) params.set('name', query);
  const res = await fetch(`${host}/json/stations/search?${params.toString()}`);
  if (!res.ok) throw new Error(`Radio Browser request failed (${res.status})`);
  const rows = (await res.json()) as RadioStation[];
  const out: Track[] = [];
  const seen = new Set<string>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const t = mapStation(row);
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

/**
 * Radio Browser etiquette: register a click when a station starts playing so
 * its popularity ranking stays meaningful. Fire-and-forget — failures are
 * irrelevant to playback (and browsers can't set a custom User-Agent).
 */
export function reportStationClick(stationUuid: string): void {
  void (async () => {
    try {
      const host = await discoverHost();
      await fetch(`${host}/json/url/${encodeURIComponent(stationUuid)}`, { method: 'POST' });
    } catch {
      /* best-effort only */
    }
  })();
}

export function createRadioService(): RadioService {
  const noTracks = async (): Promise<Track[]> => [];

  return {
    meta: getProviderMeta('radio')!,

    // Radio has no personal library, playlists, albums or history.
    async getPlaylists(): Promise<Playlist[]> {
      return [];
    },
    getTracks: noTracks,
    async getAlbums(): Promise<Album[]> {
      return [];
    },
    getAlbumTracks: noTracks,
    getRecentlyPlayed: noTracks,

    // Surfaced in the Music menu as "Trending": the most-listened stations.
    async getTrending(): Promise<Track[]> {
      return fetchStations('');
    },

    async search(query: string): Promise<Track[]> {
      const q = query.trim();
      if (!q) return [];
      return fetchStations(q);
    },

    // Playback is handled by the HTML5 audio hook, routed by provider id, so
    // the controller surface is a no-op (kept to satisfy the service type).
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
