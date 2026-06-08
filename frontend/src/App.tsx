import React, { useCallback, useEffect, useRef, useState } from 'react';
import ClickWheel from './components/ClickWheel';
import LyricsScreen from './components/LyricsScreen';
import SearchScreen, { SEARCH_KEYS } from './components/SearchScreen';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer';
import {
  albumArtPlaceholder,
  createMockService,
  createSpotifyService,
  describeDataError,
  formatTime,
} from './services/spotify';
import type {
  Album,
  Artist,
  MusicPlayerController,
  MusicProvider,
  Playlist,
  PlaySource,
  ProviderId,
  RepeatMode,
  Track,
} from './services/providers/types';
import {
  exchangeCodeForToken,
  getRedirectUriWarning,
  getSpotifyRedirectUri,
  getStoredToken,
  logout,
  refreshAccessToken,
  redirectToSpotifyLogin,
} from './services/auth';
import { fetchLyrics, type TrackLyrics } from './services/lyrics';
import { PROVIDERS } from './services/providers/registry';

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
const MUSIC_MENU = ['Playlists', 'Albums', 'Artists', 'Recently Played'];
const ARTIST_MENU = ['Top Tracks', 'Albums'];
const SETTINGS_MENU = ['Shuffle', 'Repeat', 'Theme', 'About', 'Sign Out'];

