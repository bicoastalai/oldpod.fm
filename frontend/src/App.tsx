import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ClickWheel from './components/ClickWheel';
import LyricsScreen from './components/LyricsScreen';
import SearchScreen, { SEARCH_KEYS } from './components/SearchScreen';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useYouTubePlayer } from './hooks/useYouTubePlayer';
import { useAppleMusicPlayer } from './hooks/useAppleMusicPlayer';
import { useClickFeedback } from './hooks/useClickFeedback';
import {
  albumArtPlaceholder,
  createMockService,
  createSpotifyService,
  describeDataError,
  formatTime,
} from './services/spotify';
import { createAudiusService } from './services/audius';
import { createRadioService, reportStationClick } from './services/radio';
import { createPodcastsService } from './services/podcasts';
import {
  createYouTubeService,
  isYouTubeKeyConfigured,
  YOUTUBE_NO_KEY_MESSAGE,
} from './services/youtube';
import {
  APPLE_CONNECTING_MESSAGE,
  APPLE_SIGN_IN_CANCELLED_MESSAGE,
  APPLE_UNAVAILABLE_MESSAGE,
  authorizeAppleMusic,
  createAppleMusicService,
  ensureAppleMusicConfigured,
  getAppleMusicBootstrapFailureMessage,
  prewarmAppleMusic,
  unauthorizeAppleMusic,
} from './services/apple-music';
import type {
  Album,
  Artist,
  MusicPlayerController,
  MusicProvider,
  Playlist,
  PlaySource,
  ProviderId,
  ProviderMeta,
  RepeatMode,
  Track,
} from './services/providers/types';
import {
  exchangeCodeForToken,
  getRedirectUriWarning,
  getStoredToken,
  isSpotifyConnected,
  logout,
  refreshAccessToken,
  redirectToSpotifyLogin,
} from './services/auth';
import { fetchLyrics, type TrackLyrics } from './services/lyrics';
import { getProviderMeta, PROVIDERS } from './services/providers/registry';

// ── Types ──────────────────────────────────────────────────

type Screen =
  | 'login'
  | 'mainMenu'
  | 'music'
  | 'playlists'
  | 'albums'
  | 'artists'
  | 'artist'
  | 'tracks'
  | 'nowPlaying'
  | 'lyrics'
  | 'settings'
  | 'sources'
  | 'search';

type Theme = 'light' | 'black';

interface NavEntry {
  screen: Screen;
  index: number;
}

const MAIN_MENU = ['Music', 'Search', 'Now Playing', 'Sources', 'Settings'];

// The Music submenu is built from the active source's capabilities (see
// `musicMenuItems`); `kind` maps a row to its loader in `doSelect`.
type MusicMenuKind = 'playlists' | 'albums' | 'artists' | 'recent' | 'trending' | 'trendingAlbums';
interface MusicMenuEntry {
  label: string;
  kind: MusicMenuKind;
}
// The artist drill-down is likewise capability-driven: "Top Tracks" only
// appears for sources that still expose it (Spotify Dev Mode 403s it), while
// "Albums" stays (see `artistMenuItems`).
type ArtistMenuKind = 'topTracks' | 'albums';
interface ArtistMenuEntry {
  label: string;
  kind: ArtistMenuKind;
}
// Settings rows carry an action kind because the list is dynamic: per-provider
// sign-out rows appear only for providers with a stored connection.
type SettingsKind =
  | 'shuffle'
  | 'repeat'
  | 'theme'
  | 'sound'
  | 'haptics'
  | 'about'
  | 'privacy'
  | 'terms'
  | 'signOutSpotify'
  | 'disconnectApple';
interface SettingsEntry {
  label: string;
  detail?: string;
  arrow?: boolean;
  kind: SettingsKind;
}

const REPEAT_ORDER: RepeatMode[] = ['off', 'context', 'track'];

// Privacy Policy & Terms are hosted by the owner on bicoastalai.com; the exact
// paths can be adjusted there later without code changes here.
const LEGAL_PRIVACY_URL = 'https://bicoastalai.com/privacy';
const LEGAL_TERMS_URL = 'https://bicoastalai.com/terms';

// Sources whose playback is a single-track engine (HTML5 <audio> / YouTube
// IFrame / MusicKit) rather than Spotify's context-based SDK or the demo timer.
// App routes these through one shared `TrackPlayer` adapter (see `activePlayer`).
interface TrackPlayer {
  loadAndPlay: (track: Track) => Promise<void> | void;
  pause: () => void;
  resume: () => Promise<void> | void;
  seek: (positionMs: number) => void;
  setVolume: (volumePct: number) => void;
  stop: () => void;
}

type ActiveMusicService = MusicProvider & MusicPlayerController;

const SCREEN_TITLES: Record<Screen, string> = {
  login: 'OldPod.fm',
  mainMenu: 'iPod',
  music: 'Music',
  playlists: 'Playlists',
  albums: 'Albums',
  artists: 'Artists',
  artist: 'Artist',
  tracks: 'Songs',
  nowPlaying: 'Now Playing',
  lyrics: 'Lyrics',
  settings: 'Settings',
  sources: 'Sources',
  search: 'Search',
};

// ── Helpers ────────────────────────────────────────────────

function visibleWindow<T>(items: T[], selectedIdx: number, windowSize = 7): [T[], number] {
  const half = Math.floor(windowSize / 2);
  let start = Math.max(0, selectedIdx - half);
  const end = Math.min(items.length, start + windowSize);
  start = Math.max(0, end - windowSize);
  return [items.slice(start, end), selectedIdx - start];
}

// Picks the next track index, honouring shuffle. Used for demo auto-advance.
function pickNextIndex(curr: number, len: number, shuffle: boolean): number {
  if (len <= 0) return 0;
  if (shuffle && len > 1) {
    let n = curr;
    while (n === curr) n = Math.floor(Math.random() * len);
    return n;
  }
  return curr + 1;
}

function repeatLabel(mode: RepeatMode): string {
  return mode === 'off' ? 'Off' : mode === 'context' ? 'All' : 'One';
}

// Requirement phrasing shared by the entry gate and the Sources screen so the
// two stay in sync. Speaks to what the user needs, not Free/Premium marketing.
function requirementLabel(p: ProviderMeta): string {
  if (p.id === 'demo') return 'No account needed';
  if (p.capabilities.needsLogin) {
    return p.capabilities.needsPremiumForPlayback ? 'Sign in required · Premium to play' : 'Sign in required';
  }
  return 'No account needed';
}

// A row on the first-run entry gate. The gate is intentionally a fixed,
// three-row decision (free vs. the two premium accounts); every other source
// (YouTube, Demo) lives in Main Menu › Sources.
interface EntrySource {
  id: SourceId;
  label: string;
  /** Status-line text shown only while this row is highlighted. */
  detail: string;
}

const ENTRY_SOURCES: EntrySource[] = [
  { id: 'audius', label: 'Listen Free', detail: 'No account needed' },
  { id: 'spotify', label: 'Spotify', detail: 'Sign in · Premium to play' },
  { id: 'applemusic', label: 'Apple Music', detail: 'Sign in · Premium to play' },
];

// ── Active-source persistence ──────────────────────────────

// A source the user can actually be *in* (every ready provider). Persisted in
// localStorage under `source` so returning users skip the entry gate.
type SourceId = ProviderId;

function isSourceId(value: string | null): value is SourceId {
  return (
    value === 'demo' ||
    value === 'spotify' ||
    value === 'audius' ||
    value === 'youtube' ||
    value === 'applemusic' ||
    value === 'radio' ||
    value === 'podcasts'
  );
}

// The remembered active source, or null for first-run/signed-out users (gate).
// Falls back to the legacy keys (`demo_mode`, bare Spotify tokens) written
// before `source` covered every provider.
function getStoredSource(): SourceId | null {
  const stored = localStorage.getItem('source');
  if (isSourceId(stored)) return stored;
  if (localStorage.getItem('demo_mode') === '1') return 'demo';
  if (isSpotifyConnected()) return 'spotify';
  return null;
}

// ── App ────────────────────────────────────────────────────

