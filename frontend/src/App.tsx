import React, { useCallback, useEffect, useRef, useState } from 'react';
import ClickWheel from './components/ClickWheel';
import { useSpotifyPlayer } from './hooks/useSpotifyPlayer';
import {
  albumArtPlaceholder,
  createMockService,
  createSpotifyService,
  formatTime,
  Playlist,
  SpotifyService,
  Track,
} from './services/spotify';
import {
  exchangeCodeForToken,
  getStoredToken,
  redirectToSpotifyLogin,
} from './services/auth';

// ── Types ──────────────────────────────────────────────────

type Screen = 'login' | 'mainMenu' | 'music' | 'playlists' | 'tracks' | 'nowPlaying' | 'settings';

interface NavEntry {
  screen: Screen;
  index: number;
}

const MAIN_MENU = ['Music', 'Now Playing', 'Settings'];
const MUSIC_MENU = ['Playlists'];

const SCREEN_TITLES: Record<Screen, string> = {
  login: 'OldPod.fm',
  mainMenu: 'iPod',
  music: 'Music',
  playlists: 'Playlists',
  tracks: 'Songs',
  nowPlaying: 'Now Playing',
  settings: 'Settings',
};

// ── Helpers ────────────────────────────────────────────────


function visibleWindow<T>(items: T[], selectedIdx: number, windowSize = 7): [T[], number] {
  const half = Math.floor(windowSize / 2);
  let start = Math.max(0, selectedIdx - half);
  const end = Math.min(items.length, start + windowSize);
  start = Math.max(0, end - windowSize);
  return [items.slice(start, end), selectedIdx - start];
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

  // Auth
  const [accessToken, setAccessToken] = useState<string | null>(getStoredToken);
  const [isDemoMode, setIsDemoMode] = useState(() => localStorage.getItem('demo_mode') === '1');

  // Service
  const [service, setService] = useState<SpotifyService | null>(null);

  // Data
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Playback state (demo-mode managed here; real mode driven by SDK)
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [volume, setVolume] = useState(80);
  const playingTracksRef = useRef<Track[]>([]);

  // Spotify SDK player (real mode)
  const { deviceId, sdkState } = useSpotifyPlayer(accessToken);

  // ── Init service ─────────────────────────────────────────

  useEffect(() => {
    if (isDemoMode) {
      setService(createMockService());
      push('mainMenu');
    } else if (accessToken) {
      setService(createSpotifyService(accessToken));
      push('mainMenu');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle PKCE callback (?code=...) ────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    window.history.replaceState(null, '', window.location.pathname);
    exchangeCodeForToken(code).then((tok) => {
      setAccessToken(tok);
      setService(createSpotifyService(tok));
      setNav([{ screen: 'mainMenu', index: 0 }]);
    }).catch(console.error);
  }, []);

  // ── SDK state sync (real mode) ───────────────────────────

  useEffect(() => {
    if (!sdkState || isDemoMode) return;
    setIsPlaying(sdkState.isPlaying);
    setPositionMs(sdkState.positionMs);
    if (sdkState.track) setCurrentTrack(sdkState.track);
  }, [sdkState, isDemoMode]);

  // ── Demo mode position timer ─────────────────────────────

  useEffect(() => {
    if (!isDemoMode || !isPlaying || !currentTrack) return;
    const id = setInterval(() => {
      setPositionMs((prev) => {
        if (prev + 1000 >= currentTrack.durationMs) {
          // Auto-advance
          const nextIdx = currentTrackIndex + 1;
          if (nextIdx < playingTracksRef.current.length) {
            const next = playingTracksRef.current[nextIdx];
            setCurrentTrackIndex(nextIdx);
            setCurrentTrack(next);
            return 0;
          } else {
            setIsPlaying(false);
            return currentTrack.durationMs;
          }
        }
        return prev + 1000;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isDemoMode, isPlaying, currentTrack, currentTrackIndex]);

  // ── Load playlists ────────────────────────────────────────

  const loadPlaylists = useCallback(async () => {
    if (!service) return;
    setIsLoading(true);
    try {
      const data = await service.getPlaylists();
      setPlaylists(data);
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  // ── Load tracks ───────────────────────────────────────────

  const loadTracks = useCallback(
    async (playlist: Playlist) => {
      if (!service) return;
      setIsLoading(true);
      setActivePlaylist(playlist);
      try {
        const data = await service.getTracks(playlist.id);
        setTracks(data);
      } finally {
        setIsLoading(false);
      }
    },
    [service]
  );

  // ── Playback controls ─────────────────────────────────────

  const playTrack = useCallback(
    async (trackList: Track[], idx: number) => {
      const track = trackList[idx];
      playingTracksRef.current = trackList;
      setCurrentTrack(track);
      setCurrentTrackIndex(idx);
      setPositionMs(0);
      setIsPlaying(true);
      if (!isDemoMode && service && activePlaylist && deviceId) {
        await service.playTrack(activePlaylist.id, idx, deviceId);
      }
    },
    [isDemoMode, service, activePlaylist, deviceId]
  );

  const togglePlay = useCallback(async () => {
    const next = !isPlaying;
    setIsPlaying(next);
    if (!isDemoMode && service && deviceId) {
      if (next) await service.resume(deviceId);
      else await service.pause(deviceId);
    }
  }, [isPlaying, isDemoMode, service, deviceId]);

  const skipNext = useCallback(async () => {
    const list = playingTracksRef.current;
    const nextIdx = currentTrackIndex + 1;
    if (nextIdx < list.length) {
      await playTrack(list, nextIdx);
    }
    if (!isDemoMode && service && deviceId) {
      await service.next(deviceId);
    }
  }, [currentTrackIndex, isDemoMode, service, deviceId, playTrack]);

  const skipPrev = useCallback(async () => {
    const list = playingTracksRef.current;
    if (positionMs > 3000 || currentTrackIndex === 0) {
      setPositionMs(0);
      if (!isDemoMode && service && deviceId) {
        await service.seek(0, deviceId);
      }
    } else {
      const prevIdx = currentTrackIndex - 1;
      await playTrack(list, prevIdx);
      if (!isDemoMode && service && deviceId) {
        await service.previous(deviceId);
      }
    }
  }, [currentTrackIndex, positionMs, isDemoMode, service, deviceId, playTrack]);

  const adjustVolume = useCallback(
    (delta: number) => {
      const newVol = Math.max(0, Math.min(100, volume + delta));
      setVolume(newVol);
      if (!isDemoMode && service) {
        service.setVolume(newVol);
      }
    },
    [volume, isDemoMode, service]
  );

  // ── Select action (takes explicit index to avoid stale closure) ──

  const doSelect = useCallback(
    (idx: number) => {
      switch (currentScreen) {
        case 'login': {
          if (idx === 0) {
            redirectToSpotifyLogin();
          } else {
            localStorage.setItem('demo_mode', '1');
            setIsDemoMode(true);
            setService(createMockService());
            setNav([{ screen: 'mainMenu', index: 0 }]);
          }
          break;
        }
        case 'mainMenu': {
          if (idx === 0) push('music');
          else if (idx === 1) push('nowPlaying');
          else if (idx === 2) push('settings');
          break;
        }
        case 'music': {
          if (idx === 0) loadPlaylists().then(() => push('playlists'));
          break;
        }
        case 'playlists': {
          const pl = playlists[idx];
          if (pl) loadTracks(pl).then(() => push('tracks'));
          break;
        }
        case 'tracks': {
          const track = tracks[idx];
          if (track) playTrack(tracks, idx).then(() => push('nowPlaying'));
          break;
        }
        case 'nowPlaying':
          togglePlay();
          break;
      }
    },
    [currentScreen, push, playlists, tracks, loadPlaylists, loadTracks, playTrack, togglePlay]
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
        adjustVolume(direction === 'down' ? 5 : -5);
        return;
      }
      const listLen = getListLength(currentScreen);
      const delta = direction === 'down' ? 1 : -1;
      setIndex(Math.max(0, Math.min(listLen - 1, selectedIndex + delta)));
    },
    [currentScreen, selectedIndex, adjustVolume, setIndex] // eslint-disable-line react-hooks/exhaustive-deps
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
      case 'playlists': return playlists.length;
      case 'tracks': return tracks.length;
      default: return 0;
    }
  }

  // ── Screen title ──────────────────────────────────────────

  const screenTitle =
    currentScreen === 'tracks' && activePlaylist
      ? activePlaylist.name
      : SCREEN_TITLES[currentScreen];

  // ── Render ────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at center, #c8c8c8 0%, #909090 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div className="ipod">
        {/* Screen */}
        <div className="ipod-bezel">
          <div className="ipod-screen">
            <div className="screen-header">{screenTitle}</div>
            <div className="screen-body">
              {isLoading ? (
                <LoadingView />
              ) : (
                <ScreenContent
                  screen={currentScreen}
                  selectedIndex={selectedIndex}
                  mainMenu={MAIN_MENU}
                  musicMenu={MUSIC_MENU}
                  playlists={playlists}
                  tracks={tracks}
                  currentTrack={currentTrack}
                  isPlaying={isPlaying}
                  positionMs={positionMs}
                  volume={volume}
                  onItemClick={handleItemClick}
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
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  positionMs: number;
  volume: number;
  onItemClick: (index: number) => void;
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
            detail: String(p.trackCount),
            arrow: true,
          }))}
          selectedIndex={selectedIndex}
          onItemClick={onItemClick}
        />
      );
    case 'tracks':
      return (
        <MenuScreen
          items={props.tracks.map((t) => ({
            label: t.name,
            detail: t.artist,
          }))}
          selectedIndex={selectedIndex}
          onItemClick={onItemClick}
        />
      );
    case 'nowPlaying':
      return (
        <NowPlayingScreen
          track={props.currentTrack}
          isPlaying={props.isPlaying}
          positionMs={props.positionMs}
          volume={props.volume}
        />
      );
    case 'settings':
      return <SettingsScreen volume={props.volume} />;
    default:
      return null;
  }
}

// ── Login screen ───────────────────────────────────────────

function LoginScreen({ selectedIndex, onItemClick }: { selectedIndex: number; onItemClick: (i: number) => void }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="login-screen" style={{ flex: 1 }}>
        <div className="login-logo">🎵 OldPod.fm</div>
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

// ── Generic menu list ──────────────────────────────────────

interface MenuItem {
  label: string;
  detail?: string;
  arrow?: boolean;
}

function MenuScreen({ items, selectedIndex, onItemClick }: { items: MenuItem[]; selectedIndex: number; onItemClick: (i: number) => void }) {
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

// ── Now Playing screen ─────────────────────────────────────

function NowPlayingScreen({
  track,
  isPlaying,
  positionMs,
  volume,
}: {
  track: Track | null;
  isPlaying: boolean;
  positionMs: number;
  volume: number;
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
          <div style={{ fontSize: '10px', marginTop: '2px' }}>{isPlaying ? '▶ Playing' : '⏸ Paused'}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      {/* Times */}
      <div className="time-row">
        <span>{formatTime(positionMs)}</span>
        <span>-{formatTime(track.durationMs - positionMs)}</span>
      </div>

      {/* Volume */}
      <div className="volume-row">
        <span className="volume-label">🔈</span>
        <div className="volume-bar">
          <div className="volume-fill" style={{ width: `${volume}%` }} />
        </div>
        <span className="volume-label" style={{ textAlign: 'right' }}>🔊</span>
      </div>
    </div>
  );
}

// ── Settings screen ────────────────────────────────────────

function SettingsScreen({ volume }: { volume: number }) {
  return (
    <div className="settings-screen">
      <div className="settings-item">
        <span>Volume</span>
        <span>{volume}%</span>
      </div>
      <div className="settings-item">
        <span>About</span>
        <span style={{ fontSize: '9px', color: '#888' }}>OldPod.fm v1.0</span>
      </div>
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
