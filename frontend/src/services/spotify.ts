export interface Track {
  id: string;
  uri: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string | null;
  durationMs: number;
}

export interface Playlist {
  id: string;
  uri: string;
  name: string;
  /** 0 when Spotify does not expose a count (e.g. playlists you don't own). */
  trackCount: number;
  /** True when the current user owns/collaborates — required to list songs (Feb 2026 API). */
  owned: boolean;
}

export interface Album {
  id: string;
  uri: string;
  name: string;
  artist: string;
  albumArt: string | null;
  trackCount: number;
}

export type RepeatMode = 'off' | 'context' | 'track';

/**
 * Describes where playback should start. Playlists and albums play through a
 * Spotify "context" (so the queue extends beyond the loaded page), while ad-hoc
 * lists (search results, recently played) play from an explicit set of URIs.
 */
export type PlaySource = { contextUri: string } | { uris: string[] };

export interface SpotifyService {
  getPlaylists(): Promise<Playlist[]>;
  getTracks(playlistId: string): Promise<Track[]>;
  getAlbums(): Promise<Album[]>;
  getAlbumTracks(album: Album): Promise<Track[]>;
  getRecentlyPlayed(): Promise<Track[]>;
  search(query: string): Promise<Track[]>;
  play(source: PlaySource, trackIndex: number, deviceId: string): Promise<void>;
  pause(deviceId: string): Promise<void>;
  resume(deviceId: string): Promise<void>;
  next(deviceId: string): Promise<void>;
  previous(deviceId: string): Promise<void>;
  seek(positionMs: number, deviceId: string): Promise<void>;
  setVolume(volumePct: number, deviceId: string): Promise<void>;
  setShuffle(state: boolean, deviceId: string): Promise<void>;
  setRepeat(mode: RepeatMode, deviceId: string): Promise<void>;
}

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

function allMockTracks(): Track[] {
  return [
    ...Object.values(MOCK_TRACKS).flat(),
    ...Object.values(MOCK_ALBUM_TRACKS).flat(),
  ];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function createMockService(): SpotifyService {
  return {
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

/** Error carrying the HTTP status so callers can branch on 403/404 etc. */
export class SpotifyApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SpotifyApiError';
    this.status = status;
  }
}

export function createSpotifyService(getToken: SpotifyTokenProvider): SpotifyService {
  const request = async (path: string, opts: RequestInit = {}) => {
    const token = await getToken();
    if (!token) throw new SpotifyApiError(401, 'Not logged in to Spotify');
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
      const msg = (data as { error?: { message?: string } })?.error?.message;
      throw new SpotifyApiError(res.status, msg ?? `Spotify API error (${res.status})`);
    }
    return data;
  };

  // The current user's id is needed to know which playlists we can list
  // (Feb 2026: /playlists/{id}/items only works for owned/collaborative ones).
  let cachedUserId: string | null = null;
  const getUserId = async (): Promise<string | null> => {
    if (cachedUserId) return cachedUserId;
    try {
      const me = await request('/me');
      cachedUserId = me?.id ?? null;
    } catch {
      cachedUserId = null;
    }
    return cachedUserId;
  };

  return {
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

/**
 * Turn a caught data-load error into a message a non-technical visitor can act
 * on. The common case is a 403 when the app is in Spotify "Development Mode"
 * and the signed-in account isn't on the 25-user allowlist.
 */
export function describeDataError(e: unknown, fallback: string): string {
  if (e instanceof SpotifyApiError) {
    if (e.status === 403) {
      return "This app is in Spotify's limited-access mode. Ask the owner to add your Spotify account email to the allowlist, then sign in again.";
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
