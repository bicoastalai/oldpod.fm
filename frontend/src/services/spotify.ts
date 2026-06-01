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
  name: string;
  trackCount: number;
}

export interface SpotifyService {
  getPlaylists(): Promise<Playlist[]>;
  getTracks(playlistId: string): Promise<Track[]>;
  playTrack(playlistId: string, trackIndex: number, deviceId: string): Promise<void>;
  pause(deviceId: string): Promise<void>;
  resume(deviceId: string): Promise<void>;
  next(deviceId: string): Promise<void>;
  previous(deviceId: string): Promise<void>;
  seek(positionMs: number, deviceId: string): Promise<void>;
  setVolume(volumePct: number): Promise<void>;
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
  { id: 'liked', name: 'Liked Songs', trackCount: MOCK_TRACKS.liked.length },
  { id: 'chill', name: 'Chill Vibes', trackCount: MOCK_TRACKS.chill.length },
  { id: 'road', name: 'Road Trip', trackCount: MOCK_TRACKS.road.length },
  { id: 'workout', name: 'Workout Mix', trackCount: MOCK_TRACKS.workout.length },
  { id: 'late', name: 'Late Night', trackCount: MOCK_TRACKS.late.length },
];

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
    async playTrack() {},
    async pause() {},
    async resume() {},
    async next() {},
    async previous() {},
    async seek() {},
    async setVolume() {},
  };
}

// ── Real Spotify service ───────────────────────────────────

export function createSpotifyService(accessToken: string): SpotifyService {
  const api = (path: string, opts: RequestInit = {}) =>
    fetch(`https://api.spotify.com/v1${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(opts.headers ?? {}),
      },
    });

  return {
    async getPlaylists() {
      const res = await api('/me/playlists?limit=50');
      const data = await res.json();
      return (data.items ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        trackCount: p.tracks?.total ?? 0,
      }));
    },

    async getTracks(playlistId) {
      const res = await api(`/playlists/${playlistId}/tracks?limit=100`);
      const data = await res.json();
      return (data.items ?? [])
        .filter((item: any) => item?.track?.id)
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

    async playTrack(playlistId, trackIndex, deviceId) {
      await api(`/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        body: JSON.stringify({
          context_uri: `spotify:playlist:${playlistId}`,
          offset: { position: trackIndex },
          position_ms: 0,
        }),
      });
    },

    async pause(deviceId) {
      await api(`/me/player/pause?device_id=${deviceId}`, { method: 'PUT' });
    },

    async resume(deviceId) {
      await api(`/me/player/play?device_id=${deviceId}`, { method: 'PUT' });
    },

    async next(deviceId) {
      await api(`/me/player/next?device_id=${deviceId}`, { method: 'POST' });
    },

    async previous(deviceId) {
      await api(`/me/player/previous?device_id=${deviceId}`, { method: 'POST' });
    },

    async seek(positionMs, deviceId) {
      await api(`/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`, { method: 'PUT' });
    },

    async setVolume(volumePct) {
      await api(`/me/player/volume?volume_percent=${Math.round(volumePct)}`, { method: 'PUT' });
    },
  };
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
