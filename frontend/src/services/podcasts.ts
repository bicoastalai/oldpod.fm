/**
 * Podcasts service for OldPod.fm — iTunes Search directory + RSS feeds.
 *
 * Browsing is collection-shaped: a search (or the "Top Podcasts" chart)
 * returns *shows* mapped onto the app's `Album` type, and selecting a show
 * drills into its episode list (`getAlbumTracks`), exactly like album →
 * tracks. Episodes map to `Track`s whose `uri` is the MP3 enclosure URL,
 * played through the shared HTML5 `<audio>` engine (seek works — plain HTTP
 * range requests).
 *
 * Both upstreams block browser CORS, so requests go through two serverless
 * proxies (see `frontend/api/`):
 *   - /api/podcast-search  — iTunes search + top charts (JSON passthrough);
 *   - /api/podcast-feed    — raw RSS XML passthrough, parsed here with the
 *     native `DOMParser` (no XML parsing on the server, no dependencies).
 *
 * Show mapping: `Album.uri` carries the RSS feed URL — it's the only handle
 * needed to resolve episodes. Episode mapping: title, pubDate as the detail
 * line, `<enclosure url>` as the stream URL, `<itunes:duration>` parsed from
 * `HH:MM:SS` / `MM:SS` / plain seconds. Newest first, capped at 50.
 *
 * Example:
 *   const podcasts = createPodcastsService();
 *   const shows = await podcasts.searchAlbums('radiolab');
 *   const episodes = await podcasts.getAlbumTracks(shows[0]);
 *   // episodes[0].uri is a directly-playable audio enclosure URL.
 */
import { getProviderMeta } from './providers/registry';
import type {
  Album,
  MusicPlayerController,
  MusicProvider,
  Playlist,
  Track,
} from './providers/types';

export type PodcastsService = MusicProvider & MusicPlayerController;

const EPISODE_LIMIT = 50;
const SHOW_LIMIT = 25;

/** Shape of an iTunes podcast record, kept loose — fields can be missing. */
interface ItunesPodcast {
  collectionId?: number;
  collectionName?: string;
  artistName?: string;
  feedUrl?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  trackCount?: number;
}

function mapShow(raw: ItunesPodcast): Album | null {
  const id = typeof raw.collectionId === 'number' ? String(raw.collectionId) : null;
  const feed = typeof raw.feedUrl === 'string' ? raw.feedUrl.trim() : '';
  if (!id || !/^https?:\/\//.test(feed)) return null;
  return {
    id,
    // The feed URL is the show's browse handle — getAlbumTracks resolves it.
    uri: feed,
    name: raw.collectionName?.trim() || 'Untitled podcast',
    artist: raw.artistName?.trim() || 'Unknown publisher',
    albumArt: raw.artworkUrl600 || raw.artworkUrl100 || null,
    trackCount: typeof raw.trackCount === 'number' ? raw.trackCount : 0,
  };
}

async function fetchShows(query: string): Promise<Album[]> {
  const res = await fetch(`/api/podcast-search?${query}`);
  if (!res.ok) throw new Error('Podcast directory is unreachable right now — try again.');
  let json: { results?: unknown };
  try {
    json = (await res.json()) as { results?: unknown };
  } catch {
    // Non-JSON body (e.g. running without the serverless endpoints).
    throw new Error('Podcast directory is unreachable right now — try again.');
  }
  const rows = Array.isArray(json.results) ? (json.results as ItunesPodcast[]) : [];
  const out: Album[] = [];
  for (const row of rows) {
    const show = mapShow(row);
    if (show) out.push(show);
  }
  return out;
}

/** Parse `<itunes:duration>`: HH:MM:SS, MM:SS, or plain seconds → ms. */
function parseDurationMs(raw: string | null | undefined): number {
  const value = raw?.trim();
  if (!value) return 0;
  const parts = value.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return Math.round(seconds * 1000);
}

function pubDateLabel(ms: number): string {
  if (ms <= 0) return '';
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** First text content among direct children matching a (possibly namespaced) tag. */
function childText(parent: Element, tag: string): string {
  for (const el of Array.from(parent.children)) {
    if (el.tagName === tag || el.localName === tag) return el.textContent?.trim() ?? '';
  }
  return '';
}

async function fetchEpisodes(show: Album): Promise<Track[]> {
  const res = await fetch(`/api/podcast-feed?url=${encodeURIComponent(show.uri)}`);
  if (!res.ok) throw new Error('Could not load this podcast feed — try another show.');
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('This podcast feed could not be read.');
  }

  const episodes: Array<Track & { pubMs: number }> = [];
  for (const item of Array.from(doc.querySelectorAll('channel > item'))) {
    const enclosure = item.querySelector('enclosure');
    const url = enclosure?.getAttribute('url')?.trim() ?? '';
    if (!/^https?:\/\//.test(url)) continue;

    const pubMs = Date.parse(childText(item, 'pubDate')) || 0;
    // <itunes:image href> on the episode, else the show artwork.
    let episodeArt: string | null = null;
    for (const el of Array.from(item.children)) {
      if (el.localName === 'image') {
        const href = el.getAttribute('href');
        if (href?.startsWith('https://')) episodeArt = href;
        break;
      }
    }

    episodes.push({
      id: childText(item, 'guid') || url,
      uri: url,
      name: childText(item, 'title') || 'Untitled episode',
      // The track list's detail line — "when", since the show is the context.
      artist: pubDateLabel(pubMs),
      album: show.name,
      albumArt: episodeArt ?? show.albumArt,
      durationMs: parseDurationMs(childText(item, 'duration')),
      pubMs,
    });
  }

  episodes.sort((a, b) => b.pubMs - a.pubMs);
  return episodes.slice(0, EPISODE_LIMIT).map(({ pubMs: _pubMs, ...track }) => track);
}

export function createPodcastsService(): PodcastsService {
  const noTracks = async (): Promise<Track[]> => [];

  return {
    meta: getProviderMeta('podcasts')!,

    // No personal library — browsing is search/charts → show → episodes.
    async getPlaylists(): Promise<Playlist[]> {
      return [];
    },
    getTracks: noTracks,
    async getAlbums(): Promise<Album[]> {
      return [];
    },
    getRecentlyPlayed: noTracks,

    // Search is collection-shaped (shows, not episodes) — the UI routes text
    // search to `searchAlbums`, so the flat track search is intentionally empty.
    search: noTracks,

    async searchAlbums(query: string): Promise<Album[]> {
      const q = query.trim();
      if (!q) return [];
      return fetchShows(`term=${encodeURIComponent(q)}&limit=${SHOW_LIMIT}`);
    },

    // Surfaced in the Music menu as "Top Podcasts" (Apple charts).
    async getTrendingAlbums(): Promise<Album[]> {
      return fetchShows(`mode=top&limit=${SHOW_LIMIT}`);
    },

    async getAlbumTracks(album: Album): Promise<Track[]> {
      return fetchEpisodes(album);
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
