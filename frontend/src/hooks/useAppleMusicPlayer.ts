/**
 * Apple Music playback for OldPod.fm, via MusicKit JS v3.
 *
 * This is the app's fourth playback engine (after Spotify's Web Playback SDK,
 * the HTML5 `<audio>` element, and the YouTube IFrame player). Like the Audius
 * and YouTube hooks it is a deliberately "dumb" single-track player — the queue,
 * shuffle and repeat logic lives in App.tsx, which calls `loadAndPlay` per track
 * and reacts to `onEnded` to advance. It exposes the SAME state shape the iPod UI
 * already consumes (`isPlaying` / `positionMs` / `durationMs`) plus controls.
 *
 * Full-catalog playback uses MusicKit (DRM, subscriber-only). For users who
 * authorize but have no Apple Music subscription, playback falls back to the
 * 30-second catalog **preview** URL through the existing `useAudioPlayer`
 * `<audio>` path — the two streams are never co-mingled; a track plays via one
 * engine or the other.
 *
 * Example:
 *   const apple = useAppleMusicPlayer(handleTrackEnded);
 *   await apple.loadAndPlay(track); // track.uri = applemusic:song:{id}
 *   apple.seek(30_000);
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  appleSongIdFromUri,
  authorizeAppleMusic,
  ensureAppleMusicConfigured,
  getApplePreviewUrl,
  APPLE_NOT_CONFIGURED_MESSAGE,
} from '../services/apple-music';
import { useAudioPlayer } from './useAudioPlayer';
import type { Track } from '../services/providers/types';

export interface AppleMusicPlayerState {
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
}

const INITIAL_STATE: AppleMusicPlayerState = { isPlaying: false, positionMs: 0, durationMs: 0 };

/** iOS/iPadOS lock media volume to the hardware buttons (mirror the other hooks). */
const isVolumeHardwareLocked =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Numeric MusicKit playback states that mean "the track is over". */
function isEndedState(state: number | undefined): boolean {
  const states = window.MusicKit?.PlaybackStates;
  if (!states || typeof state !== 'number') return false;
  return state === states.completed || state === states.ended;
}

function isPlayingState(state: number | undefined): boolean {
  const states = window.MusicKit?.PlaybackStates;
  if (!states || typeof state !== 'number') return false;
  return state === states.playing;
}

