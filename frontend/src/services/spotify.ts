import { getProviderMeta } from './providers/registry';
import type {
  Album,
  Artist,
  MusicPlayerController,
  MusicProvider,
  Playlist,
  PlaySource,
  RepeatMode,
  Track,
} from './providers/types';

export type { Album, Artist, Playlist, PlaySource, RepeatMode, Track } from './providers/types';

export type SpotifyService = MusicProvider & MusicPlayerController;

// ── Mock data ──────────────────────────────────────────────

const MOCK_TRACKS: Record<string, Track[]> = {
  liked: [
    { id: '1', uri: 'mock:1', name: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera', albumArt: null, durationMs: 354000 },
    { id: '2', uri: 'mock:2', name: 'Hotel California', artist: 'Eagles', album: 'Hotel California', albumArt: null, durationMs: 391000 },
    { id: '3', uri: 'mock:3', name: 'Stairway to Heaven', artist: 'Led Zeppelin', album: 'Led Zeppelin IV', albumArt: null, durationMs: 482000 },
    { id: '4', uri: 'mock:4', name: 'Smells Like Teen Spirit', artist: 'Nirvana', album: 'Nevermind', albumArt: null, durationMs: 301000 },
    { id: '5', uri: 'mock:5', name: 'Purple Rain', artist: 'Prince', album: 'Purple Rain', albumArt: null, durationMs: 520000 },
    { id: '6', uri: 'mock:6', name: 'Billie Jean', artist: 'Michael Jackson', album: 'Thriller', albumArt: null, durationMs: 294000 },
    { id: '7', uri: 'mock:7', name: 'Like a Rolling Stone', artist: 'Bob Dylan', album: 'Highway 61 Revisited', albumArt: null, durationMs: 369000 },
  ],
  chill: [
    { id: '8', uri: 'mock:8', name: 'Sunflower', artist: 'Post Malone', album: 'Spider-Verse OST', albumArt: null, durationMs: 158000 },
    { id: '9', uri: 'mock:9', name: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', albumArt: null, durationMs: 200000 },
    { id: '10', uri: 'mock:10', name: 'Watermelon Sugar', artist: 'Harry Styles', album: 'Fine Line', albumArt: null, durationMs: 174000 },
    { id: '11', uri: 'mock:11', name: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', albumArt: null, durationMs: 203000 },
    { id: '12', uri: 'mock:12', name: 'Midnight City', artist: 'M83', album: "Hurry Up, We're Dreaming", albumArt: null, durationMs: 243000 },
  ],
  road: [
    { id: '13', uri: 'mock:13', name: 'Life is a Highway', artist: 'Tom Cochrane', album: 'Mad Mad World', albumArt: null, durationMs: 278000 },
    { id: '14', uri: 'mock:14', name: 'Born to Run', artist: 'Bruce Springsteen', album: 'Born to Run', albumArt: null, durationMs: 270000 },
    { id: '15', uri: 'mock:15', name: 'Highway to Hell', artist: 'AC/DC', album: 'Highway to Hell', albumArt: null, durationMs: 208000 },
    { id: '16', uri: 'mock:16', name: 'Fast Car', artist: 'Tracy Chapman', album: 'Tracy Chapman', albumArt: null, durationMs: 296000 },
    { id: '17', uri: 'mock:17', name: 'Radar Love', artist: 'Golden Earring', album: 'Moontan', albumArt: null, durationMs: 396000 },
  ],
  workout: [
    { id: '18', uri: 'mock:18', name: 'Eye of the Tiger', artist: 'Survivor', album: 'Eye of the Tiger', albumArt: null, durationMs: 245000 },
    { id: '19', uri: 'mock:19', name: 'Lose Yourself', artist: 'Eminem', album: '8 Mile', albumArt: null, durationMs: 326000 },
    { id: '20', uri: 'mock:20', name: 'Stronger', artist: 'Kanye West', album: 'Graduation', albumArt: null, durationMs: 311000 },
    { id: '21', uri: 'mock:21', name: 'Till I Collapse', artist: 'Eminem', album: 'The Eminem Show', albumArt: null, durationMs: 297000 },
  ],
  late: [
    { id: '22', uri: 'mock:22', name: 'After Dark', artist: 'Mr. Kitty', album: 'Time', albumArt: null, durationMs: 217000 },
    { id: '23', uri: 'mock:23', name: 'Midnight City', artist: 'M83', album: "Hurry Up, We're Dreaming", albumArt: null, durationMs: 243000 },
    { id: '24', uri: 'mock:24', name: 'Call Me Maybe', artist: 'Carly Rae Jepsen', album: 'Kiss', albumArt: null, durationMs: 193000 },
  ],
};

const MOCK_PLAYLISTS: Playlist[] = [
  { id: 'liked', uri: 'mock:playlist:liked', name: 'Liked Songs', trackCount: MOCK_TRACKS.liked.length, owned: true },
  { id: 'chill', uri: 'mock:playlist:chill', name: 'Chill Vibes', trackCount: MOCK_TRACKS.chill.length, owned: true },
  { id: 'road', uri: 'mock:playlist:road', name: 'Road Trip', trackCount: MOCK_TRACKS.road.length, owned: true },
  { id: 'workout', uri: 'mock:playlist:workout', name: 'Workout Mix', trackCount: MOCK_TRACKS.workout.length, owned: true },
  { id: 'late', uri: 'mock:playlist:late', name: 'Late Night', trackCount: MOCK_TRACKS.late.length, owned: true },
];

const MOCK_ALBUM_TRACKS: Record<string, Track[]> = {
  thriller: [
    { id: 'a1', uri: 'mock:a1', name: "Wanna Be Startin' Somethin'", artist: 'Michael Jackson', album: 'Thriller', albumArt: null, durationMs: 363000 },
    { id: 'a2', uri: 'mock:a2', name: 'Thriller', artist: 'Michael Jackson', album: 'Thriller', albumArt: null, durationMs: 358000 },
    { id: 'a3', uri: 'mock:a3', name: 'Beat It', artist: 'Michael Jackson', album: 'Thriller', albumArt: null, durationMs: 258000 },
    { id: 'a4', uri: 'mock:a4', name: 'Billie Jean', artist: 'Michael Jackson', album: 'Thriller', albumArt: null, durationMs: 294000 },
  ],
  rumours: [
    { id: 'b1', uri: 'mock:b1', name: 'Second Hand News', artist: 'Fleetwood Mac', album: 'Rumours', albumArt: null, durationMs: 173000 },
    { id: 'b2', uri: 'mock:b2', name: 'Dreams', artist: 'Fleetwood Mac', album: 'Rumours', albumArt: null, durationMs: 257000 },
    { id: 'b3', uri: 'mock:b3', name: 'Go Your Own Way', artist: 'Fleetwood Mac', album: 'Rumours', albumArt: null, durationMs: 218000 },
    { id: 'b4', uri: 'mock:b4', name: 'The Chain', artist: 'Fleetwood Mac', album: 'Rumours', albumArt: null, durationMs: 270000 },
  ],
  abbeyroad: [
    { id: 'c1', uri: 'mock:c1', name: 'Come Together', artist: 'The Beatles', album: 'Abbey Road', albumArt: null, durationMs: 259000 },
    { id: 'c2', uri: 'mock:c2', name: 'Something', artist: 'The Beatles', album: 'Abbey Road', albumArt: null, durationMs: 182000 },
    { id: 'c3', uri: 'mock:c3', name: 'Here Comes the Sun', artist: 'The Beatles', album: 'Abbey Road', albumArt: null, durationMs: 185000 },
  ],
};

const MOCK_ALBUMS: Album[] = [
  { id: 'thriller', uri: 'mock:album:thriller', name: 'Thriller', artist: 'Michael Jackson', albumArt: null, trackCount: MOCK_ALBUM_TRACKS.thriller.length },
  { id: 'rumours', uri: 'mock:album:rumours', name: 'Rumours', artist: 'Fleetwood Mac', albumArt: null, trackCount: MOCK_ALBUM_TRACKS.rumours.length },
  { id: 'abbeyroad', uri: 'mock:album:abbeyroad', name: 'Abbey Road', artist: 'The Beatles', albumArt: null, trackCount: MOCK_ALBUM_TRACKS.abbeyroad.length },
];

const MOCK_ARTISTS: Artist[] = [
  { id: 'queen', uri: 'mock:artist:queen', name: 'Queen', image: null },
  { id: 'mj', uri: 'mock:artist:mj', name: 'Michael Jackson', image: null },
  { id: 'beatles', uri: 'mock:artist:beatles', name: 'The Beatles', image: null },
  { id: 'fleetwood', uri: 'mock:artist:fleetwood', name: 'Fleetwood Mac', image: null },
  { id: 'eminem', uri: 'mock:artist:eminem', name: 'Eminem', image: null },
];

function allMockTracks(): Track[] {
  return [
    ...Object.values(MOCK_TRACKS).flat(),
    ...Object.values(MOCK_ALBUM_TRACKS).flat(),
  ];
}

function mockTracksByArtist(name: string): Track[] {
  const n = name.toLowerCase();
  return allMockTracks().filter((t) => t.artist.toLowerCase() === n);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function createMockService(): SpotifyService {
  return {
    meta: getProviderMeta('demo')!,
    async getPlaylists() {
      await sleep(250);
      return MOCK_PLAYLISTS;
    },
    async getTracks(playlistId) {
      await sleep(300);
      return MOCK_TRACKS[playlistId] ?? MOCK_TRACKS.liked;
    },
    async getAlbums() {
      await sleep(250);
      return MOCK_ALBUMS;
    },
    async getAlbumTracks(album) {
      await sleep(300);
      return MOCK_ALBUM_TRACKS[album.id] ?? [];
    },
    async getArtists() {
      await sleep(250);
      return MOCK_ARTISTS;
    },
    async getArtistAlbums(artist) {
      await sleep(250);
      return MOCK_ALBUMS.filter(
        (a) => a.artist.toLowerCase() === artist.name.toLowerCase()
      );
    },
    async getArtistTopTracks(artist) {
      await sleep(250);
      return mockTracksByArtist(artist.name);
    },
    async getRecentlyPlayed() {
      await sleep(250);
      // A believable "recent" slice drawn from across the mock catalog.
      return [
        MOCK_TRACKS.chill[1],
        MOCK_TRACKS.liked[5],
        MOCK_TRACKS.workout[0],
        MOCK_TRACKS.road[2],
        MOCK_TRACKS.late[0],
        MOCK_TRACKS.liked[0],
      ];
    },
    async search(query) {
      await sleep(200);
      const q = query.trim().toLowerCase();
      if (!q) return [];
      return allMockTracks().filter(
        (t) => t.name.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
      );
    },
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

// ── Real Spotify service ───────────────────────────────────

export type SpotifyTokenProvider = () => Promise<string | null>;

/**
 * Error carrying the HTTP status so callers can branch on 403/404 etc. It also
 * remembers which endpoint failed and any machine-readable `reason` from
 * Spotify's error body, so `describeDataError` can tell a scope problem apart
 * from a Development-Mode allowlist / Premium problem (all of which surface as
 * 403 but need very different user actions).
 */
export class SpotifyApiError extends Error {
  status: number;
  /** The Web API path that failed, e.g. "/me/top/artists" (no query string). */
  path?: string;
  /** Spotify's `error.reason` code from the response body, when present. */
  reason?: string;
  constructor(status: number, message: string, opts: { path?: string; reason?: string } = {}) {
    super(message);
    this.name = 'SpotifyApiError';
    this.status = status;
    this.path = opts.path;
    this.reason = opts.reason;
  }
}

export function createSpotifyService(getToken: SpotifyTokenProvider): SpotifyService {
  const request = async (path: string, opts: RequestInit = {}) => {
    // Strip the query string so the error carries a stable endpoint identity.
    const endpoint = path.split('?')[0];
    const token = await getToken();
    if (!token) throw new SpotifyApiError(401, 'Not logged in to Spotify', { path: endpoint });
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(opts.headers ?? {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (data as { error?: { message?: string; reason?: string } })?.error;
      const message = err?.message ?? `Spotify API error (${res.status})`;
      // Log the verbatim status/path/message/reason so the exact cause is
      // observable in the console/network even when the UI shows guidance.
      console.warn(
        `[spotify] ${res.status} ${endpoint} — ${message}${err?.reason ? ` (reason: ${err.reason})` : ''}`
      );
      throw new SpotifyApiError(res.status, message, {
        path: endpoint,
        reason: err?.reason,
      });
    }
    return data;
  };

  // The current user's id is needed to know which playlists we can list
  // (Feb 2026: /playlists/{id}/items only works for owned/collaborative ones).
  let cachedUserId: string | null = null;
  let cachedMarket: string | null = null;
  const loadMe = async () => {
    try {
      const me = await request('/me');
      cachedUserId = me?.id ?? null;
      cachedMarket = me?.country ?? null;
    } catch {
      /* leave caches null */
    }
  };
  const getUserId = async (): Promise<string | null> => {
    if (cachedUserId === null) await loadMe();
    return cachedUserId;
  };
  // Spotify's artist top-tracks endpoint requires a market; fall back to US.
  const getMarket = async (): Promise<string> => {
    if (cachedMarket === null) await loadMe();
    return cachedMarket ?? 'US';
  };

  return {
    meta: getProviderMeta('spotify')!,
    async getPlaylists() {
      const [meId, data] = await Promise.all([getUserId(), request('/me/playlists?limit=50')]);
      return (data.items ?? [])
        .filter((p: any) => p?.id)
        .map((p: any) => ({
          id: p.id,
          uri: p.uri ?? `spotify:playlist:${p.id}`,
          name: p.name,
          // Feb 2026 renamed the playlist `tracks` field to `items`.
          trackCount: p.items?.total ?? p.tracks?.total ?? 0,
          owned: !!meId && p.owner?.id === meId,
        }));
    },

    async getTracks(playlistId) {
      const tracks: Track[] = [];
      let offset = 0;
      const limit = 50;

      while (true) {
        let data: any;
        try {
          data = await request(
            `/playlists/${playlistId}/items?limit=${limit}&offset=${offset}&additional_types=track`
          );
        } catch (e) {
          // Feb 2026: listing items is only permitted for playlists the user
          // owns or collaborates on; others return 403/404. Return what we have
          // so the caller can still offer "Play playlist" via its context URI.
          if (e instanceof SpotifyApiError && (e.status === 403 || e.status === 404)) {
            return tracks;
          }
          throw e;
        }

        const rows = data.items ?? data.tracks?.items ?? [];
        for (const row of rows) {
          const raw = row.item ?? row.track;
          if (!raw?.id || raw.type === 'episode') continue;
          tracks.push({
            id: raw.id,
            uri: raw.uri,
            name: raw.name,
            artist: raw.artists?.[0]?.name ?? 'Unknown',
            album: raw.album?.name ?? '',
            albumArt: raw.album?.images?.[0]?.url ?? null,
            durationMs: raw.duration_ms,
          });
        }

        if (!data.next) break;
        offset += limit;
      }

      return tracks;
    },

    async getAlbums() {
      const data = await request('/me/albums?limit=50');
      return (data.items ?? [])
        .filter((item: any) => item?.album?.id)
        .map((item: any) => ({
          id: item.album.id,
          uri: item.album.uri,
          name: item.album.name,
          artist: item.album.artists?.[0]?.name ?? 'Unknown',
          albumArt: item.album.images?.[0]?.url ?? null,
          trackCount: item.album.total_tracks ?? 0,
        }));
    },

    async getAlbumTracks(album) {
      // The album-tracks endpoint omits album art per track, so fold in the
      // parent album's name and artwork.
      const data = await request(`/albums/${album.id}/tracks?limit=50`);
      return (data.items ?? [])
        .filter((t: any) => t?.id)
        .map((t: any) => ({
          id: t.id,
          uri: t.uri,
          name: t.name,
          artist: t.artists?.[0]?.name ?? album.artist,
          album: album.name,
          albumArt: album.albumArt,
          durationMs: t.duration_ms,
        }));
    },

    async getArtists() {
      // Merge followed artists with the user's top artists, deduped by id. Each
      // call is tolerated on its own so one succeeding still yields results, but
      // we remember the first failure: if BOTH come back empty because of it,
      // we rethrow so the UI can explain it (typically a missing scope on tokens
      // minted before the Artists feature added user-follow-read/user-top-read).
      let firstError: unknown = null;
      const tolerate = async (p: Promise<any>) => {
        try {
          return await p;
        } catch (e) {
          firstError ??= e;
          return {};
        }
      };
      const [followed, top] = await Promise.all([
        tolerate(request('/me/following?type=artist&limit=50')),
        tolerate(request('/me/top/artists?limit=50')),
      ]);
      const rows = [
        ...((followed as any).artists?.items ?? []),
        ...((top as any).items ?? []),
      ];
      const seen = new Set<string>();
      const out: Artist[] = [];
      for (const a of rows) {
        if (!a?.id || seen.has(a.id)) continue;
        seen.add(a.id);
        out.push({
          id: a.id,
          uri: a.uri ?? `spotify:artist:${a.id}`,
          name: a.name,
          image: a.images?.[0]?.url ?? null,
        });
      }
      if (out.length === 0 && firstError) throw firstError;
      out.sort((a, b) => a.name.localeCompare(b.name));
      return out;
    },

    async getArtistAlbums(artist) {
      const data = await request(
        `/artists/${artist.id}/albums?include_groups=album,single&limit=50`
      );
      const seen = new Set<string>();
      return (data.items ?? [])
        .filter((a: any) => {
          if (!a?.id || seen.has(a.name)) return false;
          seen.add(a.name);
          return true;
        })
        .map((a: any) => ({
          id: a.id,
          uri: a.uri,
          name: a.name,
          artist: a.artists?.[0]?.name ?? artist.name,
          albumArt: a.images?.[0]?.url ?? null,
          trackCount: a.total_tracks ?? 0,
        }));
    },

    async getArtistTopTracks(artist) {
      const market = await getMarket();
      const data = await request(`/artists/${artist.id}/top-tracks?market=${market}`);
      return (data.tracks ?? [])
        .filter((t: any) => t?.id)
        .map((t: any) => ({
          id: t.id,
          uri: t.uri,
          name: t.name,
          artist: t.artists?.[0]?.name ?? artist.name,
          album: t.album?.name ?? '',
          albumArt: t.album?.images?.[0]?.url ?? null,
          durationMs: t.duration_ms,
        }));
    },

    async getRecentlyPlayed() {
      const data = await request('/me/player/recently-played?limit=50');
      const seen = new Set<string>();
      return (data.items ?? [])
        .filter((item: any) => item?.track?.id)
        .filter((item: any) => {
          if (seen.has(item.track.id)) return false;
          seen.add(item.track.id);
          return true;
        })
        .map((item: any) => ({
          id: item.track.id,
          uri: item.track.uri,
          name: item.track.name,
          artist: item.track.artists?.[0]?.name ?? 'Unknown',
          album: item.track.album?.name ?? '',
          albumArt: item.track.album?.images?.[0]?.url ?? null,
          durationMs: item.track.duration_ms,
        }));
    },

    async search(query) {
      const q = query.trim();
      if (!q) return [];
      // Feb 2026 capped the search `limit` at 10, so paginate a few pages.
      const pageSize = 10;
      const maxPages = 3;
      const out: Track[] = [];
      for (let page = 0; page < maxPages; page++) {
        const data = await request(
          `/search?type=track&limit=${pageSize}&offset=${page * pageSize}&q=${encodeURIComponent(q)}`
        );
        const items = data.tracks?.items ?? [];
        for (const t of items) {
          if (!t?.id) continue;
          out.push({
            id: t.id,
            uri: t.uri,
            name: t.name,
            artist: t.artists?.[0]?.name ?? 'Unknown',
            album: t.album?.name ?? '',
            albumArt: t.album?.images?.[0]?.url ?? null,
            durationMs: t.duration_ms,
          });
        }
        if (items.length < pageSize) break;
      }
      return out;
    },

    async play(source, trackIndex, deviceId) {
      const body: Record<string, unknown> = { position_ms: 0 };
      if ('contextUri' in source) {
        body.context_uri = source.contextUri;
        body.offset = { position: trackIndex };
      } else {
        body.uris = source.uris;
        body.offset = { position: trackIndex };
      }
      await request(`/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    },

    async pause(deviceId) {
      await request(`/me/player/pause?device_id=${deviceId}`, { method: 'PUT' });
    },

    async resume(deviceId) {
      await request(`/me/player/play?device_id=${deviceId}`, { method: 'PUT' });
    },

    async next(deviceId) {
      await request(`/me/player/next?device_id=${deviceId}`, { method: 'POST' });
    },

    async previous(deviceId) {
      await request(`/me/player/previous?device_id=${deviceId}`, { method: 'POST' });
    },

    async seek(positionMs, deviceId) {
      await request(`/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`, { method: 'PUT' });
    },

    async setVolume(volumePct, deviceId) {
      await request(
        `/me/player/volume?volume_percent=${Math.round(volumePct)}&device_id=${deviceId}`,
        { method: 'PUT' }
      );
    },

    async setShuffle(state, deviceId) {
      await request(`/me/player/shuffle?state=${state}&device_id=${deviceId}`, { method: 'PUT' });
    },

    async setRepeat(mode, deviceId) {
      await request(`/me/player/repeat?state=${mode}&device_id=${deviceId}`, { method: 'PUT' });
    },
  };
}

// Spotify endpoints whose 403 almost always means a *missing scope* rather than
// app access. These need scopes (user-follow-read / user-top-read /
// user-read-recently-played) that were added when the Artists feature shipped,
// so tokens minted earlier must be re-consented (Sign Out → sign in again).
const SCOPE_GATED_PATHS = ['/me/following', '/me/top', '/me/player/recently-played'];

// Catalog endpoints Spotify removed for Development Mode apps (Feb 2026
// migration). These 403 regardless of account/allowlist, so the UI hides the
// features that use them — but if one is ever hit, say so accurately.
const REMOVED_PATHS = ['top-tracks', '/browse/new-releases', '/browse/categories'];

/**
 * Turn a caught data-load error into a short, actionable message a non-technical
 * visitor can follow. A Spotify 403 can mean three very different things, so we
 * use the failed endpoint (`SpotifyApiError.path`) plus the response body's
 * `reason`/`message` to tell them apart:
 *
 *  - missing scope (e.g. /me/following, /me/top)  → re-consent via Sign Out
 *  - app owner has no Spotify Premium (Dev Mode)  → owner must enable Premium
 *  - account not on the Dev-Mode allowlist        → owner must add that account
 */
export function describeDataError(e: unknown, fallback: string): string {
  if (e instanceof SpotifyApiError) {
    if (e.status === 403) {
      const signal = `${e.reason ?? ''} ${e.message ?? ''}`.toLowerCase();
      const path = e.path ?? '';

      // Owner-account Premium requirement (Spotify Dev Mode, since Mar 2026):
      // every API call 403s for everyone — including the owner — until the app
      // owner's own Spotify account has an active Premium subscription.
      if (signal.includes('premium')) {
        return "This Spotify app is in Development Mode, which now requires the app owner's account to have Spotify Premium. The owner needs to turn on Premium.";
      }

      // Missing scope: the token predates a permission this feature needs.
      if (signal.includes('scope') || SCOPE_GATED_PATHS.some((p) => path.startsWith(p))) {
        return 'New Spotify permissions are needed for this. Open Settings → Sign Out, then sign in again to grant them.';
      }

      // Endpoint Spotify removed for Dev Mode apps — not an account problem.
      if (REMOVED_PATHS.some((p) => path.includes(p))) {
        return 'Spotify removed this from its API for apps in Development Mode, so it is unavailable here.';
      }

      // App access / allowlist: the exact account that signed in isn't approved.
      // The dashboard owner is NOT automatically allowlisted, and it must be the
      // same account they actually logged in with.
      return 'This Spotify app is in Development Mode. The exact account you signed in with must be added by the owner (Spotify Dashboard → User Management), then sign in again.';
    }
    if (e.status === 401) {
      return 'Your Spotify session expired — sign out and sign in again.';
    }
    if (e.status === 429) {
      return 'Spotify is rate-limiting requests — wait a moment and try again.';
    }
  }
  return e instanceof Error ? e.message : fallback;
}

export function albumArtPlaceholder(seed: string): string {
  const colors = [
    '#c0392b', '#e74c3c', '#e67e22', '#f39c12',
    '#27ae60', '#16a085', '#2980b9', '#8e44ad',
    '#2c3e50', '#7f8c8d', '#1abc9c', '#d35400',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
