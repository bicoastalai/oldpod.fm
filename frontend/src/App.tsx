import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ClickWheel from './components/ClickWheel';
import LyricsScreen from './components/LyricsScreen';
import SearchScreen, { SEARCH_KEYS } from './components/SearchScreen';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useYouTubePlayer } from './hooks/useYouTubePlayer';
import { useAppleMusicPlayer } from './hooks/useAppleMusicPlayer';
import {
  albumArtPlaceholder,
  createMockService,
  createSpotifyService,
  describeDataError,
  formatTime,
} from './services/spotify';
import { createAudiusService } from './services/audius';
import { createYouTubeService } from './services/youtube';
import { authorizeAppleMusic, createAppleMusicService } from './services/apple-music';
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
type MusicMenuKind = 'playlists' | 'albums' | 'artists' | 'recent' | 'trending';
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
const SETTINGS_MENU = ['Shuffle', 'Repeat', 'Theme', 'About', 'Privacy & Terms', 'Sign Out'];

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

// Short hint on the Sign Out row naming what leaving the current source does.
function signOutDetail(providerId: ProviderId): string {
  if (providerId === 'demo') return 'Exit demo';
  return getProviderMeta(providerId)?.label ?? 'Spotify';
}

// A row on the "Choose your music" entry gate, derived from a provider's
// capabilities (see `buildEntrySources`).
interface EntrySource {
  id: ProviderId;
  label: string;
  /** Sets expectations by requirement, not marketing (e.g. "No account needed"). */
  requirement: string;
  /** Drives ordering/grouping: no-login real sources lead, demo, then sign-in. */
  group: 'free' | 'demo' | 'signin';
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

// Entry-gate copy: leads with value, labels Demo honestly as a tire-kicker.
function entryRequirement(p: ProviderMeta): string {
  if (p.id === 'demo') return 'Just looking · sample tracks';
  if (p.capabilities.needsLogin) {
    return p.capabilities.needsPremiumForPlayback ? 'Sign in · Premium to play' : 'Sign in required';
  }
  return 'No account needed';
}

// Build the entry gate dynamically from the registry: free no-login real
// sources first (Audius), Demo next (clearly a sample), sign-in sources last.
// Planned sources stay off the gate to avoid clutter.
function buildEntrySources(providers: ProviderMeta[]): EntrySource[] {
  const ready = providers.filter((p) => p.status === 'ready');
  const group = (p: ProviderMeta): EntrySource['group'] =>
    p.id === 'demo' ? 'demo' : p.capabilities.needsLogin ? 'signin' : 'free';
  const order: Record<EntrySource['group'], number> = { free: 0, demo: 1, signin: 2 };
  return ready
    .map((p) => ({ id: p.id, label: p.label, requirement: entryRequirement(p), group: group(p) }))
    .sort((a, b) => order[a.group] - order[b.group]);
}

// ── App ────────────────────────────────────────────────────

export default function App() {
  // Navigation
  const [nav, setNav] = useState<NavEntry[]>([{ screen: 'login', index: 0 }]);
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

  // Auth
  const [accessToken, setAccessToken] = useState<string | null>(getStoredToken);
  const [isDemoMode, setIsDemoMode] = useState(() => {
    if (getStoredToken() || localStorage.getItem('spot_refresh')) return false;
    return localStorage.getItem('demo_mode') === '1';
  });
  // Audius is a login-less source; remember it across reloads like demo mode.
  const [isAudiusMode, setIsAudiusMode] = useState(() => {
    if (getStoredToken() || localStorage.getItem('spot_refresh')) return false;
    return localStorage.getItem('source') === 'audius';
  });
  // YouTube is another login-less source, remembered the same way.
  const [isYouTubeMode, setIsYouTubeMode] = useState(() => {
    if (getStoredToken() || localStorage.getItem('spot_refresh')) return false;
    return localStorage.getItem('source') === 'youtube';
  });
  // Apple Music is a premium, logged-in source; MusicKit persists the user's
  // own authorization, so we just remember the selected source like the others.
  const [isAppleMusicMode, setIsAppleMusicMode] = useState(() => {
    if (getStoredToken() || localStorage.getItem('spot_refresh')) return false;
    return localStorage.getItem('source') === 'applemusic';
  });
  const [dataError, setDataError] = useState<string | null>(null);

  // Service
  const [service, setService] = useState<ActiveMusicService | null>(null);

  // Which source is currently active (drives the Sources screen highlight).
  const activeProviderId: ProviderId =
    service?.meta.id ??
    (isDemoMode
      ? 'demo'
      : isAudiusMode
        ? 'audius'
        : isYouTubeMode
          ? 'youtube'
          : isAppleMusicMode
            ? 'applemusic'
            : 'spotify');
  const isAudius = activeProviderId === 'audius';
  const isYouTube = activeProviderId === 'youtube';
  const isAppleMusic = activeProviderId === 'applemusic';
  const isSpotify = activeProviderId === 'spotify';

  // Data
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trackSource, setTrackSource] = useState<PlaySource | null>(null);
  const [tracksTitle, setTracksTitle] = useState('Songs');
  const [isLoading, setIsLoading] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Theme
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme');
    return stored === 'light' ? 'light' : 'black';
  });

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
    if (isAudius) {
      return {
        loadAndPlay: (track) => audio.loadAndPlay(track.uri),
        pause: audio.pause,
        resume: audio.resume,
        seek: audio.seek,
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
    isAudius, isYouTube, isAppleMusic,
    audio.loadAndPlay, audio.pause, audio.resume, audio.seek, audio.setVolume, audio.stop,
    youtube.loadAndPlay, youtube.pause, youtube.resume, youtube.seek, youtube.setVolume, youtube.stop,
    apple.loadAndPlay, apple.pause, apple.resume, apple.seek, apple.setVolume, apple.stop,
  ]);

  // Position/playing state of the active single-track engine, for syncing into
  // the shared UI playback state below.
  const activePlayerState = isAudius
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
    if (isDemoMode) {
      setService(createMockService());
      return;
    }
    if (isAudiusMode) {
      setService(createAudiusService());
      return;
    }
    if (isYouTubeMode) {
      setService(createYouTubeService());
      return;
    }
    if (isAppleMusicMode) {
      setService(createAppleMusicService());
      return;
    }
    setService(createSpotifyService(resolveSpotifyToken));
  }, [isDemoMode, isAudiusMode, isYouTubeMode, isAppleMusicMode, resolveSpotifyToken]);

  useEffect(() => {
    if (isDemoMode || isAudiusMode || isYouTubeMode || isAppleMusicMode) {
      if (nav[0]?.screen === 'login') setNav([{ screen: 'mainMenu', index: 0 }]);
      return;
    }
    void resolveSpotifyToken().then((tok) => {
      if (tok && nav[0]?.screen === 'login') {
        setNav([{ screen: 'mainMenu', index: 0 }]);
      }
    });
  }, [isDemoMode, isAudiusMode, isYouTubeMode, isAppleMusicMode, resolveSpotifyToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle PKCE callback (?code=...) ────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    window.history.replaceState(null, '', window.location.pathname);
    exchangeCodeForToken(code).then((tok) => {
      localStorage.removeItem('demo_mode');
      setIsDemoMode(false);
      setAccessToken(tok);
      setService(createSpotifyService(resolveSpotifyToken));
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
        setTracks(await service.getAlbumTracks(album));
      } catch (e) {
        setDataError(describeDataError(e, 'Could not load album'));
      } finally {
        setIsLoading(false);
      }
    },
    [service]
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

  const runSearch = useCallback(
    async (query: string) => {
      if (!service) return;
      setIsLoading(true);
      setDataError(null);
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
  }, [repeat, shuffle, currentTrackIndex, currentTrack, activePlayer]);

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

  const signOut = useCallback(() => {
    logout();
    localStorage.removeItem('demo_mode');
    localStorage.removeItem('source');
    audio.stop();
    youtube.stop();
    apple.stop();
    setAccessToken(null);
    setIsDemoMode(false);
    setIsAudiusMode(false);
    setIsYouTubeMode(false);
    setIsAppleMusicMode(false);
    setService(null);
    setPlaylists([]);
    setAlbums([]);
    setArtists([]);
    setSelectedArtist(null);
    setTracks([]);
    setTrackSource(null);
    setCurrentTrack(null);
    setIsPlaying(false);
    setPositionMs(0);
    setDataError(null);
    setNav([{ screen: 'login', index: 0 }]);
  }, [audio, youtube, apple]);

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
      push('tracks');
      void runSearch(value);
    },
    [runSearch, push]
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

  // Entry-gate rows, capability-driven (free no-login first → demo → sign-in).
  const entrySources = useMemo(() => buildEntrySources(PROVIDERS), []);

  // Switch source (demo/audius/youtube/applemusic), resetting playback. Apple
  // Music needs login, but via MusicKit's own popup rather than a redirect, so
  // it's handled here alongside the login-less sources; we kick off authorize
  // within this user gesture so the Music User Token is ready before playback.
  const switchSource = useCallback(
    (target: 'demo' | 'audius' | 'youtube' | 'applemusic') => {
      audio.stop();
      youtube.stop();
      apple.stop();
      setCurrentTrack(null);
      setIsPlaying(false);
      setPositionMs(0);
      setDataError(null);
      setTracks([]);
      setTrackSource(null);
      setIsDemoMode(target === 'demo');
      setIsAudiusMode(target === 'audius');
      setIsYouTubeMode(target === 'youtube');
      setIsAppleMusicMode(target === 'applemusic');
      if (target === 'demo') {
        localStorage.setItem('demo_mode', '1');
        localStorage.removeItem('source');
        setService(createMockService());
      } else if (target === 'audius') {
        localStorage.setItem('source', 'audius');
        localStorage.removeItem('demo_mode');
        setService(createAudiusService());
      } else if (target === 'youtube') {
        localStorage.setItem('source', 'youtube');
        localStorage.removeItem('demo_mode');
        setService(createYouTubeService());
      } else {
        localStorage.setItem('source', 'applemusic');
        localStorage.removeItem('demo_mode');
        setService(createAppleMusicService());
        // Best-effort sign-in; ignored if Apple isn't configured or cancelled.
        void authorizeAppleMusic().catch(() => {});
      }
      setNav([{ screen: 'mainMenu', index: 0 }]);
    },
    [audio, youtube, apple]
  );

  // ── Select action (takes explicit index to avoid stale closure) ──

  const doSelect = useCallback(
    (idx: number) => {
      switch (currentScreen) {
        case 'login': {
          const src = entrySources[idx];
          if (!src) break;
          if (src.id === 'audius') {
            switchSource('audius');
          } else if (src.id === 'youtube') {
            switchSource('youtube');
          } else if (src.id === 'applemusic') {
            switchSource('applemusic');
          } else if (src.id === 'demo') {
            switchSource('demo');
          } else if (src.id === 'spotify') {
            setIsDemoMode(false);
            setIsAudiusMode(false);
            setIsYouTubeMode(false);
            setIsAppleMusicMode(false);
            redirectToSpotifyLogin();
          }
          break;
        }
        case 'mainMenu': {
          if (idx === 0) push('music');
          else if (idx === 1) push('search');
          else if (idx === 2) push('nowPlaying');
          else if (idx === 3) {
            setDataError(null);
            push('sources');
          } else if (idx === 4) push('settings');
          break;
        }
        case 'sources': {
          const p = PROVIDERS[idx];
          if (!p) break;
          if (p.id === activeProviderId) {
            setNav([{ screen: 'mainMenu', index: 0 }]);
          } else if (p.status === 'planned') {
            setDataError(`${p.label} — ${p.blurb}`);
          } else if (p.id === 'demo') {
            switchSource('demo');
          } else if (p.id === 'audius') {
            switchSource('audius');
          } else if (p.id === 'youtube') {
            switchSource('youtube');
          } else if (p.id === 'applemusic') {
            switchSource('applemusic');
          } else if (p.id === 'spotify') {
            if (accessToken) {
              // Already authenticated — switch the active service back to Spotify.
              localStorage.removeItem('demo_mode');
              localStorage.removeItem('source');
              audio.stop();
              youtube.stop();
              apple.stop();
              setCurrentTrack(null);
              setIsPlaying(false);
              setPositionMs(0);
              setIsDemoMode(false);
              setIsAudiusMode(false);
              setIsYouTubeMode(false);
              setIsAppleMusicMode(false);
              setService(createSpotifyService(resolveSpotifyToken));
              setNav([{ screen: 'mainMenu', index: 0 }]);
            } else {
              setIsDemoMode(false);
              setIsAudiusMode(false);
              setIsYouTubeMode(false);
              setIsAppleMusicMode(false);
              redirectToSpotifyLogin();
            }
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
          if (idx === 0) toggleShuffle();
          else if (idx === 1) cycleRepeat();
          else if (idx === 2) toggleTheme();
          else if (idx === 4) window.open(LEGAL_PRIVACY_URL, '_blank', 'noopener,noreferrer');
          else if (idx === 5) signOut();
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
      loadRecentlyPlayed, loadTrending, playFromList, playContext, openLyrics, toggleShuffle,
      cycleRepeat, toggleTheme, signOut, handleSearchKey, accessToken,
      activeProviderId, musicMenuItems, artistMenuItems, switchSource, audio, youtube, apple, resolveSpotifyToken,
      entrySources,
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
      playlists, albums, artists, tracks, trackSource, musicMenuItems, artistMenuItems, entrySources,
    ]
  );

  const handleClick = useCallback(
    (button: 'menu' | 'next' | 'previous' | 'playPause' | 'select') => {
      switch (button) {
        case 'menu': pop(); break;
        case 'playPause': if (currentTrack) togglePlay(); break;
        case 'next': skipNext(); break;
        case 'previous': skipPrev(); break;
        case 'select': doSelect(selectedIndex); break;
      }
    },
    [selectedIndex, pop, togglePlay, skipNext, skipPrev, doSelect, currentTrack]
  );

  function getListLength(screen: Screen): number {
    switch (screen) {
      case 'login': return entrySources.length;
      case 'mainMenu': return MAIN_MENU.length;
      case 'music': return musicMenuItems.length;
      case 'settings': return SETTINGS_MENU.length;
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

  const screenTitle = currentScreen === 'tracks' ? tracksTitle : SCREEN_TITLES[currentScreen];

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
                  entrySources={entrySources}
                  mainMenu={MAIN_MENU}
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
                    isAudius
                      ? audio.volumeControllable
                      : isYouTube
                        ? youtube.volumeControllable
                        : isAppleMusic
                          ? apple.volumeControllable
                          : volumeControllable
                  }
                  shuffle={shuffle}
                  repeat={repeat}
                  theme={theme}
                  isPlayerReady={isAudius || isYouTube || isAppleMusic ? true : isReady}
                  playerError={
                    isAudius
                      ? audio.audioError
                      : isYouTube
                        ? youtube.playerError
                        : isAppleMusic
                          ? apple.playerError
                          : playerError
                  }
                  searchQuery={searchQuery}
                  dataError={dataError}
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
  entrySources: EntrySource[];
  mainMenu: string[];
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
  theme: Theme;
  isPlayerReady: boolean;
  playerError: string | null;
  searchQuery: string;
  dataError: string | null;
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
          sources={props.entrySources}
          selectedIndex={selectedIndex}
          onItemClick={onItemClick}
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
          items={[
            { label: 'Shuffle', detail: props.shuffle ? 'On' : 'Off' },
            { label: 'Repeat', detail: repeatLabel(props.repeat) },
            { label: 'Theme', detail: props.theme === 'black' ? 'Classic' : 'White' },
            { label: 'About', detail: 'v1.0' },
            { label: 'Privacy & Terms', detail: 'bicoastalai.com', arrow: true },
            { label: 'Sign Out', detail: signOutDetail(props.activeProviderId) },
          ]}
          selectedIndex={selectedIndex}
          onItemClick={onItemClick}
        />
      );
    case 'sources':
      return (
        <SourcesScreen
          activeProviderId={props.activeProviderId}
          selectedIndex={selectedIndex}
          onItemClick={onItemClick}
          note={props.dataError}
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
  sources,
  selectedIndex,
  onItemClick,
}: {
  sources: EntrySource[];
  selectedIndex: number;
  onItemClick: (i: number) => void;
}) {
  const redirectWarning = getRedirectUriWarning();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="login-screen" style={{ flex: 1 }}>
        <div className="login-logo">🎵 OldPod.fm</div>
        {redirectWarning ? (
          <p className="login-sub login-sub--warn">{redirectWarning}</p>
        ) : (
          <p className="login-sub">Choose your music</p>
        )}
      </div>
      <ul className="menu-list" aria-label="Choose a music source">
        {sources.map((s, i) => (
          <li
            key={s.id}
            className={`menu-item${i === selectedIndex ? ' selected' : ''}`}
            onClick={() => onItemClick(i)}
            style={{ cursor: 'pointer' }}
            aria-label={`${s.label} — ${s.requirement}`}
          >
            <span className="menu-item-text">{s.label}</span>
            <span style={{ fontSize: '9px', opacity: 0.65, marginRight: '4px', flexShrink: 0 }}>
              {s.requirement}
            </span>
            <span className="chevron">›</span>
          </li>
        ))}
      </ul>
      <div
        style={{
          padding: '3px 8px',
          fontSize: '8px',
          textAlign: 'center',
          color: '#666',
          borderTop: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        <div>More sources in Main Menu › Sources</div>
        <div style={{ marginTop: '2px' }}>
          <a
            href={LEGAL_PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#888', textDecoration: 'underline' }}
          >
            Privacy
          </a>
          {' · '}
          <a
            href={LEGAL_TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#888', textDecoration: 'underline' }}
          >
            Terms
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Sources screen ─────────────────────────────────────────

function SourcesScreen({
  activeProviderId,
  selectedIndex,
  onItemClick,
  note,
}: {
  activeProviderId: ProviderId;
  selectedIndex: number;
  onItemClick: (i: number) => void;
  note: string | null;
}) {
  const badge = (p: (typeof PROVIDERS)[number]) => {
    if (p.id === activeProviderId) return 'Active';
    if (p.status === 'planned') return 'Soon';
    return p.capabilities.needsLogin ? 'Sign in' : 'No login';
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

  const pct = Math.min(100, (positionMs / track.durationMs) * 100);
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
        <span>-{formatTime(Math.max(0, track.durationMs - positionMs))}</span>
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
          {!isPlayerReady ? 'Play a song to connect audio' : 'Wheel · Seek   Center · Lyrics'}
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