export default function App() {
  // Navigation. Returning users (any remembered source) boot straight into the
  // main menu; only first-run/signed-out users see the entry gate.
  const [nav, setNav] = useState<NavEntry[]>(() => [
    { screen: getStoredSource() ? 'mainMenu' : 'login', index: 0 },
  ]);
  const cur = nav[nav.length - 1];
  const currentScreen = cur.screen;
  const selectedIndex = cur.index;

  const push = useCallback((screen: Screen) => {
    setNav((prev) => [...prev, { screen, index: 0 }]);
  }, []);

  const pop = useCallback(() => {
    setNav((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const setIndex = useCallback((idx: number) => {
    setNav((prev) =>
      prev.map((e, i) => (i === prev.length - 1 ? { ...e, index: idx } : e))
    );
  }, []);

  // Relative move with clamping via a functional update, so rapid wheel ticks
  // in one frame accumulate instead of collapsing to a single step.
  const moveSelection = useCallback((delta: number, listLen: number) => {
    setNav((prev) =>
      prev.map((e, i) =>
        i === prev.length - 1
          ? { ...e, index: Math.max(0, Math.min(listLen - 1, e.index + delta)) }
          : e
      )
    );
  }, []);

  // Auth / source. Connections are independent of the active source: signing
  // into one provider never disturbs another's stored session, and the Sources
  // screen switches between connected providers without re-auth.
  const [accessToken, setAccessToken] = useState<string | null>(getStoredToken);
  const [activeSource, setActiveSource] = useState<SourceId | null>(getStoredSource);
  const [spotifyConnected, setSpotifyConnected] = useState(isSpotifyConnected);
  // MusicKit's own persisted authorization isn't queryable synchronously at
  // boot (configure is async), so we mirror it in an `apple_connected` flag.
  const [appleConnected, setAppleConnected] = useState(
    () => localStorage.getItem('apple_connected') === '1'
  );
  const [dataError, setDataError] = useState<string | null>(null);
  // Feedback shown on the source-selection screens (entry gate + Sources) while
  // connecting to / failing to reach a source that needs config or sign-in.
  // Kept separate from `dataError` so it never leaks into browse/playback screens.
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);
  // Guards against firing a second MusicKit authorize() popup while one is open.
  const appleConnectingRef = useRef(false);

  // Service
  const [service, setService] = useState<ActiveMusicService | null>(null);

  // Which source is currently active (drives the Sources screen highlight).
  // Defaults to Spotify only for screens that need *a* provider id while the
  // user is still on the gate (no source committed yet).
  const activeProviderId: ProviderId = activeSource ?? 'spotify';
  const isDemoMode = activeSource === 'demo';
  const isAudius = activeProviderId === 'audius';
  const isRadio = activeProviderId === 'radio';
  const isPodcasts = activeProviderId === 'podcasts';
  const isYouTube = activeProviderId === 'youtube';
  const isAppleMusic = activeProviderId === 'applemusic';
  const isSpotify = activeProviderId === 'spotify';
  // Sources whose playback runs through the shared HTML5 <audio> engine.
  const usesAudioEngine = isAudius || isRadio || isPodcasts;

  // Data
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trackSource, setTrackSource] = useState<PlaySource | null>(null);
  const [tracksTitle, setTracksTitle] = useState('Songs');
  // The albums screen doubles as podcast show lists ("Top Podcasts" / results).
  const [albumsTitle, setAlbumsTitle] = useState('Albums');
  const [isLoading, setIsLoading] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Theme
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme');
    return stored === 'light' ? 'light' : 'black';
  });

  // Tactile navigation feedback (synthesized click sound + haptics), with
  // Settings toggles persisted to localStorage. Independent of media playback.
  const feedback = useClickFeedback();

  // Lyrics (LRCLib)
  const [lyrics, setLyrics] = useState<TrackLyrics | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsUserScrolled, setLyricsUserScrolled] = useState(false);
  const lyricsTrackIdRef = useRef<string | null>(null);

  // Playback options
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');

  // Playback state (demo-mode managed here; real mode driven by SDK)
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [volume, setVolume] = useState(80);
  const playingTracksRef = useRef<Track[]>([]);

  // Seek/scrub bookkeeping. positionRef avoids stale reads while spinning the
  // wheel; scrubbingUntilRef briefly suppresses SDK position echoes so the bar
  // doesn't jump backwards mid-scrub.
  const positionRef = useRef(0);
  const scrubbingUntilRef = useRef(0);
  const seekTimerRef = useRef<number | null>(null);

  useEffect(() => {
    positionRef.current = positionMs;
  }, [positionMs]);

  // Spotify SDK player (real mode)
  const {
    deviceId,
    isReady,
    playerError,
    sdkState,
    activatePlayback,
    runWithDevice,
    setPlayerVolume,
    getDeviceVolume,
    volumeControllable,
  } = useSpotifyPlayer(accessToken);

  // The single-track engines (Audius <audio>, YouTube IFrame, Apple MusicKit)
  // all share one end-of-track handler: it advances the queue using the active
  // engine's own `loadAndPlay`. Kept in a ref so each hook keeps a stable
  // callback while still seeing fresh shuffle/repeat/index state.
  const singleTrackEndedRef = useRef<() => void>(() => {});
  const onSingleTrackEnded = useCallback(() => singleTrackEndedRef.current(), []);

  // HTML5 <audio> player (Audius and other DRM-free sources).
  const audio = useAudioPlayer(onSingleTrackEnded);
  // YouTube IFrame player (routed by provider id, same pattern as Audius).
  const youtube = useYouTubePlayer(onSingleTrackEnded);
  // Apple Music player (MusicKit, with a 30s-preview fallback for non-
  // subscribers). Same single-track contract as Audius/YouTube.
  const apple = useAppleMusicPlayer(onSingleTrackEnded);

  // The active single-track engine (or null for Spotify/demo), exposed through a
  // uniform adapter so the playback handlers don't branch per-source. Each
  // engine's controls are stable callbacks, so this only changes when the
  // active source changes.
  const activePlayer = useMemo<TrackPlayer | null>(() => {
    // Audius tracks and podcast episodes are both plain, seekable audio URLs.
    if (isAudius || isPodcasts) {
      return {
        loadAndPlay: (track) => audio.loadAndPlay(track.uri),
        pause: audio.pause,
        resume: audio.resume,
        seek: audio.seek,
        setVolume: audio.setVolume,
        stop: audio.stop,
      };
    }
    if (isRadio) {
      return {
        loadAndPlay: (track) => {
          // Radio Browser etiquette: count a click when a station starts.
          reportStationClick(track.id);
          return audio.loadAndPlay(track.uri);
        },
        pause: audio.pause,
        resume: audio.resume,
        // Live streams aren't seekable — keep wheel scrubbing a silent no-op.
        seek: () => {},
        setVolume: audio.setVolume,
        stop: audio.stop,
      };
    }
    if (isYouTube) {
      return {
        loadAndPlay: (track) => youtube.loadAndPlay(track.id),
        pause: youtube.pause,
        resume: youtube.resume,
        seek: youtube.seek,
        setVolume: youtube.setVolume,
        stop: youtube.stop,
      };
    }
    if (isAppleMusic) {
      return {
        loadAndPlay: (track) => apple.loadAndPlay(track),
        pause: apple.pause,
        resume: apple.resume,
        seek: apple.seek,
        setVolume: apple.setVolume,
        stop: apple.stop,
      };
    }
    return null;
  }, [
    isAudius, isPodcasts, isRadio, isYouTube, isAppleMusic,
    audio.loadAndPlay, audio.pause, audio.resume, audio.seek, audio.setVolume, audio.stop,
    youtube.loadAndPlay, youtube.pause, youtube.resume, youtube.seek, youtube.setVolume, youtube.stop,
    apple.loadAndPlay, apple.pause, apple.resume, apple.seek, apple.setVolume, apple.stop,
  ]);

  // Position/playing state of the active single-track engine, for syncing into
  // the shared UI playback state below.
  const activePlayerState = usesAudioEngine
    ? audio.audioState
    : isYouTube
      ? youtube.playerState
      : isAppleMusic
        ? apple.playerState
        : null;

  const resolveSpotifyToken = useCallback(async (): Promise<string | null> => {
    let token = getStoredToken();
    if (!token) token = await refreshAccessToken();
    if (token) {
      setAccessToken(token);
      return token;
    }
    return null;
  }, []);

  // Mirror the device's real (SDK) volume into the bar while Now Playing is
  // visible. iOS is hardware-locked (volumeControllable = false), so we leave
  // the bar alone there and show a device-controlled hint instead.
  useEffect(() => {
    if (!isSpotify || !volumeControllable || currentScreen !== 'nowPlaying') return;
    let active = true;
    const sync = async () => {
      const v = await getDeviceVolume();
      if (active && v !== null) setVolume(v);
    };
    void sync();
    const id = window.setInterval(() => void sync(), 1000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [isSpotify, volumeControllable, currentScreen, getDeviceVolume]);

  // Keep the active single-track engine's volume in sync with the volume bar.
  useEffect(() => {
    if (activePlayer) activePlayer.setVolume(volume);
  }, [activePlayer, volume]);

  // ── Init service + session bootstrap ─────────────────────

  useEffect(() => {
    if (activeSource === null) {
      setService(null);
      return;
    }
    if (activeSource === 'demo') setService(createMockService());
    else if (activeSource === 'audius') setService(createAudiusService());
    else if (activeSource === 'radio') setService(createRadioService());
    else if (activeSource === 'podcasts') setService(createPodcastsService());
    else if (activeSource === 'youtube') setService(createYouTubeService());
    else if (activeSource === 'applemusic') setService(createAppleMusicService());
    else setService(createSpotifyService(resolveSpotifyToken));
  }, [activeSource, resolveSpotifyToken]);

  // Validate the remembered source once at boot. If it can't initialize
  // (YouTube key missing, Apple Music bootstrap fails), fall back to the gate
  // with the specific inline notice instead of leaving the user in a dead mode.
  const bootValidatedRef = useRef(false);
  useEffect(() => {
    if (bootValidatedRef.current) return;
    bootValidatedRef.current = true;
    const fallBackToGate = (notice: string) => {
      localStorage.removeItem('source');
      setActiveSource(null);
      setSourceNotice(notice);
      setNav([{ screen: 'login', index: 0 }]);
    };
    if (activeSource === 'youtube' && !isYouTubeKeyConfigured()) {
      fallBackToGate(YOUTUBE_NO_KEY_MESSAGE);
      return;
    }
    if (activeSource === 'applemusic') {
      void ensureAppleMusicConfigured().then((music) => {
        if (music) {
          // Migrate pre-flag sessions: MusicKit kept the user authorized.
          if (music.isAuthorized) {
            localStorage.setItem('apple_connected', '1');
            setAppleConnected(true);
          }
          return;
        }
        fallBackToGate(getAppleMusicBootstrapFailureMessage() ?? APPLE_UNAVAILABLE_MESSAGE);
      });
    }
  }, [activeSource]);

  // Pre-warm the MusicKit bootstrap while a source-selection screen is up, so
  // tapping Apple Music calls authorize() within the tap's user activation —
  // iOS Safari blocks the sign-in popup if the token fetch / script load /
  // configure awaits run between the tap and window.open.
  useEffect(() => {
    if (currentScreen === 'login' || currentScreen === 'sources') {
      prewarmAppleMusic();
    }
  }, [currentScreen]);

  // ── Handle PKCE callback (?code=...) ────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    window.history.replaceState(null, '', window.location.pathname);
    exchangeCodeForToken(code).then((tok) => {
      localStorage.setItem('source', 'spotify');
      localStorage.removeItem('demo_mode');
      setAccessToken(tok);
      setSpotifyConnected(true);
      setActiveSource('spotify');
      setNav([{ screen: 'mainMenu', index: 0 }]);
    }).catch(console.error);
  }, []);

  // ── Apply theme ──────────────────────────────────────────

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  // ── SDK state sync (real mode) ───────────────────────────

  useEffect(() => {
    if (!sdkState || !isSpotify) return;
    setIsPlaying(sdkState.isPlaying);
    // Don't clobber the user's scrub position with an in-flight SDK echo.
    if (Date.now() >= scrubbingUntilRef.current) setPositionMs(sdkState.positionMs);
    if (sdkState.track) setCurrentTrack(sdkState.track);
  }, [sdkState, isSpotify]);

  // ── Single-track engine (Audius / YouTube / Apple Music) state sync ──

  useEffect(() => {
    if (!activePlayerState) return;
    setIsPlaying(activePlayerState.isPlaying);
    if (Date.now() >= scrubbingUntilRef.current) setPositionMs(activePlayerState.positionMs);
  }, [activePlayerState]);

  // ── Demo mode position timer ─────────────────────────────

  useEffect(() => {
    if (!isDemoMode || !isPlaying || !currentTrack) return;
    const id = setInterval(() => {
      setPositionMs((prev) => {
        if (prev + 1000 < currentTrack.durationMs) return prev + 1000;

        // Track finished — decide what plays next based on repeat/shuffle.
        const list = playingTracksRef.current;
        if (repeat === 'track') return 0;

        const nextIdx = pickNextIndex(currentTrackIndex, list.length, shuffle);
        if (nextIdx < list.length) {
          const next = list[nextIdx];
          setCurrentTrackIndex(nextIdx);
          setCurrentTrack(next);
          return 0;
        }
        if (repeat === 'context' && list.length > 0) {
          setCurrentTrackIndex(0);
          setCurrentTrack(list[0]);
          return 0;
        }
        setIsPlaying(false);
        return currentTrack.durationMs;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isDemoMode, isPlaying, currentTrack, currentTrackIndex, repeat, shuffle]);

  // ── Data loaders ─────────────────────────────────────────

  const loadPlaylists = useCallback(async () => {
    if (!service) return;
    setIsLoading(true);
    setDataError(null);
    try {
      setPlaylists(await service.getPlaylists());
    } catch (e) {
      setPlaylists([]);
      setDataError(describeDataError(e, 'Could not load playlists'));
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  const loadAlbums = useCallback(async () => {
    if (!service) return;
    setIsLoading(true);
    setDataError(null);
    setAlbumsTitle('Albums');
    try {
      setAlbums(await service.getAlbums());
    } catch (e) {
      setAlbums([]);
      setDataError(describeDataError(e, 'Could not load albums'));
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  const loadPlaylistTracks = useCallback(
    async (playlist: Playlist) => {
      if (!service) return;
      setIsLoading(true);
      setDataError(null);
      setTracks([]);
      setTracksTitle(playlist.name);
      // Always set the context so playback works even if we can't list songs.
      setTrackSource({ contextUri: playlist.uri });
      try {
        const data = await service.getTracks(playlist.id);
        setTracks(data);
        if (data.length === 0 && !playlist.owned) {
          setDataError(
            "Spotify no longer lets apps list songs for playlists you don't own. Press Play to start it."
          );
        }
      } catch (e) {
        setDataError(describeDataError(e, 'Could not load songs'));
      } finally {
        setIsLoading(false);
      }
    },
    [service]
  );

  const loadAlbumTracks = useCallback(
    async (album: Album) => {
      if (!service) return;
      setIsLoading(true);
      setDataError(null);
      setTracks([]);
      setTracksTitle(album.name);
      setTrackSource({ contextUri: album.uri });
      try {
        const data = await service.getAlbumTracks(album);
        setTracks(data);
        // Single-track engines (Audius / radio / podcasts / YouTube / Apple)
        // play explicit track lists; only context-capable providers (Spotify,
        // demo) keep the "play the whole context" fallback row when empty.
        if (activePlayer) setTrackSource(data.length > 0 ? { uris: data.map((t) => t.uri) } : null);
      } catch (e) {
        setDataError(describeDataError(e, 'Could not load album'));
      } finally {
        setIsLoading(false);
      }
    },
    [service, activePlayer]
  );

  const loadArtists = useCallback(async () => {
    if (!service?.getArtists) return;
    setIsLoading(true);
    setDataError(null);
    try {
      const data = await service.getArtists();
      setArtists(data);
      if (data.length === 0) setDataError('No followed or top artists');
    } catch (e) {
      setArtists([]);
      setDataError(describeDataError(e, 'Could not load artists'));
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  const loadArtistAlbums = useCallback(
    async (artist: Artist) => {
      if (!service?.getArtistAlbums) return;
      setIsLoading(true);
      setDataError(null);
      setAlbums([]);
      setAlbumsTitle('Albums');
      try {
        const data = await service.getArtistAlbums(artist);
        setAlbums(data);
        if (data.length === 0) setDataError('No albums');
      } catch (e) {
        setDataError(describeDataError(e, 'Could not load albums'));
      } finally {
        setIsLoading(false);
      }
    },
    [service]
  );

  const loadArtistTopTracks = useCallback(
    async (artist: Artist) => {
      if (!service?.getArtistTopTracks) return;
      setIsLoading(true);
      setDataError(null);
      setTracks([]);
      setTracksTitle(artist.name);
      try {
        const data = await service.getArtistTopTracks(artist);
        setTracks(data);
        setTrackSource({ uris: data.map((t) => t.uri) });
        if (data.length === 0) setDataError('No top tracks');
      } catch (e) {
        setDataError(describeDataError(e, 'Could not load top tracks'));
      } finally {
        setIsLoading(false);
      }
    },
    [service]
  );

  const loadRecentlyPlayed = useCallback(async () => {
    if (!service) return;
    setIsLoading(true);
    setDataError(null);
    setTracks([]);
    setTracksTitle('Recently Played');
    try {
      const data = await service.getRecentlyPlayed();
      setTracks(data);
      setTrackSource({ uris: data.map((t) => t.uri) });
    } catch (e) {
      setDataError(describeDataError(e, 'Could not load recently played'));
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  // Audius has no listening history; "Trending" is its default browse list.
  const loadTrending = useCallback(async () => {
    if (!service?.getTrending) return;
    setIsLoading(true);
    setDataError(null);
    setTracks([]);
    setTracksTitle('Trending');
    try {
      const data = await service.getTrending();
      setTracks(data);
      setTrackSource({ uris: data.map((t) => t.uri) });
      if (data.length === 0) setDataError('No trending tracks');
    } catch (e) {
      setDataError(describeDataError(e, 'Could not load trending'));
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  // Podcasts' default browse list: the Apple top-podcasts chart, shown on the
  // albums screen (shows drill into episodes like album → tracks).
  const loadTrendingShows = useCallback(async () => {
    if (!service?.getTrendingAlbums) return;
    setIsLoading(true);
    setDataError(null);
    setAlbums([]);
    setAlbumsTitle('Top Podcasts');
    try {
      const data = await service.getTrendingAlbums();
      setAlbums(data);
      if (data.length === 0) setDataError('No podcasts');
    } catch (e) {
      setDataError(describeDataError(e, 'Could not load podcasts'));
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  const runSearch = useCallback(
    async (query: string) => {
      if (!service) return;
      setIsLoading(true);
      setDataError(null);
      // Collection-shaped sources (podcasts) search for shows, not tracks.
      if (service.searchAlbums) {
        setAlbums([]);
        setAlbumsTitle('Podcasts');
        try {
          const data = await service.searchAlbums(query);
          setAlbums(data);
          if (data.length === 0) setDataError('No results');
        } catch (e) {
          setDataError(describeDataError(e, 'Search failed'));
        } finally {
          setIsLoading(false);
        }
        return;
      }
      setTracks([]);
      setTracksTitle('Results');
      try {
        const data = await service.search(query);
        setTracks(data);
        setTrackSource({ uris: data.map((t) => t.uri) });
        if (data.length === 0) setDataError('No results');
      } catch (e) {
        setDataError(describeDataError(e, 'Search failed'));
      } finally {
        setIsLoading(false);
      }
    },
    [service]
  );

  // ── Playback controls ─────────────────────────────────────

  const playFromList = useCallback(
    async (trackList: Track[], idx: number, source: PlaySource) => {
      const track = trackList[idx];
      if (!track) return;
      playingTracksRef.current = trackList;
      setCurrentTrack(track);
      setCurrentTrackIndex(idx);
      setPositionMs(0);
      setIsPlaying(true);
      // Single-track engines (Audius / YouTube / Apple Music) load one track.
      if (activePlayer) {
        await activePlayer.loadAndPlay(track);
        return;
      }
      // Demo mode is driven by the simulated position timer; Spotify by the SDK.
      if (!isDemoMode && service) {
        try {
          await activatePlayback();
          await runWithDevice((id) => service.play(source, idx, id));
        } catch {
          setIsPlaying(false);
        }
      }
    },
    [activePlayer, isDemoMode, service, activatePlayback, runWithDevice]
  );

  // Start a context (playlist/album) without a known track list — relies on the
  // SDK to report the now-playing track. Used for playlists we can't enumerate.
  const playContext = useCallback(
    async (source: PlaySource) => {
      if (isDemoMode || !service) return;
      setPositionMs(0);
      setIsPlaying(true);
      try {
        await activatePlayback();
        await runWithDevice((id) => service.play(source, 0, id));
      } catch {
        setIsPlaying(false);
      }
    },
    [isDemoMode, service, activatePlayback, runWithDevice]
  );

  const togglePlay = useCallback(async () => {
    const next = !isPlaying;
    setIsPlaying(next);
    if (activePlayer) {
      if (next) await activePlayer.resume();
      else activePlayer.pause();
      return;
    }
    if (!isDemoMode && service) {
      try {
        await activatePlayback();
        await runWithDevice((id) => (next ? service.resume(id) : service.pause(id)));
      } catch {
        setIsPlaying(!next);
      }
    }
  }, [isPlaying, activePlayer, isDemoMode, service, activatePlayback, runWithDevice]);

  const skipNext = useCallback(async () => {
    const list = playingTracksRef.current;
    const nextIdx = pickNextIndex(currentTrackIndex, list.length, shuffle);
    const nextTrack = nextIdx < list.length ? list[nextIdx] : null;
    if (nextTrack) {
      setCurrentTrack(nextTrack);
      setCurrentTrackIndex(nextIdx);
      setPositionMs(0);
    }
    if (activePlayer) {
      if (nextTrack) await activePlayer.loadAndPlay(nextTrack);
      return;
    }
    if (!isDemoMode && service) {
      try {
        await activatePlayback();
        await runWithDevice((id) => service.next(id));
      } catch {
        /* keep UI state */
      }
    }
  }, [currentTrackIndex, shuffle, activePlayer, isDemoMode, service, activatePlayback, runWithDevice]);

  const skipPrev = useCallback(async () => {
    const list = playingTracksRef.current;
    if (positionMs > 3000 || currentTrackIndex === 0) {
      setPositionMs(0);
      if (activePlayer) {
        activePlayer.seek(0);
        return;
      }
      if (!isDemoMode && service) {
        try {
          await activatePlayback();
          await runWithDevice((id) => service.seek(0, id));
        } catch {
          /* keep UI state */
        }
      }
    } else {
      const prevIdx = currentTrackIndex - 1;
      const prevTrack = list[prevIdx];
      setCurrentTrack(prevTrack);
      setCurrentTrackIndex(prevIdx);
      setPositionMs(0);
      if (activePlayer) {
        if (prevTrack) await activePlayer.loadAndPlay(prevTrack);
        return;
      }
      if (!isDemoMode && service) {
        try {
          await activatePlayback();
          await runWithDevice((id) => service.previous(id));
        } catch {
          /* keep UI state */
        }
      }
    }
  }, [currentTrackIndex, positionMs, activePlayer, isDemoMode, service, activatePlayback, runWithDevice]);

  // When a single-track engine's track ends, advance the queue with the same
  // repeat/shuffle rules as demo mode, using the active engine's loadAndPlay.
  // Kept in a ref so each hook's `ended` listener always runs the latest logic.
  useEffect(() => {
    singleTrackEndedRef.current = () => {
      if (!activePlayer) return;
      // A live radio stream only "ends" when the connection drops — never
      // auto-advance to another station; just reflect the stopped state.
      if (isRadio) {
        setIsPlaying(false);
        return;
      }
      const list = playingTracksRef.current;
      if (repeat === 'track') {
        const t = list[currentTrackIndex] ?? currentTrack;
        if (t) void activePlayer.loadAndPlay(t);
        return;
      }
      const nextIdx = pickNextIndex(currentTrackIndex, list.length, shuffle);
      if (nextIdx < list.length) {
        const next = list[nextIdx];
        setCurrentTrack(next);
        setCurrentTrackIndex(nextIdx);
        setPositionMs(0);
        void activePlayer.loadAndPlay(next);
        return;
      }
      if (repeat === 'context' && list.length > 0) {
        const first = list[0];
        setCurrentTrack(first);
        setCurrentTrackIndex(0);
        setPositionMs(0);
        void activePlayer.loadAndPlay(first);
        return;
      }
      setIsPlaying(false);
    };
  }, [repeat, shuffle, currentTrackIndex, currentTrack, activePlayer, isRadio]);

  const adjustVolume = useCallback(
    (delta: number) => {
      const newVol = Math.max(0, Math.min(100, volume + delta));
      setVolume(newVol);
      if (activePlayer) {
        activePlayer.setVolume(newVol);
        return;
      }
      if (!isDemoMode && service && deviceId) {
        void service.setVolume(newVol, deviceId);
        setPlayerVolume(newVol);
      }
    },
    [volume, activePlayer, isDemoMode, service, deviceId, setPlayerVolume]
  );

  // Scrub the current track. Each wheel tick nudges the position; the real
  // seek is debounced so spinning doesn't spam the API.
  const SEEK_STEP_MS = 5000;
  const seekBy = useCallback(
    (deltaMs: number) => {
      const track = currentTrack;
      if (!track) return;
      // Live streams (radio) have no duration — scrubbing is a silent no-op.
      if (track.durationMs <= 0) return;
      const target = Math.max(0, Math.min(track.durationMs, positionRef.current + deltaMs));
      positionRef.current = target;
      setPositionMs(target);
      scrubbingUntilRef.current = Date.now() + 900;
      if (activePlayer) {
        activePlayer.seek(target);
        return;
      }
      if (isDemoMode || !service) return;
      if (seekTimerRef.current) window.clearTimeout(seekTimerRef.current);
      seekTimerRef.current = window.setTimeout(() => {
        void (async () => {
          try {
            await activatePlayback();
            await runWithDevice((id) => service.seek(target, id));
          } catch {
            /* keep optimistic UI */
          }
        })();
      }, 250);
    },
    [currentTrack, activePlayer, isDemoMode, service, activatePlayback, runWithDevice]
  );

  // ── Settings toggles ─────────────────────────────────────

  const toggleShuffle = useCallback(() => {
    const next = !shuffle;
    setShuffle(next);
    if (!isDemoMode && service && deviceId) service.setShuffle(next, deviceId);
  }, [shuffle, isDemoMode, service, deviceId]);

  const cycleRepeat = useCallback(() => {
    const next = REPEAT_ORDER[(REPEAT_ORDER.indexOf(repeat) + 1) % REPEAT_ORDER.length];
    setRepeat(next);
    if (!isDemoMode && service && deviceId) service.setRepeat(next, deviceId);
  }, [repeat, isDemoMode, service, deviceId]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'black' ? 'light' : 'black'));
  }, []);

  // ── Lyrics ────────────────────────────────────────────────

  // Prefetch lyrics as soon as a track becomes current — not only when the
  // Lyrics screen opens — so they're usually ready by the time the user looks.
  // The service memoises per track, so opening the screen reuses this fetch.
  useEffect(() => {
    const track = currentTrack;
    if (!track) {
      setLyrics(null);
      lyricsTrackIdRef.current = null;
      return;
    }
    if (lyricsTrackIdRef.current === track.id) return;

    setLyrics(null);
    setLyricsUserScrolled(false);
    setLyricsLoading(true);
    let cancelled = false;
    fetchLyrics(track, isDemoMode)
      .then((data) => {
        if (cancelled) return;
        setLyrics(data);
        lyricsTrackIdRef.current = track.id;
      })
      .finally(() => {
        if (!cancelled) setLyricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id, isDemoMode]);

  const openLyrics = useCallback(() => {
    if (!currentTrack) return;
    push('lyrics');
    setLyricsUserScrolled(false);
    setIndex(0);
  }, [currentTrack, push, setIndex]);

  // ── Search key handling ──────────────────────────────────

  const submitSearch = useCallback(
    (value: string) => {
      const q = value.trim();
      if (!q) return;
      setSearchQuery(value);
      // Collection-shaped sources land on the albums screen (shows), flat
      // sources on the track list.
      push(service?.searchAlbums ? 'albums' : 'tracks');
      void runSearch(value);
    },
    [runSearch, push, service]
  );

  const handleSearchKey = useCallback(
    (idx: number) => {
      const key = SEARCH_KEYS[idx];
      if (key === 'SPACE') setSearchQuery((q) => q + ' ');
      else if (key === 'DEL') setSearchQuery((q) => q.slice(0, -1));
      else if (key === 'GO') submitSearch(searchQuery);
      else setSearchQuery((q) => q + key);
    },
    [submitSearch, searchQuery]
  );

  // ── Capability-driven Music submenu ──────────────────────

  // Build the Music submenu from the active source's capabilities so library-
  // only entries vanish for sources that lack them (Audius: no library/artists,
  // so only "Trending" — its default browse list — appears).
  const musicMenuItems = useMemo<MusicMenuEntry[]>(() => {
    const caps = getProviderMeta(activeProviderId)?.capabilities;
    const items: MusicMenuEntry[] = [];
    if (caps?.hasLibrary) {
      items.push({ label: 'Playlists', kind: 'playlists' });
      items.push({ label: 'Albums', kind: 'albums' });
    }
    if (caps?.hasArtists) items.push({ label: 'Artists', kind: 'artists' });
    if (caps?.hasLibrary) items.push({ label: 'Recently Played', kind: 'recent' });
    if (service?.getTrending) items.push({ label: 'Trending', kind: 'trending' });
    if (service?.getTrendingAlbums) items.push({ label: 'Top Podcasts', kind: 'trendingAlbums' });
    return items;
  }, [activeProviderId, service]);

  // Artist drill-down menu, capability-driven. Spotify removed top-tracks for
  // Dev Mode apps (Feb 2026), so it's hidden there while "Albums" remains.
  const artistMenuItems = useMemo<ArtistMenuEntry[]>(() => {
    const caps = getProviderMeta(activeProviderId)?.capabilities;
    const items: ArtistMenuEntry[] = [];
    if (caps?.hasArtistTopTracks && service?.getArtistTopTracks) {
      items.push({ label: 'Top Tracks', kind: 'topTracks' });
    }
    if (service?.getArtistAlbums) items.push({ label: 'Albums', kind: 'albums' });
    return items;
  }, [activeProviderId, service]);

  // Commit to a source: reset playback, persist the choice, and drop into the
  // main menu (the service-init effect swaps the active service). Only called
  // once a source is known to be usable (config present, sign-in succeeded) so
  // the user never lands in a broken mode. Never touches other providers'
  // stored sessions — switching is not signing out.
  const commitSource = useCallback(
    (target: SourceId) => {
      audio.stop();
      youtube.stop();
      apple.stop();
      setCurrentTrack(null);
      setIsPlaying(false);
      setPositionMs(0);
      setDataError(null);
      setSourceNotice(null);
      setTracks([]);
      setTrackSource(null);
      localStorage.setItem('source', target);
      localStorage.removeItem('demo_mode');
      setActiveSource(target);
      setNav([{ screen: 'mainMenu', index: 0 }]);
    },
    [audio, youtube, apple]
  );

  // Apple Music sign-in flow. Bootstraps MusicKit + the developer token, then
  // runs MusicKit's own authorize() popup *before* entering Apple Music mode.
  // Surfaces an interim "Connecting…" notice and, on missing config / declined /
  // failed sign-in, a friendly message that leaves the user on the selection
  // screen (never a dead-end Apple Music mode). Non-subscribers still enter and
  // fall back to 30s previews in useAppleMusicPlayer, since authorize succeeds.
  const connectAppleMusic = useCallback(async () => {
    if (appleConnectingRef.current) return;
    appleConnectingRef.current = true;
    setSourceNotice(APPLE_CONNECTING_MESSAGE);
    try {
      const music = await ensureAppleMusicConfigured();
      if (!music) {
        // Surface which bootstrap step failed (token fetch / script load /
        // configure) so the notice is actionable; failures are not memoised,
        // so re-selecting Apple Music retries from scratch.
        setSourceNotice(getAppleMusicBootstrapFailureMessage() ?? APPLE_UNAVAILABLE_MESSAGE);
        return;
      }
      let userToken: string | null = null;
      try {
        userToken = await authorizeAppleMusic();
      } catch {
        userToken = null;
      }
      if (!userToken) {
        // authorize() rejected or was dismissed by the user.
        setSourceNotice(APPLE_SIGN_IN_CANCELLED_MESSAGE);
        return;
      }
      localStorage.setItem('apple_connected', '1');
      setAppleConnected(true);
      commitSource('applemusic');
    } finally {
      appleConnectingRef.current = false;
    }
  }, [commitSource]);

  // Entry point for selecting any source (gate + Sources screen). Sources that
  // can't be used communicate that at selection time and keep the user on the
  // current screen: YouTube without an API key shows the needs-setup notice;
  // Apple Music runs its sign-in flow first (instant when already authorized).
  // Connected Spotify switches without re-auth; otherwise it starts OAuth.
  const switchSource = useCallback(
    (target: SourceId) => {
      if (target === 'youtube' && !isYouTubeKeyConfigured()) {
        setSourceNotice(YOUTUBE_NO_KEY_MESSAGE);
        return;
      }
      if (target === 'applemusic') {
        void connectAppleMusic();
        return;
      }
      if (target === 'spotify') {
        if (spotifyConnected) commitSource('spotify');
        else void redirectToSpotifyLogin();
        return;
      }
      commitSource(target);
    },
    [commitSource, connectAppleMusic, spotifyConnected]
  );

  // ── Per-provider sign-out ─────────────────────────────────

  // Signing out of one provider never disturbs the others. Leaving the ACTIVE
  // provider falls back to Audius — free, no-login, always usable — so the app
  // never strands the user on a dead screen.
  const signOutSpotify = useCallback(() => {
    logout();
    setAccessToken(null);
    setSpotifyConnected(false);
    if (activeSource === 'spotify') commitSource('audius');
  }, [activeSource, commitSource]);

  const disconnectAppleMusic = useCallback(() => {
    localStorage.removeItem('apple_connected');
    setAppleConnected(false);
    void unauthorizeAppleMusic();
    if (activeSource === 'applemusic') commitSource('audius');
  }, [activeSource, commitSource]);

  // Settings rows. Sign-out rows are per-provider and only render for
  // providers with a stored connection; legal links live here (not the gate).
  const settingsItems = useMemo<SettingsEntry[]>(() => {
    const items: SettingsEntry[] = [
      { label: 'Shuffle', detail: shuffle ? 'On' : 'Off', kind: 'shuffle' },
      { label: 'Repeat', detail: repeatLabel(repeat), kind: 'repeat' },
      { label: 'Theme', detail: theme === 'black' ? 'Classic' : 'White', kind: 'theme' },
      { label: 'Click Sound', detail: feedback.soundEnabled ? 'On' : 'Off', kind: 'sound' },
      { label: 'Haptics', detail: feedback.hapticEnabled ? 'On' : 'Off', kind: 'haptics' },
      { label: 'About', detail: 'v1.0', kind: 'about' },
      { label: 'Privacy Policy', detail: 'bicoastalai.com', arrow: true, kind: 'privacy' },
      { label: 'Terms of Use', detail: 'bicoastalai.com', arrow: true, kind: 'terms' },
    ];
    if (spotifyConnected) {
      items.push({ label: 'Sign Out of Spotify', kind: 'signOutSpotify' });
    }
    if (appleConnected) {
      items.push({ label: 'Disconnect Apple Music', kind: 'disconnectApple' });
    }
    return items;
  }, [
    shuffle, repeat, theme, feedback.soundEnabled, feedback.hapticEnabled,
    spotifyConnected, appleConnected,
  ]);

  // ── Select action (takes explicit index to avoid stale closure) ──

  const doSelect = useCallback(
    (idx: number) => {
      switch (currentScreen) {
        case 'login': {
          const src = ENTRY_SOURCES[idx];
          if (src) switchSource(src.id);
          break;
        }
        case 'mainMenu': {
          if (idx === 0) push('music');
          else if (idx === 1) push('search');
          else if (idx === 2) push('nowPlaying');
          else if (idx === 3) {
            setDataError(null);
            setSourceNotice(null);
            push('sources');
          } else if (idx === 4) push('settings');
          break;
        }
        case 'sources': {
          const p = PROVIDERS[idx];
          if (!p) break;
          if (p.id === activeProviderId && activeSource !== null) {
            setSourceNotice(null);
            setNav([{ screen: 'mainMenu', index: 0 }]);
          } else if (p.status === 'planned') {
            setSourceNotice(null);
            setDataError(`${p.label} — ${p.blurb}`);
          } else {
            switchSource(p.id as SourceId);
          }
          break;
        }
        case 'music': {
          const item = musicMenuItems[idx];
          if (!item) break;
          if (item.kind === 'playlists') {
            push('playlists');
            void loadPlaylists();
          } else if (item.kind === 'albums') {
            push('albums');
            void loadAlbums();
          } else if (item.kind === 'artists') {
            push('artists');
            void loadArtists();
          } else if (item.kind === 'recent') {
            push('tracks');
            void loadRecentlyPlayed();
          } else if (item.kind === 'trending') {
            push('tracks');
            void loadTrending();
          } else if (item.kind === 'trendingAlbums') {
            push('albums');
            void loadTrendingShows();
          }
          break;
        }
        case 'artists': {
          const ar = artists[idx];
          if (ar) {
            setSelectedArtist(ar);
            setDataError(null);
            push('artist');
          }
          break;
        }
        case 'artist': {
          if (!selectedArtist) break;
          const item = artistMenuItems[idx];
          if (!item) break;
          if (item.kind === 'topTracks') {
            push('tracks');
            void loadArtistTopTracks(selectedArtist);
          } else if (item.kind === 'albums') {
            push('albums');
            void loadArtistAlbums(selectedArtist);
          }
          break;
        }
        case 'playlists': {
          const pl = playlists[idx];
          if (pl) {
            push('tracks');
            void loadPlaylistTracks(pl);
          }
          break;
        }
        case 'albums': {
          const al = albums[idx];
          if (al) {
            push('tracks');
            void loadAlbumTracks(al);
          }
          break;
        }
        case 'tracks': {
          // When songs couldn't be listed (e.g. a playlist you don't own) but we
          // still have a context, the single "Play" row starts the whole thing.
          if (tracks.length === 0 && trackSource && 'contextUri' in trackSource) {
            push('nowPlaying');
            void playContext(trackSource);
          } else if (tracks[idx] && trackSource) {
            push('nowPlaying');
            void playFromList(tracks, idx, trackSource);
          }
          break;
        }
        case 'settings': {
          const item = settingsItems[idx];
          if (!item) break;
          if (item.kind === 'shuffle') toggleShuffle();
          else if (item.kind === 'repeat') cycleRepeat();
          else if (item.kind === 'theme') toggleTheme();
          else if (item.kind === 'sound') feedback.toggleSound();
          else if (item.kind === 'haptics') feedback.toggleHaptic();
          else if (item.kind === 'privacy') window.open(LEGAL_PRIVACY_URL, '_blank', 'noopener,noreferrer');
          else if (item.kind === 'terms') window.open(LEGAL_TERMS_URL, '_blank', 'noopener,noreferrer');
          else if (item.kind === 'signOutSpotify') signOutSpotify();
          else if (item.kind === 'disconnectApple') disconnectAppleMusic();
          break;
        }
        case 'search': {
          handleSearchKey(idx);
          break;
        }
        case 'nowPlaying':
          openLyrics();
          break;
      }
    },
    [
      currentScreen, push, playlists, albums, artists, selectedArtist, tracks, trackSource,
      loadPlaylists, loadAlbums, loadArtists, loadArtistAlbums, loadArtistTopTracks,
      loadPlaylistTracks, loadAlbumTracks,
      loadRecentlyPlayed, loadTrending, loadTrendingShows, playFromList, playContext, openLyrics, toggleShuffle,
      cycleRepeat, toggleTheme, handleSearchKey,
      activeProviderId, activeSource, musicMenuItems, artistMenuItems, settingsItems,
      switchSource, signOutSpotify, disconnectAppleMusic,
      feedback.toggleSound, feedback.toggleHaptic,
    ]
  );

  // Clicking a list item: update selection + immediately act on it
  const handleItemClick = useCallback(
    (idx: number) => {
      setIndex(idx);
      doSelect(idx);
    },
    [setIndex, doSelect]
  );

  // ── Click wheel handlers ──────────────────────────────────

  const handleScroll = useCallback(
    (direction: 'up' | 'down') => {
      // One tick of feedback per discrete scroll step (ClickWheel fires onScroll
      // once per STEP_DEG, so this is per selection move, not per pixel).
      feedback.tick();
      if (currentScreen === 'nowPlaying') {
        // Clockwise (down) scrubs forward, counter-clockwise rewinds.
        seekBy(direction === 'down' ? SEEK_STEP_MS : -SEEK_STEP_MS);
        return;
      }
      if (currentScreen === 'lyrics') {
        const listLen = lyrics?.lines.length ?? 0;
        if (listLen === 0) return;
        setLyricsUserScrolled(true);
        moveSelection(direction === 'down' ? 1 : -1, listLen);
        return;
      }
      moveSelection(direction === 'down' ? 1 : -1, getListLength(currentScreen));
    },
    // playlists/albums/tracks/trackSource are read via getListLength — they must
    // be deps so the wheel sees freshly-loaded lists (else it clamps to length 0).
    [
      currentScreen, seekBy, moveSelection, lyrics,
      playlists, albums, artists, tracks, trackSource, musicMenuItems, artistMenuItems, settingsItems,
      feedback.tick,
    ]
  );

  const handleClick = useCallback(
    (button: 'menu' | 'next' | 'previous' | 'playPause' | 'select') => {
      feedback.press();
      switch (button) {
        case 'menu': pop(); break;
        case 'playPause': if (currentTrack) togglePlay(); break;
        case 'next': skipNext(); break;
        case 'previous': skipPrev(); break;
        case 'select': doSelect(selectedIndex); break;
      }
    },
    [selectedIndex, pop, togglePlay, skipNext, skipPrev, doSelect, currentTrack, feedback.press]
  );

  function getListLength(screen: Screen): number {
    switch (screen) {
      case 'login': return ENTRY_SOURCES.length;
      case 'mainMenu': return MAIN_MENU.length;
      case 'music': return musicMenuItems.length;
      case 'settings': return settingsItems.length;
      case 'sources': return PROVIDERS.length;
      case 'playlists': return playlists.length;
      case 'albums': return albums.length;
      case 'artists': return artists.length;
      case 'artist': return artistMenuItems.length;
      case 'tracks':
        // Empty list + a context still offers one selectable "Play" row.
        if (tracks.length === 0 && trackSource && 'contextUri' in trackSource) return 1;
        return tracks.length;
      case 'search': return SEARCH_KEYS.length;
      case 'lyrics': return lyrics?.lines.length ?? 0;
      default: return 0;
    }
  }

  // ── Screen title ──────────────────────────────────────────

  const screenTitle =
    currentScreen === 'tracks'
      ? tracksTitle
      : currentScreen === 'albums'
        ? albumsTitle
        : SCREEN_TITLES[currentScreen];

  // YouTube's ToS expects the IFrame player to stay visible during playback
  // (not audio-only/hidden). So while a YouTube video is loaded we show it large
  // over the Now Playing album-art region, and elsewhere keep it as a small
  // visible thumbnail; it is only fully hidden when nothing is playing.
  const ytStageClass =
    isYouTube && currentTrack
      ? currentScreen === 'nowPlaying'
        ? 'yt-stage--np'
        : 'yt-stage--mini'
      : 'yt-stage--hidden';

  // ── Render ────────────────────────────────────────────────

  return (
    <div className={`app-shell app-shell--${theme}`}>
      <div className={`ipod${theme === 'black' ? ' ipod-black' : ''}`}>
        {/* Screen */}
        <div className="ipod-bezel">
          <div className="ipod-screen">
            <div className="screen-header">{screenTitle}</div>
            <div className="screen-body">
              {isLoading && currentScreen !== 'lyrics' ? (
                <LoadingView />
              ) : (
                <ScreenContent
                  screen={currentScreen}
                  selectedIndex={selectedIndex}
                  mainMenu={MAIN_MENU}
                  settingsItems={settingsItems}
                  spotifyConnected={spotifyConnected}
                  appleConnected={appleConnected}
                  musicMenu={musicMenuItems.map((m) => m.label)}
                  artistMenu={artistMenuItems.map((m) => m.label)}
                  playlists={playlists}
                  albums={albums}
                  artists={artists}
                  tracks={tracks}
                  currentTrack={currentTrack}
                  isPlaying={isPlaying}
                  positionMs={positionMs}
                  volume={volume}
                  volumeControllable={
                    usesAudioEngine
                      ? audio.volumeControllable
                      : isYouTube
                        ? youtube.volumeControllable
                        : isAppleMusic
                          ? apple.volumeControllable
                          : volumeControllable
                  }
                  shuffle={shuffle}
                  repeat={repeat}
                  isPlayerReady={usesAudioEngine || isYouTube || isAppleMusic ? true : isReady}
                  playerError={
                    usesAudioEngine
                      ? audio.audioError
                      : isYouTube
                        ? youtube.playerError
                        : isAppleMusic
                          ? apple.playerError
                          : playerError
                  }
                  searchQuery={searchQuery}
                  dataError={dataError}
                  sourceNotice={sourceNotice}
                  activeProviderId={activeProviderId}
                  trackSource={trackSource}
                  lyrics={lyrics}
                  lyricsLoading={lyricsLoading}
                  lyricsUserScrolled={lyricsUserScrolled}
                  onItemClick={handleItemClick}
                  onSearchChange={setSearchQuery}
                  onSearchSubmit={submitSearch}
                />
              )}
              {/* Persistent YouTube IFrame host — always mounted so playback
                  survives navigation; positioning/visibility is class-driven
                  (visible during playback per YouTube ToS). */}
              <div className={`yt-stage ${ytStageClass}`}>
                <div ref={youtube.hostRef} className="yt-stage-host" />
              </div>
            </div>
          </div>
        </div>

        {/* Click wheel */}
        <ClickWheel onScroll={handleScroll} onClick={handleClick} />
      </div>
    </div>
  );
}

// ── Screen content router ─────────────────────────────────

interface ScreenProps {
  screen: Screen;
  selectedIndex: number;
  mainMenu: string[];
  settingsItems: SettingsEntry[];
  /** Stored-connection states driving Sources badges + Settings sign-out rows. */
  spotifyConnected: boolean;
  appleConnected: boolean;
  musicMenu: string[];
  artistMenu: string[];
  playlists: Playlist[];
  albums: Album[];
  artists: Artist[];
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  positionMs: number;
  volume: number;
  volumeControllable: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  isPlayerReady: boolean;
  playerError: string | null;
  searchQuery: string;
  dataError: string | null;
  /** Source-selection feedback for the entry gate + Sources screen. */
  sourceNotice: string | null;
  activeProviderId: ProviderId;
  trackSource: PlaySource | null;
  lyrics: TrackLyrics | null;
  lyricsLoading: boolean;
  lyricsUserScrolled: boolean;
  onItemClick: (index: number) => void;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
}

function ScreenContent(props: ScreenProps) {
  const { screen, selectedIndex, onItemClick } = props;

  switch (screen) {
    case 'login':
      return (
        <LoginScreen
          selectedIndex={selectedIndex}
          onItemClick={onItemClick}
          notice={props.sourceNotice}
        />
      );
    case 'mainMenu':
      return (
        <MenuScreen
          items={props.mainMenu.map((label) => ({ label, arrow: true }))}
          selectedIndex={selectedIndex}
          onItemClick={onItemClick}
        />
      );
    case 'music':
      return (
        <MenuScreen
          items={props.musicMenu.map((label) => ({ label, arrow: true }))}
          selectedIndex={selectedIndex}
          onItemClick={onItemClick}
        />
      );
    case 'playlists':
      return (
        <MenuScreen
          items={props.playlists.map((p) => ({
            label: p.name,
            detail: p.trackCount > 0 ? String(p.trackCount) : undefined,
            arrow: true,
          }))}
          selectedIndex={selectedIndex}
          onItemClick={onItemClick}
          emptyLabel={props.dataError ?? 'No playlists'}
        />
      );
    case 'artists':
      return (
        <MenuScreen
          items={props.artists.map((a) => ({ label: a.name, arrow: true }))}
          selectedIndex={selectedIndex}
          onItemClick={onItemClick}
          emptyLabel={props.dataError ?? 'No artists'}
        />
      );
    case 'artist':
      return (
        <MenuScreen
          items={props.artistMenu.map((label) => ({ label, arrow: true }))}
          selectedIndex={selectedIndex}
          onItemClick={onItemClick}
        />
      );
    case 'albums':
      return (
        <MenuScreen
          items={props.albums.map((a) => ({
            label: a.name,
            detail: a.artist,
            arrow: true,
          }))}
          selectedIndex={selectedIndex}
          onItemClick={onItemClick}
          emptyLabel={props.dataError ?? 'No albums'}
        />
      );
    case 'tracks': {
      const hasContext = !!props.trackSource && 'contextUri' in props.trackSource;
      if (props.tracks.length === 0 && hasContext) {
        return (
          <PlayContextScreen
            note={props.dataError}
            selected={selectedIndex === 0}
            onPlay={() => onItemClick(0)}
          />
        );
      }
      return (
        <MenuScreen
          items={props.tracks.map((t) => ({
            label: t.name,
            detail: t.artist,
          }))}
          selectedIndex={selectedIndex}
          onItemClick={onItemClick}
          emptyLabel={props.dataError ?? 'No songs'}
        />
      );
    }
    case 'settings':
      return (
        <MenuScreen
          items={props.settingsItems}
          selectedIndex={selectedIndex}
          onItemClick={onItemClick}
        />
      );
    case 'sources':
      return (
        <SourcesScreen
          activeProviderId={props.activeProviderId}
          spotifyConnected={props.spotifyConnected}
          appleConnected={props.appleConnected}
          selectedIndex={selectedIndex}
          onItemClick={onItemClick}
          note={props.sourceNotice ?? props.dataError}
        />
      );
    case 'search':
      return (
        <SearchScreen
          query={props.searchQuery}
          selectedIndex={selectedIndex}
          onKeyClick={onItemClick}
          onQueryChange={props.onSearchChange}
          onSubmit={props.onSearchSubmit}
        />
      );
    case 'nowPlaying':
      return (
        <NowPlayingScreen
          track={props.currentTrack}
          isPlaying={props.isPlaying}
          positionMs={props.positionMs}
          volume={props.volume}
          volumeControllable={props.volumeControllable}
          shuffle={props.shuffle}
          repeat={props.repeat}
          isPlayerReady={props.isPlayerReady}
          playerError={props.playerError}
          providerId={props.activeProviderId}
        />
      );
    case 'lyrics':
      return (
        <LyricsScreen
          lyrics={props.lyrics}
          loading={props.lyricsLoading}
          positionMs={props.positionMs}
          selectedIndex={selectedIndex}
          userScrolled={props.lyricsUserScrolled}
        />
      );
    default:
      return null;
  }
}

// ── Login screen ───────────────────────────────────────────

function LoginScreen({
  selectedIndex,
  onItemClick,
  notice,
}: {
  selectedIndex: number;
  onItemClick: (i: number) => void;
  notice: string | null;
}) {
  const redirectWarning = getRedirectUriWarning();
  // One status line, like a real iPod: source-selection feedback (connecting /
  // unavailable / cancelled) first, then config warnings, else the highlighted
  // row's detail. Never a stack of banners.
  const warn = notice ?? redirectWarning;
  const status = warn ?? ENTRY_SOURCES[selectedIndex]?.detail ?? '';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="login-screen" style={{ flex: 1 }}>
        <div className="login-logo">🎵 OldPod.fm</div>
        <p className="login-sub">Choose your music</p>
      </div>
      <ul className="menu-list" aria-label="Choose a music source">
        {ENTRY_SOURCES.map((s, i) => (
          <li
            key={s.id}
            className={`menu-item${i === selectedIndex ? ' selected' : ''}`}
            onClick={() => onItemClick(i)}
            style={{ cursor: 'pointer' }}
            aria-label={`${s.label} — ${s.detail}`}
          >
            <span className="menu-item-text">{s.label}</span>
            <span className="chevron">›</span>
          </li>
        ))}
      </ul>
      <div className={`gate-status${warn ? ' gate-status--warn' : ''}`} aria-live="polite">
        {status}
      </div>
    </div>
  );
}

// ── Sources screen ─────────────────────────────────────────

function SourcesScreen({
  activeProviderId,
  spotifyConnected,
  appleConnected,
  selectedIndex,
  onItemClick,
  note,
}: {
  activeProviderId: ProviderId;
  spotifyConnected: boolean;
  appleConnected: boolean;
  selectedIndex: number;
  onItemClick: (i: number) => void;
  note: string | null;
}) {
  // Per-provider state: Active (in use now) > Connected (switch instantly,
  // no re-auth) > Sign in / Needs setup / No account needed.
  const badge = (p: (typeof PROVIDERS)[number]) => {
    if (p.id === activeProviderId) return 'Active';
    if (p.status === 'planned') return 'Soon';
    if (p.id === 'spotify') return spotifyConnected ? 'Connected' : 'Sign in';
    if (p.id === 'applemusic') return appleConnected ? 'Connected' : 'Sign in';
    if (p.id === 'youtube' && !isYouTubeKeyConfigured()) return 'Needs setup';
    return 'No account needed';
  };

  const selected = PROVIDERS[selectedIndex];
  const footer = note ?? (selected ? `${requirementLabel(selected)} · ${selected.blurb}` : '');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ul className="menu-list" style={{ flex: 1, overflowY: 'auto' }}>
        {PROVIDERS.map((p, i) => (
          <li
            key={p.id}
            className={`menu-item${i === selectedIndex ? ' selected' : ''}`}
            onClick={() => onItemClick(i)}
            style={{ cursor: 'pointer', opacity: p.status === 'planned' ? 0.55 : 1 }}
          >
            <span className="menu-item-text">{p.label}</span>
            <span style={{ fontSize: '9px', opacity: 0.6, marginRight: '4px', flexShrink: 0 }}>
              {badge(p)}
            </span>
          </li>
        ))}
      </ul>
      <div
        style={{
          padding: '4px 8px',
          fontSize: '9px',
          lineHeight: 1.3,
          color: '#555',
          borderTop: '1px solid rgba(0,0,0,0.08)',
          minHeight: '28px',
        }}
      >
        {footer}
      </div>
    </div>
  );
}

// ── Generic menu list ──────────────────────────────────────

interface MenuItem {
  label: string;
  detail?: string;
  arrow?: boolean;
}

function MenuScreen({
  items,
  selectedIndex,
  onItemClick,
  emptyLabel,
}: {
  items: MenuItem[];
  selectedIndex: number;
  onItemClick: (i: number) => void;
  emptyLabel?: string;
}) {
  if (items.length === 0 && emptyLabel) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          color: '#555',
        }}
      >
        {emptyLabel}
      </div>
    );
  }

  const [visible, localSelected] = visibleWindow(items, selectedIndex);
  const startOffset = selectedIndex - localSelected;

  return (
    <ul className="menu-list" style={{ height: '100%' }}>
      {visible.map((item, i) => (
        <li
          key={i}
          className={`menu-item${i === localSelected ? ' selected' : ''}`}
          onClick={() => onItemClick(startOffset + i)}
          style={{ cursor: 'pointer' }}
        >
          <span className="menu-item-text">{item.label}</span>
          {item.detail && (
            <span style={{ fontSize: '9px', opacity: 0.6, marginRight: '4px', flexShrink: 0 }}>
              {item.detail}
            </span>
          )}
          {item.arrow && <span className="chevron">›</span>}
        </li>
      ))}
    </ul>
  );
}

// ── Play-context screen (playlists we can't enumerate) ─────

function PlayContextScreen({
  note,
  selected,
  onPlay,
}: {
  note: string | null;
  selected: boolean;
  onPlay: () => void;
}) {
  return (
    <div className="play-context">
      {note && <p className="play-context-note">{note}</p>}
      <button
        className={`play-context-btn${selected ? ' selected' : ''}`}
        onClick={onPlay}
      >
        ▶ Play playlist
      </button>
    </div>
  );
}

// ── Now Playing screen ─────────────────────────────────────

function NowPlayingScreen({
  track,
  isPlaying,
  positionMs,
  volume,
  volumeControllable,
  shuffle,
  repeat,
  isPlayerReady,
  playerError,
  providerId,
}: {
  track: Track | null;
  isPlaying: boolean;
  positionMs: number;
  volume: number;
  volumeControllable: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  isPlayerReady: boolean;
  playerError: string | null;
  providerId: ProviderId;
}) {
  if (!track) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          color: '#555',
        }}
      >
        Nothing playing
      </div>
    );
  }

  // Live streams (radio) report no duration: avoid NaN progress and show a
  // LIVE marker instead of a (meaningless) remaining time.
  const isLive = track.durationMs <= 0;
  const pct = isLive ? 0 : Math.min(100, (positionMs / track.durationMs) * 100);
  const artColor = albumArtPlaceholder(track.album);

  return (
    <div className="now-playing">
      {/* Top row: art + track info */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <div className="album-art" style={{ background: artColor }}>
          {track.albumArt ? (
            <img src={track.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: '28px' }}>♪</span>
          )}
        </div>
        <div className="track-info">
          <div className="track-name">{track.name}</div>
          <div className="track-artist">{track.artist}</div>
          <div className="track-album">{track.album}</div>
          <div className="np-status">
            <span>
              {playerError
                ? '⚠ Error'
                : !isPlayerReady
                  ? 'Connecting…'
                  : isPlaying
                    ? '▶ Playing'
                    : '⏸ Paused'}
            </span>
            {shuffle && <span className="np-badge" title="Shuffle">⤨</span>}
            {repeat !== 'off' && (
              <span className="np-badge" title={`Repeat ${repeatLabel(repeat)}`}>
                {repeat === 'track' ? '↻¹' : '↻'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      {/* Times */}
      <div className="time-row">
        <span>{formatTime(positionMs)}</span>
        <span>{isLive ? 'LIVE' : `-${formatTime(Math.max(0, track.durationMs - positionMs))}`}</span>
      </div>

      {/* Volume — on iOS/touch the system locks audio to the hardware buttons
          and the SDK can't read or set it, so we omit the row entirely there
          and reclaim the space. On desktop it mirrors the real SDK volume. */}
      {volumeControllable && (
        <div className="volume-row">
          <span className="volume-label">🔈</span>
          <div className="volume-bar">
            <div className="volume-fill" style={{ width: `${volume}%` }} />
          </div>
          <span className="volume-label" style={{ textAlign: 'right' }}>🔊</span>
        </div>
      )}

      {playerError ? (
        <div className="np-hint np-hint--error">{playerError}</div>
      ) : (
        <div className="np-hint">
          {!isPlayerReady
            ? 'Play a song to connect audio'
            : isLive
              ? 'Live stream   Center · Lyrics'
              : 'Wheel · Seek   Center · Lyrics'}
        </div>
      )}

      {/* Apple MusicKit attribution (per Apple's branding guidelines). */}
      {providerId === 'applemusic' && (
        <div
          className="np-hint"
          style={{ marginTop: '2px', opacity: 0.7, letterSpacing: '0.02em' }}
        >
          ♫ Apple Music
        </div>
      )}
    </div>
  );
}

// ── Loading ────────────────────────────────────────────────

function LoadingView() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div className="loading-dots">
        <div className="loading-dot" />
        <div className="loading-dot" />
        <div className="loading-dot" />
      </div>
    </div>
  );
}
