/**
 * Apple Music data service + MusicKit bootstrap for OldPod.fm.
 *
 * Apple Music is a premium, full-catalog, logged-in source. This module owns two
 * concerns that the rest of the app builds on:
 *
 *  1. MusicKit bootstrap — loading MusicKit JS v3 once, configuring it with a
 *     developer token minted by the serverless endpoint (`/api/apple-developer-
 *     token`, never the raw `.p8`), and authorizing the user for their Music
 *     User Token. These helpers are shared with `hooks/useAppleMusicPlayer.ts`,
 *     which owns playback (MusicKit, not this service, drives audio).
 *  2. Browse/search (`MusicProvider`) — catalog search plus the user's library
 *     (playlists, albums, recently played) and artists, all via the Apple Music
 *     API with the developer + Music-User tokens.
 *
 * Playback is NOT handled here: like the Audius/YouTube services the
 * `MusicPlayerController` methods are intentionally no-ops, and App.tsx routes
 * real playback by provider id to the MusicKit player hook.
 *
 * When the developer-token endpoint is not configured (no Apple secrets on the
 * server) every browse/search call throws a clear, non-technical message that
 * the existing `describeDataError` pattern surfaces in the UI, mirroring
 * YouTube's "needs an API key" degradation rather than crashing the app.
 *
 * Example:
 *   const apple = createAppleMusicService();
 *   const tracks = await apple.search('radiohead');
 *   // tracks[0].uri is `applemusic:song:{catalogId}` the player loads.
 */
import { getProviderMeta } from './providers/registry';
import type {
  Album,
  Artist,
  MusicPlayerController,
  MusicProvider,
  Playlist,
  Track,
} from './providers/types';

// Playback is handled by the MusicKit player hook (routed by provider id), so
// the controller surface is a no-op like Audius/YouTube — kept to satisfy the
// shared service type App.tsx consumes.
export type AppleMusicService = MusicProvider & MusicPlayerController;

const DEVELOPER_TOKEN_ENDPOINT = '/api/apple-developer-token';
const MUSICKIT_SRC = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
const API_BASE = 'https://api.music.apple.com';
const DEFAULT_STOREFRONT = 'us';
const ARTWORK_SIZE = 300;

/** User-facing message shown when the Apple developer-token endpoint is absent. */
export const APPLE_NOT_CONFIGURED_MESSAGE = "Apple Music isn't set up yet.";
/** User-facing message when the user has not signed in to Apple Music. */
export const APPLE_NOT_AUTHORIZED_MESSAGE = 'Sign in to Apple Music to see your library.';

// ── MusicKit bootstrap (shared with the player hook) ───────

let scriptPromise: Promise<void> | null = null;
let configurePromise: Promise<MusicKit.MusicKitInstance | null> | null = null;
// Sticky flag once we learn the server has no Apple secrets, so the UI can show
// a graceful "not set up" state without re-probing on every interaction.
let knownNotConfigured = false;
// 30-second preview URLs keyed by the catalog song id used for playback, so the
// player hook can fall back to previews for non-subscribers without changing the
// shared `Track` shape.
const previewUrls = new Map<string, string>();

/** True once we've confirmed the developer-token endpoint is not configured. */
export function isAppleMusicKnownUnconfigured(): boolean {
  return knownNotConfigured;
}

/** A previously-mapped 30s preview URL for a catalog song id, if any. */
export function getApplePreviewUrl(songId: string): string | null {
  return previewUrls.get(songId) ?? null;
}

/** Parse the catalog song id out of an `applemusic:song:{id}` URI. */
export function appleSongIdFromUri(uri: string): string | null {
  const m = /^applemusic:song:(.+)$/.exec(uri);
  return m ? m[1] : null;
}

async function fetchDeveloperToken(): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(DEVELOPER_TOKEN_ENDPOINT, { headers: { accept: 'application/json' } });
  } catch {
    // Network/offline — treat as not configured so the app stays usable.
    knownNotConfigured = true;
    return null;
  }
  // 503 is our explicit "not configured"; a non-JSON 200 means we hit the SPA
  // fallback (e.g. the Vite dev server with no serverless runtime) — same thing.
  const contentType = res.headers.get('content-type') ?? '';
  if (res.status === 503 || !res.ok || !contentType.includes('application/json')) {
    knownNotConfigured = true;
    return null;
  }
  try {
    const json = (await res.json()) as { token?: unknown };
    if (typeof json.token === 'string' && json.token.length > 0) {
      knownNotConfigured = false;
      return json.token;
    }
  } catch {
    /* fall through */
  }
  knownNotConfigured = true;
  return null;
}

function loadMusicKitScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }
  if (window.MusicKit) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const done = () => resolve();
    // MusicKit dispatches `musickitloaded` on document once it attaches.
    document.addEventListener('musickitloaded', done, { once: true });
    if (!document.querySelector(`script[src="${MUSICKIT_SRC}"]`)) {
      const tag = document.createElement('script');
      tag.src = MUSICKIT_SRC;
      tag.async = true;
      tag.addEventListener('error', () => reject(new Error('Could not load Apple MusicKit.')));
      document.head.appendChild(tag);
    } else if (window.MusicKit) {
      resolve();
    }
  });
  return scriptPromise;
}

/**
 * Load + configure MusicKit once, returning the instance (or null when Apple is
 * not configured on the server). Safe to call repeatedly; the work is memoised.
 */
export async function ensureAppleMusicConfigured(): Promise<MusicKit.MusicKitInstance | null> {
  if (configurePromise) return configurePromise;

  configurePromise = (async () => {
    const token = await fetchDeveloperToken();
    if (!token) return null;
    await loadMusicKitScript();
    if (!window.MusicKit) return null;
    const instance = await window.MusicKit.configure({
      developerToken: token,
      app: { name: 'OldPod.fm', build: '1.0' },
    });
    return instance ?? window.MusicKit.getInstance() ?? null;
  })();

  try {
    return await configurePromise;
  } catch {
    // Let a later call retry configuration (e.g. transient script load failure).
    configurePromise = null;
    return null;
  }
}

/**
 * Authorize the user and return their Music User Token, or null when Apple is
 * not configured. Callers should treat a thrown error / null as "not signed in"
 * and degrade gracefully (cancelled prompt, no subscription, etc.).
 */
export async function authorizeAppleMusic(): Promise<string | null> {
  const music = await ensureAppleMusicConfigured();
  if (!music) return null;
  if (music.isAuthorized && music.musicUserToken) return music.musicUserToken;
  const userToken = await music.authorize();
  return userToken ?? null;
}

// ── API request helpers ────────────────────────────────────

function storefront(music: MusicKit.MusicKitInstance): string {
  return music.storefrontId || music.storefrontCountryCode || DEFAULT_STOREFRONT;
}

async function getConfiguredOrThrow(): Promise<MusicKit.MusicKitInstance> {
  const music = await ensureAppleMusicConfigured();
  if (!music) throw new Error(APPLE_NOT_CONFIGURED_MESSAGE);
  return music;
}

interface AppleFetchOptions {
  /** When true, the endpoint needs the Music User Token (library/recent). */
  needsUser?: boolean;
}

