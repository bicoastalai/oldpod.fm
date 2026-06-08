/**
 * Provider abstraction for OldPod.fm.
 *
 * The iPod UI (screens, click wheel, lyrics) only ever deals in the normalized
 * media types below. Each music source (Spotify today; YouTube/Audius/Radio
 * planned) implements `MusicProvider` for browse/search and, when it supports
 * in-app playback, a `MusicPlayerController`. New sources slot in by adding a
 * registry entry plus an implementation — no UI changes required.
 *
 */
export type ProviderId = 'demo' | 'spotify' | 'audius' | 'youtube' | 'radio';

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
  /** 0 when a provider does not expose a count. */
  trackCount: number;
  /** True when the current user can enumerate the playlist tracks. */
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

export interface Artist {
  id: string;
  uri: string;
  name: string;
  image: string | null;
}

export type RepeatMode = 'off' | 'context' | 'track';

/**
 * Describes where playback should start. Context-capable providers can play a
 * provider-native collection; ad-hoc lists play from explicit track URIs.
 */
export type PlaySource = { contextUri: string } | { uris: string[] };

export interface ProviderCapabilities {
  /** Requires the user to authenticate before browsing/playing. */
  needsLogin: boolean;
  /** Full-track playback requires a paid subscription on that service. */
  needsPremiumForPlayback: boolean;
  /** Exposes a personal library (playlists / albums / recently played). */
  hasLibrary: boolean;
  /** Exposes artist browsing (followed/top artists → albums/top tracks). */
  hasArtists: boolean;
  /** Supports text search. */
  hasSearch: boolean;
  /** Playback position can be seeked (false for live radio streams). */
  canSeek: boolean;
}

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  /** One-line description shown in the Sources screen. */
  blurb: string;
  /** `ready` = selectable now; `planned` = on the roadmap, not yet wired. */
  status: 'ready' | 'planned';
  capabilities: ProviderCapabilities;
}

/**
 * Browse/search side of a music source. Current Spotify and demo services
 * implement this, and future sources add their own implementations.
 */
export interface MusicProvider {
  meta: ProviderMeta;
  getPlaylists(): Promise<Playlist[]>;
  getTracks(playlistId: string): Promise<Track[]>;
  getAlbums(): Promise<Album[]>;
  getAlbumTracks(album: Album): Promise<Track[]>;
  getRecentlyPlayed(): Promise<Track[]>;
  search(query: string): Promise<Track[]>;
  // Optional default browse list (e.g. Audius "Trending"). Present when a
  // source has no personal library but can surface a curated/popular feed.
  getTrending?(): Promise<Track[]>;
  // Optional artist browsing — present only when capabilities.hasArtists.
  getArtists?(): Promise<Artist[]>;
  getArtistAlbums?(artist: Artist): Promise<Album[]>;
  getArtistTopTracks?(artist: Artist): Promise<Track[]>;
}

/**
 * Playback/control side of a music source. Spotify implements this through the
 * Web Playback SDK today; later sources can back it with <audio> or an iframe.
 */
export interface MusicPlayerController {
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