const REPEAT_ORDER: RepeatMode[] = ['off', 'context', 'track'];

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
  const [dataError, setDataError] = useState<string | null>(null);

  // Service
  const [service, setService] = useState<ActiveMusicService | null>(null);

  // Which source is currently active (drives the Sources screen highlight).
  const activeProviderId: ProviderId = service?.meta.id ?? (isDemoMode ? 'demo' : 'spotify');

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
    if (isDemoMode || !volumeControllable || currentScreen !== 'nowPlaying') return;
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
  }, [isDemoMode, volumeControllable, currentScreen, getDeviceVolume]);

  // ── Init service + session bootstrap ─────────────────────

  useEffect(() => {
    if (isDemoMode) {
      setService(createMockService());
      return;
    }
    setService(createSpotifyService(resolveSpotifyToken));
  }, [isDemoMode, resolveSpotifyToken]);

  useEffect(() => {
    if (isDemoMode) {
      if (nav[0]?.screen === 'login') setNav([{ screen: 'mainMenu', index: 0 }]);
      return;
    }
    void resolveSpotifyToken().then((tok) => {
      if (tok && nav[0]?.screen === 'login') {
        setNav([{ screen: 'mainMenu', index: 0 }]);
      }
    });
  }, [isDemoMode, resolveSpotifyToken]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!sdkState || isDemoMode) return;
    setIsPlaying(sdkState.isPlaying);
    // Don't clobber the user's scrub position with an in-flight SDK echo.
    if (Date.now() >= scrubbingUntilRef.current) setPositionMs(sdkState.positionMs);
    if (sdkState.track) setCurrentTrack(sdkState.track);
  }, [sdkState, isDemoMode]);

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
      if (!isDemoMode && service) {
        try {
          await activatePlayback();
          await runWithDevice((id) => service.play(source, idx, id));
        } catch {
          setIsPlaying(false);
        }
      }
    },
    [isDemoMode, service, activatePlayback, runWithDevice]
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
    if (!isDemoMode && service) {
      try {
        await activatePlayback();
        await runWithDevice((id) => (next ? service.resume(id) : service.pause(id)));
      } catch {
        setIsPlaying(!next);
      }
    }
  }, [isPlaying, isDemoMode, service, activatePlayback, runWithDevice]);

  const skipNext = useCallback(async () => {
    const list = playingTracksRef.current;
    const nextIdx = pickNextIndex(currentTrackIndex, list.length, shuffle);
    if (nextIdx < list.length) {
      const next = list[nextIdx];
      setCurrentTrack(next);
      setCurrentTrackIndex(nextIdx);
      setPositionMs(0);
    }
    if (!isDemoMode && service) {
      try {
        await activatePlayback();
        await runWithDevice((id) => service.next(id));
      } catch {
        /* keep UI state */
      }
    }
  }, [currentTrackIndex, shuffle, isDemoMode, service, activatePlayback, runWithDevice]);

  const skipPrev = useCallback(async () => {
    const list = playingTracksRef.current;
    if (positionMs > 3000 || currentTrackIndex === 0) {
      setPositionMs(0);
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
      setCurrentTrack(list[prevIdx]);
      setCurrentTrackIndex(prevIdx);
      setPositionMs(0);
      if (!isDemoMode && service) {
        try {
          await activatePlayback();
          await runWithDevice((id) => service.previous(id));
        } catch {
          /* keep UI state */
        }
      }
    }
  }, [currentTrackIndex, positionMs, isDemoMode, service, activatePlayback, runWithDevice]);

  const adjustVolume = useCallback(
    (delta: number) => {
      const newVol = Math.max(0, Math.min(100, volume + delta));
      setVolume(newVol);
      if (!isDemoMode && service && deviceId) {
        void service.setVolume(newVol, deviceId);
        setPlayerVolume(newVol);
      }
    },
    [volume, isDemoMode, service, deviceId, setPlayerVolume]
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
    [currentTrack, isDemoMode, service, activatePlayback, runWithDevice]
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
    setAccessToken(null);
    setIsDemoMode(false);
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
  }, []);

  // ── Lyrics ────────────────────────────────────────────────

  useEffect(() => {
    if (currentTrack?.id !== lyricsTrackIdRef.current) {
      setLyrics(null);
      lyricsTrackIdRef.current = null;
    }
  }, [currentTrack?.id]);

  const openLyrics = useCallback(() => {
    if (!currentTrack) return;
    push('lyrics');
    setLyricsUserScrolled(false);
    setIndex(0);

    if (lyricsTrackIdRef.current === currentTrack.id) return;

    setLyricsLoading(true);
    fetchLyrics(currentTrack, isDemoMode)
      .then((data) => {
        setLyrics(data);
        lyricsTrackIdRef.current = currentTrack.id;
      })
      .finally(() => setLyricsLoading(false));
  }, [currentTrack, isDemoMode, push, setIndex]);

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

  // ── Select action (takes explicit index to avoid stale closure) ──

  const doSelect = useCallback(
    (idx: number) => {
      switch (currentScreen) {
        case 'login': {
          if (idx === 0) {
            setIsDemoMode(false);
            redirectToSpotifyLogin();
          } else {
            localStorage.setItem('demo_mode', '1');
            setIsDemoMode(true);
            setAccessToken(null);
            setService(createMockService());
            setNav([{ screen: 'mainMenu', index: 0 }]);
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
          if (p.status === 'planned') {
            setDataError(`${p.label} — ${p.blurb}`);
          } else if (p.id === 'demo') {
            if (!isDemoMode) {
              localStorage.setItem('demo_mode', '1');
              setIsDemoMode(true);
              setAccessToken(null);
              setService(createMockService());
            }
            setNav([{ screen: 'mainMenu', index: 0 }]);
          } else if (p.id === 'spotify') {
            if (accessToken) {
              setDataError('Already signed in to Spotify.');
            } else {
              setIsDemoMode(false);
              redirectToSpotifyLogin();
            }
          }
          break;
        }
        case 'music': {
          if (idx === 0) {
            push('playlists');
            void loadPlaylists();
          } else if (idx === 1) {
            push('albums');
            void loadAlbums();
          } else if (idx === 2) {
            push('artists');
            void loadArtists();
          } else if (idx === 3) {
            push('tracks');
            void loadRecentlyPlayed();
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
          if (idx === 0) {
            push('tracks');
            void loadArtistTopTracks(selectedArtist);
          } else if (idx === 1) {
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
          else if (idx === 4) signOut();
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
      loadRecentlyPlayed, playFromList, playContext, openLyrics, toggleShuffle,
      cycleRepeat, toggleTheme, signOut, handleSearchKey, isDemoMode, accessToken,
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
      playlists, albums, artists, tracks, trackSource,
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
      case 'login': return 2;
      case 'mainMenu': return MAIN_MENU.length;
      case 'music': return MUSIC_MENU.length;
      case 'settings': return SETTINGS_MENU.length;
      case 'sources': return PROVIDERS.length;
      case 'playlists': return playlists.length;
      case 'albums': return albums.length;
      case 'artists': return artists.length;
      case 'artist': return ARTIST_MENU.length;
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
                  musicMenu={MUSIC_MENU}
                  playlists={playlists}
                  albums={albums}
                  artists={artists}
                  tracks={tracks}
                  currentTrack={currentTrack}
                  isPlaying={isPlaying}
                  positionMs={positionMs}
                  volume={volume}
                  volumeControllable={volumeControllable}
                  shuffle={shuffle}
                  repeat={repeat}
                  theme={theme}
                  isPlayerReady={isReady}
                  playerError={playerError}
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
  musicMenu: string[];
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
      return <LoginScreen selectedIndex={selectedIndex} onItemClick={onItemClick} />;
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
          items={ARTIST_MENU.map((label) => ({ label, arrow: true }))}
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
            { label: 'Sign Out', detail: props.activeProviderId === 'demo' ? 'Exit demo' : 'Spotify' },
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

function LoginScreen({ selectedIndex, onItemClick }: { selectedIndex: number; onItemClick: (i: number) => void }) {
  const redirectUri = getSpotifyRedirectUri();
  const redirectWarning = getRedirectUriWarning();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="login-screen" style={{ flex: 1 }}>
        <div className="login-logo">🎵 OldPod.fm</div>
        {redirectWarning ? (
          <p className="login-sub login-sub--warn">{redirectWarning}</p>
        ) : (
          <p className="login-sub">
            Spotify redirect URI:
            <br />
            <span className="login-uri">{redirectUri}</span>
          </p>
        )}
      </div>
      <ul className="menu-list">
        {['Login with Spotify', 'Demo Mode'].map((label, i) => (
          <li
            key={label}
            className={`menu-item${i === selectedIndex ? ' selected' : ''}`}
            onClick={() => onItemClick(i)}
            style={{ cursor: 'pointer' }}
          >
            <span className="menu-item-text">{label}</span>
          </li>
        ))}
      </ul>
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
    return 'Switch';
  };

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
        {note ?? PROVIDERS.find((p) => p.id === selectedIndexProvider(selectedIndex))?.blurb}
      </div>
    </div>
  );
}

function selectedIndexProvider(idx: number): ProviderId | undefined {
  return PROVIDERS[idx]?.id;
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