async function appleFetch(
  music: MusicKit.MusicKitInstance,
  path: string,
  { needsUser = false }: AppleFetchOptions = {}
): Promise<unknown> {
  let userToken = music.musicUserToken;
  if (needsUser && !userToken) {
    userToken = await authorizeAppleMusic();
    if (!userToken) throw new Error(APPLE_NOT_AUTHORIZED_MESSAGE);
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${music.developerToken}` };
  if (userToken) headers['Music-User-Token'] = userToken;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers });
  } catch {
    throw new Error('Could not reach Apple Music — check your connection.');
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('Your Apple Music sign-in expired — sign in again.');
    }
    if (res.status === 404) {
      throw new Error('Apple Music could not find that.');
    }
    if (res.status === 429) {
      throw new Error('Apple Music is rate-limiting requests — try again shortly.');
    }
    throw new Error('Apple Music request failed — try again.');
  }
  return res.json();
}

// ── Loose API shapes (fields can be missing/null) ──────────

interface AppleArtwork {
  url?: string;
}
interface ApplePlayParams {
  id?: string;
  catalogId?: string;
}
interface AppleSongAttributes {
  name?: string;
  artistName?: string;
  albumName?: string;
  durationInMillis?: number;
  artwork?: AppleArtwork;
  playParams?: ApplePlayParams;
  previews?: Array<{ url?: string }>;
}
interface AppleAlbumAttributes {
  name?: string;
  artistName?: string;
  artwork?: AppleArtwork;
  trackCount?: number;
}
interface AppleArtistAttributes {
  name?: string;
  artwork?: AppleArtwork;
}
interface ApplePlaylistAttributes {
  name?: string;
  artwork?: AppleArtwork;
}
interface AppleResource<A> {
  id?: string;
  type?: string;
  attributes?: A;
}
interface AppleListResponse<A> {
  data?: Array<AppleResource<A>>;
}
interface AppleSearchResponse {
  results?: {
    songs?: { data?: Array<AppleResource<AppleSongAttributes>> };
    albums?: { data?: Array<AppleResource<AppleAlbumAttributes>> };
    artists?: { data?: Array<AppleResource<AppleArtistAttributes>> };
  };
}

// ── Mappers ────────────────────────────────────────────────

function artworkUrl(art: AppleArtwork | undefined): string | null {
  const template = art?.url;
  if (!template) return null;
  // Apple artwork URLs are templates: `.../{w}x{h}bb.jpg`.
  return template.replace('{w}', String(ARTWORK_SIZE)).replace('{h}', String(ARTWORK_SIZE));
}

/** The catalog song id MusicKit can enqueue (library songs expose a catalogId). */
function playableSongId(res: AppleResource<AppleSongAttributes>): string | null {
  return (
    res.attributes?.playParams?.catalogId ??
    res.attributes?.playParams?.id ??
    res.id ??
    null
  );
}

function mapSong(res: AppleResource<AppleSongAttributes>): Track | null {
  const id = playableSongId(res);
  if (!id) return null;
  const attr = res.attributes ?? {};
  const preview = attr.previews?.[0]?.url;
  if (preview) previewUrls.set(id, preview);
  return {
    id,
    uri: `applemusic:song:${id}`,
    name: attr.name?.trim() || 'Untitled',
    artist: attr.artistName?.trim() || 'Unknown artist',
    album: attr.albumName?.trim() || '',
    albumArt: artworkUrl(attr.artwork),
    durationMs: typeof attr.durationInMillis === 'number' ? attr.durationInMillis : 0,
  };
}

function mapSongs(list: Array<AppleResource<AppleSongAttributes>> | undefined): Track[] {
  const out: Track[] = [];
  for (const res of list ?? []) {
    const t = mapSong(res);
    if (t) out.push(t);
  }
  return out;
}

// Library ids look like `l.AbCdEf` / `i.AbCdEf`; catalog ids are numeric. We tag
// the source in the resource uri so list loaders hit the right endpoint.
function mapAlbum(res: AppleResource<AppleAlbumAttributes>, source: 'catalog' | 'library'): Album | null {
  if (!res.id) return null;
  const attr = res.attributes ?? {};
  return {
    id: res.id,
    uri: `applemusic:${source}-album:${res.id}`,
    name: attr.name?.trim() || 'Untitled album',
    artist: attr.artistName?.trim() || 'Unknown artist',
    albumArt: artworkUrl(attr.artwork),
    trackCount: typeof attr.trackCount === 'number' ? attr.trackCount : 0,
  };
}

function mapArtist(res: AppleResource<AppleArtistAttributes>, source: 'catalog' | 'library'): Artist | null {
  if (!res.id) return null;
  const attr = res.attributes ?? {};
  return {
    id: res.id,
    uri: `applemusic:${source}-artist:${res.id}`,
    name: attr.name?.trim() || 'Unknown artist',
    image: artworkUrl(attr.artwork),
  };
}

function mapPlaylist(res: AppleResource<ApplePlaylistAttributes>): Playlist | null {
  if (!res.id) return null;
  const attr = res.attributes ?? {};
  return {
    id: res.id,
    uri: `applemusic:library-playlist:${res.id}`,
    name: attr.name?.trim() || 'Untitled playlist',
    trackCount: 0,
    owned: true,
  };
}

/** Pull the raw id out of an `applemusic:{source}-{kind}:{id}` uri. */
function idFromUri(uri: string): string {
  const idx = uri.lastIndexOf(':');
  return idx >= 0 ? uri.slice(idx + 1) : uri;
}

// ── Service ────────────────────────────────────────────────

export function createAppleMusicService(): AppleMusicService {
  return {
    meta: getProviderMeta('applemusic')!,

    async getPlaylists(): Promise<Playlist[]> {
      const music = await getConfiguredOrThrow();
      const json = (await appleFetch(music, '/v1/me/library/playlists?limit=100', {
        needsUser: true,
      })) as AppleListResponse<ApplePlaylistAttributes>;
      const out: Playlist[] = [];
      for (const res of json.data ?? []) {
        const p = mapPlaylist(res);
        if (p) out.push(p);
      }
      return out;
    },

    async getTracks(playlistId: string): Promise<Track[]> {
      const music = await getConfiguredOrThrow();
      const id = idFromUri(playlistId);
      const json = (await appleFetch(
        music,
        `/v1/me/library/playlists/${encodeURIComponent(id)}/tracks?limit=100`,
        { needsUser: true }
      )) as AppleListResponse<AppleSongAttributes>;
      return mapSongs(json.data);
    },

    async getAlbums(): Promise<Album[]> {
      const music = await getConfiguredOrThrow();
      const json = (await appleFetch(music, '/v1/me/library/albums?limit=100', {
        needsUser: true,
      })) as AppleListResponse<AppleAlbumAttributes>;
      const out: Album[] = [];
      for (const res of json.data ?? []) {
        const a = mapAlbum(res, 'library');
        if (a) out.push(a);
      }
      return out;
    },

    async getAlbumTracks(album: Album): Promise<Track[]> {
      const music = await getConfiguredOrThrow();
      const id = idFromUri(album.uri);
      const isLibrary = album.uri.includes('library-album');
      const path = isLibrary
        ? `/v1/me/library/albums/${encodeURIComponent(id)}/tracks`
        : `/v1/catalog/${storefront(music)}/albums/${encodeURIComponent(id)}/tracks`;
      const json = (await appleFetch(music, path, { needsUser: isLibrary })) as AppleListResponse<AppleSongAttributes>;
      return mapSongs(json.data);
    },

    async getRecentlyPlayed(): Promise<Track[]> {
      const music = await getConfiguredOrThrow();
      const json = (await appleFetch(music, '/v1/me/recent/played/tracks?limit=25', {
        needsUser: true,
      })) as AppleListResponse<AppleSongAttributes>;
      return mapSongs(json.data);
    },

    async search(query: string): Promise<Track[]> {
      const q = query.trim();
      if (!q) return [];
      const music = await getConfiguredOrThrow();
      const path =
        `/v1/catalog/${storefront(music)}/search` +
        `?types=songs,albums,artists&limit=25&term=${encodeURIComponent(q)}`;
      const json = (await appleFetch(music, path)) as AppleSearchResponse;
      return mapSongs(json.results?.songs?.data);
    },

    async getArtists(): Promise<Artist[]> {
      const music = await getConfiguredOrThrow();
      const json = (await appleFetch(music, '/v1/me/library/artists?limit=100', {
        needsUser: true,
      })) as AppleListResponse<AppleArtistAttributes>;
      const out: Artist[] = [];
      for (const res of json.data ?? []) {
        const a = mapArtist(res, 'library');
        if (a) out.push(a);
      }
      return out;
    },

    async getArtistAlbums(artist: Artist): Promise<Album[]> {
      const music = await getConfiguredOrThrow();
      const id = idFromUri(artist.uri);
      const json = (await appleFetch(
        music,
        `/v1/me/library/artists/${encodeURIComponent(id)}/albums?limit=100`,
        { needsUser: true }
      )) as AppleListResponse<AppleAlbumAttributes>;
      const out: Album[] = [];
      for (const res of json.data ?? []) {
        const a = mapAlbum(res, 'library');
        if (a) out.push(a);
      }
      return out;
    },

    async getArtistTopTracks(artist: Artist): Promise<Track[]> {
      const music = await getConfiguredOrThrow();
      const libraryId = idFromUri(artist.uri);
      // Library artists have no "top songs" — resolve the catalog artist first,
      // then read its catalog top-songs view.
      const catalogRes = (await appleFetch(
        music,
        `/v1/me/library/artists/${encodeURIComponent(libraryId)}/catalog`,
        { needsUser: true }
      )) as AppleListResponse<AppleArtistAttributes>;
      const catalogId = catalogRes.data?.[0]?.id;
      if (!catalogId) throw new Error('No top tracks for this artist.');
      const json = (await appleFetch(
        music,
        `/v1/catalog/${storefront(music)}/artists/${encodeURIComponent(catalogId)}/view/top-songs?limit=25`
      )) as AppleListResponse<AppleSongAttributes>;
      return mapSongs(json.data);
    },

    // Playback is owned by the MusicKit player hook (routed by provider id), so
    // these are intentional no-ops, mirroring the Audius/YouTube services.
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
