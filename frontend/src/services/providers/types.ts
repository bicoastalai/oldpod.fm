/**
 * Provider abstraction for OldPod.fm.
 *
 * The iPod UI (screens, click wheel, lyrics) only ever deals in the normalized
 * media types below. Each music source (Spotify today; YouTube/Audius/Radio
 * planned) implements `MusicProvider` for browse/search and, when it supports
 * in-app playback, a `MusicPlayerController`. New sources slot in by adding a
 * registry entry plus an implementation — no UI changes required.
 *
 * Media types live in `../spotify` for now and are re-exported here so callers
 * can import them from a source-neutral path.
 */
export type { Track, Playlist, Album, Artist, PlaySource, RepeatMode } from '../spotify';

export type ProviderId = 'demo' | 'spotify' | 'audius' | 'youtube' | 'radio';

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
 * Browse/search side of a music source. Mirrors the existing `SpotifyService`
 * data methods so the current Spotify implementation already conforms.
 */
export interface MusicProvider {
  meta: ProviderMeta;
  getPlaylists(): Promise<import('../spotify').Playlist[]>;
  getTracks(playlistId: string): Promise<import('../spotify').Track[]>;
  getAlbums(): Promise<import('../spotify').Album[]>;
  getAlbumTracks(album: import('../spotify').Album): Promise<import('../spotify').Track[]>;
  getRecentlyPlayed(): Promise<import('../spotify').Track[]>;
  search(query: string): Promise<import('../spotify').Track[]>;
  // Optional artist browsing — present only when capabilities.hasArtists.
  getArtists?(): Promise<import('../spotify').Artist[]>;
  getArtistAlbums?(artist: import('../spotify').Artist): Promise<import('../spotify').Album[]>;
  getArtistTopTracks?(artist: import('../spotify').Artist): Promise<import('../spotify').Track[]>;
}