export function useAppleMusicPlayer(onEnded?: () => void) {
  // Preview playback reuses the shared <audio> hook; its `ended` advances the
  // same queue via the same callback, so non-subscribers behave identically.
  // Destructure its (stable) callbacks so our controls keep stable identity too.
  const {
    loadAndPlay: previewLoadAndPlay,
    pause: previewPause,
    resume: previewResume,
    seek: previewSeek,
    setVolume: previewSetVolume,
    stop: previewStop,
    audioState: previewState,
    audioError: previewError,
  } = useAudioPlayer(onEnded);
  // 'full' = MusicKit DRM stream; 'preview' = 30s <audio> preview.
  const modeRef = useRef<'full' | 'preview'>('full');
  const onEndedRef = useRef(onEnded);
  const [mkState, setMkState] = useState<AppleMusicPlayerState>(INITIAL_STATE);
  const [playerError, setPlayerError] = useState<string | null>(null);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  // Subscribe to MusicKit playback events (and poll position, since the event
  // cadence is coarse) once the instance is configured.
  useEffect(() => {
    let cancelled = false;
    let music: MusicKit.MusicKitInstance | null = null;
    const events = window.MusicKit?.Events;

    const syncFromInstance = () => {
      if (!music || modeRef.current !== 'full') return;
      setMkState({
        isPlaying: isPlayingState(music.playbackState) || music.isPlaying,
        positionMs: Math.round((music.currentPlaybackTime || 0) * 1000),
        durationMs: Math.round((music.currentPlaybackDuration || 0) * 1000),
      });
    };

    const onStateChange = () => {
      if (!music || modeRef.current !== 'full') return;
      if (isEndedState(music.playbackState)) {
        setMkState((s) => ({ ...s, isPlaying: false }));
        onEndedRef.current?.();
        return;
      }
      syncFromInstance();
    };

    void ensureAppleMusicConfigured().then((instance) => {
      if (cancelled || !instance) return;
      music = instance;
      const evStateChange = events?.playbackStateDidChange ?? 'playbackStateDidChange';
      const evTimeChange = events?.playbackTimeDidChange ?? 'playbackTimeDidChange';
      instance.addEventListener(evStateChange, onStateChange);
      instance.addEventListener(evTimeChange, syncFromInstance);
    });

    const pollId = window.setInterval(syncFromInstance, 500);
    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      if (music) {
        const evStateChange = events?.playbackStateDidChange ?? 'playbackStateDidChange';
        const evTimeChange = events?.playbackTimeDidChange ?? 'playbackTimeDidChange';
        music.removeEventListener(evStateChange, onStateChange);
        music.removeEventListener(evTimeChange, syncFromInstance);
      }
    };
  }, []);

  const loadAndPlay = useCallback(
    async (track: Track): Promise<void> => {
      const id = appleSongIdFromUri(track.uri);
      if (!id) return;
      setPlayerError(null);

      const music = await ensureAppleMusicConfigured();
      if (!music) {
        setPlayerError(APPLE_NOT_CONFIGURED_MESSAGE);
        return;
      }

      // Prefer full-catalog DRM playback; fall back to the 30s preview when the
      // account has no subscription (MusicKit refuses to play full tracks).
      try {
        modeRef.current = 'full';
        setMkState((s) => ({ ...s, positionMs: 0, isPlaying: true }));
        await music.setQueue({ songs: [id] });
        await music.play();
      } catch {
        const url = getApplePreviewUrl(id);
        if (url) {
          modeRef.current = 'preview';
          await previewLoadAndPlay(url);
        } else {
          modeRef.current = 'full';
          setMkState((s) => ({ ...s, isPlaying: false }));
          setPlayerError('Apple Music needs an active subscription to play full songs.');
        }
      }
    },
    [previewLoadAndPlay]
  );

  const pause = useCallback(() => {
    if (modeRef.current === 'preview') {
      previewPause();
      return;
    }
    window.MusicKit?.getInstance()?.pause();
  }, [previewPause]);

  const resume = useCallback(async () => {
    if (modeRef.current === 'preview') {
      await previewResume();
      return;
    }
    try {
      await window.MusicKit?.getInstance()?.play();
    } catch {
      setMkState((s) => ({ ...s, isPlaying: false }));
    }
  }, [previewResume]);

  const seek = useCallback(
    (positionMs: number) => {
      if (modeRef.current === 'preview') {
        previewSeek(positionMs);
        return;
      }
      const music = window.MusicKit?.getInstance();
      if (!music) return;
      void music.seekToTime(Math.max(0, positionMs / 1000));
      setMkState((s) => ({ ...s, positionMs: Math.max(0, positionMs) }));
    },
    [previewSeek]
  );

  const setVolume = useCallback(
    (volumePct: number) => {
      const clamped = Math.max(0, Math.min(1, volumePct / 100));
      const music = window.MusicKit?.getInstance();
      if (music) music.volume = clamped;
      previewSetVolume(volumePct);
    },
    [previewSetVolume]
  );

  const stop = useCallback(() => {
    try {
      void window.MusicKit?.getInstance()?.stop();
    } catch {
      /* not configured / nothing playing */
    }
    previewStop();
    modeRef.current = 'full';
    setMkState(INITIAL_STATE);
    setPlayerError(null);
  }, [previewStop]);

  const playerState = modeRef.current === 'preview' ? previewState : mkState;
  const error = modeRef.current === 'preview' ? previewError : playerError;

  return {
    playerState,
    playerError: error,
    loadAndPlay,
    pause,
    resume,
    seek,
    setVolume,
    stop,
    volumeControllable: !isVolumeHardwareLocked,
  };
}
