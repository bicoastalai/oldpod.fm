/**
 * YouTube IFrame Player API playback for OldPod.fm.
 *
 * Owns a single `YT.Player` bound to a host `<div>` (provided via `hostRef`) and
 * exposes the SAME state shape the iPod UI already consumes for Spotify/Audius
 * (isPlaying / positionMs / durationMs) plus imperative controls. Like
 * `useAudioPlayer`, this is a deliberately "dumb" single-track player: the
 * queue, shuffle and repeat logic lives in App.tsx (shared with demo/Audius),
 * and the host calls `loadAndPlay` per track, reacting to `onEnded` to advance.
 *
 * ToS note: YouTube's Terms expect the IFrame player to remain visible (not
 * audio-only / hidden) during playback. App.tsx therefore renders this host in
 * the Now Playing album-art region while playing, rather than off-screen.
 *
 * Example:
 *   const yt = useYouTubePlayer(handleTrackEnded);
 *   <div ref={yt.hostRef} />
 *   await yt.loadAndPlay(videoId);
 *   yt.seek(30_000);
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface YouTubePlayerState {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
}

// YT.PlayerState numeric values (avoids depending on the runtime enum object).
const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;

const IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';
const INITIAL_STATE: YouTubePlayerState = { isPlaying: false, positionMs: 0, durationMs: 0 };

/**
 * iOS/iPadOS lock media volume to the hardware buttons. Mirror the audio hook's
 * detection so the UI hides the volume bar there instead of showing a no-op.
 */
const isVolumeHardwareLocked =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// Load the IFrame API exactly once per page, guarding against a double-insert.
let apiPromise: Promise<void> | null = null;
function loadIframeApi(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    if (!document.querySelector(`script[src="${IFRAME_API_SRC}"]`)) {
      const tag = document.createElement('script');
      tag.src = IFRAME_API_SRC;
      document.head.appendChild(tag);
    }
  });
  return apiPromise;
}

export function useYouTubePlayer(onEnded?: () => void) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const readyRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  // A play requested before the player is ready; flushed in onReady.
  const pendingVideoRef = useRef<string | null>(null);

  const [playerState, setPlayerState] = useState<YouTubePlayerState>(INITIAL_STATE);
  const [playerError, setPlayerError] = useState<string | null>(null);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  // Create the player once the API and host element are both available.
  useEffect(() => {
    let cancelled = false;
    void loadIframeApi().then(() => {
      if (cancelled || playerRef.current || !hostRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 0, fs: 0 },
        events: {
          onReady: () => {
            readyRef.current = true;
            if (pendingVideoRef.current) {
              playerRef.current?.loadVideoById(pendingVideoRef.current);
              pendingVideoRef.current = null;
            }
          },
          onStateChange: (event) => {
            const player = playerRef.current;
            if (event.data === YT_PLAYING) {
              const dur = player?.getDuration?.() ?? 0;
              setPlayerState((s) => ({
                ...s,
                isPlaying: true,
                durationMs: Number.isFinite(dur) ? Math.round(dur * 1000) : s.durationMs,
              }));
            } else if (event.data === YT_PAUSED) {
              setPlayerState((s) => ({ ...s, isPlaying: false }));
            } else if (event.data === YT_ENDED) {
              setPlayerState((s) => ({ ...s, isPlaying: false }));
              onEndedRef.current?.();
            }
          },
          onError: () => {
            setPlayerError('Could not play this video — try another.');
          },
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll position/duration — the IFrame API has no timeupdate event.
  useEffect(() => {
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || !readyRef.current) return;
      const pos = player.getCurrentTime?.();
      const dur = player.getDuration?.();
      if (typeof pos === 'number') {
        setPlayerState((s) => ({
          ...s,
          positionMs: Math.round(pos * 1000),
          durationMs: typeof dur === 'number' && dur > 0 ? Math.round(dur * 1000) : s.durationMs,
        }));
      }
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  // Load a new video and start playback. Should be called inside a user gesture
  // for the first play so browsers don't block autoplay.
  const loadAndPlay = useCallback(async (videoId: string): Promise<void> => {
    setPlayerError(null);
    setPlayerState((s) => ({ ...s, positionMs: 0, isPlaying: true }));
    const player = playerRef.current;
    if (player && readyRef.current) {
      player.loadVideoById(videoId);
    } else {
      // Player not ready yet — remember it; onReady will start playback.
      pendingVideoRef.current = videoId;
    }
  }, []);

  const pause = useCallback(() => {
    playerRef.current?.pauseVideo();
  }, []);

  const resume = useCallback(() => {
    playerRef.current?.playVideo();
  }, []);

  const seek = useCallback((positionMs: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(Math.max(0, positionMs / 1000), true);
    setPlayerState((s) => ({ ...s, positionMs: Math.max(0, positionMs) }));
  }, []);

  const setVolume = useCallback((volumePct: number) => {
    playerRef.current?.setVolume(Math.max(0, Math.min(100, volumePct)));
  }, []);

  const stop = useCallback(() => {
    pendingVideoRef.current = null;
    try {
      playerRef.current?.stopVideo();
    } catch {
      /* player may not be ready */
    }
    setPlayerState(INITIAL_STATE);
    setPlayerError(null);
  }, []);

  useEffect(() => {
    return () => {
      try {
        playerRef.current?.destroy();
      } catch {
        /* already gone */
      }
      playerRef.current = null;
      readyRef.current = false;
    };
  }, []);

  return {
    hostRef,
    playerState,
    playerError,
    loadAndPlay,
    pause,
    resume,
    seek,
    setVolume,
    stop,
    volumeControllable: !isVolumeHardwareLocked,
  };
}
