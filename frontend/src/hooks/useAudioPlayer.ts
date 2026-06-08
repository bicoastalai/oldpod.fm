/**
 * HTML5 `<audio>` playback for DRM-free sources (Audius today).
 *
 * Owns a single, reusable `Audio` element and exposes the same state shape the
 * iPod UI already consumes for Spotify (isPlaying / positionMs / durationMs)
 * plus imperative controls. The hook is deliberately a "dumb" single-track
 * player: the queue, shuffle and repeat logic lives in App.tsx (shared with
 * demo mode), and the host calls `loadAndPlay` for each track, reacting to
 * `onEnded` to advance. This keeps queue behaviour in one place and the audio
 * layer minimal and robust.
 *
 * Example:
 *   const audio = useAudioPlayer(handleTrackEnded);
 *   await audio.loadAndPlay(track.uri); // stream URL
 *   audio.seek(30_000);
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AudioPlayerState {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
}

/**
 * iOS/iPadOS lock media volume to the hardware buttons; `HTMLMediaElement.volume`
 * is read-only there. Mirror the Spotify hook's detection so the UI hides the
 * volume bar on those devices instead of showing a control that does nothing.
 */
const isVolumeHardwareLocked =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const INITIAL_STATE: AudioPlayerState = { isPlaying: false, positionMs: 0, durationMs: 0 };

export function useAudioPlayer(onEnded?: () => void) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onEndedRef = useRef(onEnded);
  const [audioState, setAudioState] = useState<AudioPlayerState>(INITIAL_STATE);
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  const ensureAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;
    const el = new Audio();
    el.preload = 'auto';
    el.addEventListener('timeupdate', () => {
      setAudioState((s) => ({ ...s, positionMs: Math.round(el.currentTime * 1000) }));
    });
    el.addEventListener('durationchange', () => {
      if (Number.isFinite(el.duration)) {
        setAudioState((s) => ({ ...s, durationMs: Math.round(el.duration * 1000) }));
      }
    });
    el.addEventListener('play', () => setAudioState((s) => ({ ...s, isPlaying: true })));
    el.addEventListener('playing', () => setAudioState((s) => ({ ...s, isPlaying: true })));
    el.addEventListener('pause', () => setAudioState((s) => ({ ...s, isPlaying: false })));
    el.addEventListener('ended', () => {
      setAudioState((s) => ({ ...s, isPlaying: false }));
      onEndedRef.current?.();
    });
    el.addEventListener('error', () => {
      if (el.src) setAudioError('Could not play this track — try another.');
    });
    audioRef.current = el;
    return el;
  }, []);

  // Load a new source and start playback. Must be called inside a user gesture
  // for the first play so browsers don't block autoplay.
  const loadAndPlay = useCallback(
    async (url: string): Promise<void> => {
      const el = ensureAudio();
      setAudioError(null);
      setAudioState((s) => ({ ...s, positionMs: 0, isPlaying: true }));
      el.src = url;
      try {
        await el.play();
      } catch {
        setAudioState((s) => ({ ...s, isPlaying: false }));
        setAudioError('Tap play to start audio.');
      }
    },
    [ensureAudio]
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(async (): Promise<void> => {
    const el = audioRef.current;
    if (!el || !el.src) return;
    try {
      await el.play();
    } catch {
      setAudioState((s) => ({ ...s, isPlaying: false }));
    }
  }, []);

  const seek = useCallback((positionMs: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, positionMs / 1000);
    setAudioState((s) => ({ ...s, positionMs: Math.max(0, positionMs) }));
  }, []);

  const setVolume = useCallback((volumePct: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, volumePct / 100));
  }, []);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    setAudioState(INITIAL_STATE);
    setAudioError(null);
  }, []);

  useEffect(() => {
    return () => {
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.removeAttribute('src');
      }
    };
  }, []);

  return {
    audioState,
    audioError,
    loadAndPlay,
    pause,
    resume,
    seek,
    setVolume,
    stop,
    volumeControllable: !isVolumeHardwareLocked,
  };
}
