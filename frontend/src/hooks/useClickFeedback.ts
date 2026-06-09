/**
 * Tactile navigation feedback for the click wheel — a synthesized iPod-style
 * "tick" (Web Audio) plus a short haptic vibration on supported devices.
 *
 * The sound is generated entirely in-browser (a ~6ms fast-decaying filtered
 * noise burst through a gain envelope) so we never ship or play Apple's
 * copyrighted click asset. One shared `AudioContext` + pre-rendered noise
 * buffer are reused for every tick, keeping rapid wheel scrolling lag- and
 * clip-free. The context is created lazily and resumed on the first user
 * gesture (browser autoplay policy).
 *
 * Haptics use the Vibration API (`navigator.vibrate`), feature-detected so it
 * gracefully no-ops where unsupported (notably iOS Safari, which has no
 * Vibration API at all).
 *
 * Both effects are user-controllable from Settings and persisted to
 * localStorage. The click audio is independent of the media `<audio>`/SDK
 * players and intentionally quiet so it never overpowers music.
 *
 * Example:
 *   const feedback = useClickFeedback();
 *   feedback.tick();  // per wheel scroll step
 *   feedback.press(); // per button press
 *   feedback.setSoundEnabled(false);
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const CLICK_SOUND_KEY = 'click_sound';
export const CLICK_HAPTIC_KEY = 'click_haptic';

// Both default ON; they're effectively silent until a user gesture (audio) and
// no-op on devices without vibration support, so an ON default is safe.
function readSetting(key: string): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(key) !== 'off';
}

function writeSetting(key: string, value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, value ? 'on' : 'off');
}

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

type WindowWithAudio = Window & { webkitAudioContext?: typeof AudioContext };

// Module-level singletons so every tick reuses one context + noise buffer. The
// buffer holds a single short decaying-noise impulse; each tick plays it back
// through a fresh (cheap, one-shot, auto-GC'd) buffer source + gain node.
let sharedCtx: AudioContext | null = null;
let clickBuffer: AudioBuffer | null = null;

function getAudioContext(): AudioContext | null {
  if (sharedCtx) return sharedCtx;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as WindowWithAudio).webkitAudioContext;
  if (!Ctor) return null;
  sharedCtx = new Ctor();
  return sharedCtx;
}

// Pre-render the percussive tick once: white noise shaped by a fast exponential
// decay so it reads as a short mechanical "click" rather than a tone.
function getClickBuffer(ctx: AudioContext): AudioBuffer {
  if (clickBuffer && clickBuffer.sampleRate === ctx.sampleRate) return clickBuffer;
  const durationS = 0.006; // ~6ms — short and percussive, low latency
  const length = Math.max(1, Math.floor(ctx.sampleRate * durationS));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const decay = Math.exp(-i / (length * 0.35));
    data[i] = (Math.random() * 2 - 1) * decay;
  }
  clickBuffer = buffer;
  return clickBuffer;
}

export interface ClickFeedback {
  soundEnabled: boolean;
  hapticEnabled: boolean;
  setSoundEnabled: (value: boolean) => void;
  setHapticEnabled: (value: boolean) => void;
  toggleSound: () => void;
  toggleHaptic: () => void;
  /** Subtle feedback for a wheel scroll step. */
  tick: () => void;
  /** Slightly fuller feedback for a button press. */
  press: () => void;
}

export function useClickFeedback(): ClickFeedback {
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => readSetting(CLICK_SOUND_KEY));
  const [hapticEnabled, setHapticEnabledState] = useState<boolean>(() => readSetting(CLICK_HAPTIC_KEY));

  // Mirror state into refs so the play functions stay stable identities yet
  // always read the latest settings (no stale closures during fast scrolling).
  const soundRef = useRef(soundEnabled);
  const hapticRef = useRef(hapticEnabled);
  useEffect(() => {
    soundRef.current = soundEnabled;
    hapticRef.current = hapticEnabled;
  });

  const setSoundEnabled = useCallback((value: boolean) => {
    writeSetting(CLICK_SOUND_KEY, value);
    setSoundEnabledState(value);
  }, []);

  const setHapticEnabled = useCallback((value: boolean) => {
    writeSetting(CLICK_HAPTIC_KEY, value);
    setHapticEnabledState(value);
  }, []);

  const toggleSound = useCallback(() => setSoundEnabled(!soundRef.current), [setSoundEnabled]);
  const toggleHaptic = useCallback(() => setHapticEnabled(!hapticRef.current), [setHapticEnabled]);

  // Play one click. `gain` and `rate` shape tick vs press; never blocks nav and
  // swallows any audio errors so feedback can't break navigation.
  const playClick = useCallback((gain: number, rate: number) => {
    if (!soundRef.current) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      // Autoplay policy: contexts can start suspended until a gesture. tick/press
      // are called from pointer/click handlers, so resuming here is in-gesture.
      if (ctx.state === 'suspended') void ctx.resume();
      const source = ctx.createBufferSource();
      source.buffer = getClickBuffer(ctx);
      source.playbackRate.value = rate;
      const gainNode = ctx.createGain();
      gainNode.gain.value = gain;
      source.connect(gainNode).connect(ctx.destination);
      source.start();
    } catch {
      /* feedback is best-effort; ignore audio failures */
    }
  }, []);

  const vibrate = useCallback((ms: number) => {
    if (!hapticRef.current || !canVibrate) return;
    try {
      navigator.vibrate(ms);
    } catch {
      /* ignore — feature-detected, but be defensive */
    }
  }, []);

  const tick = useCallback(() => {
    playClick(0.18, 1.0);
    vibrate(8);
  }, [playClick, vibrate]);

  const press = useCallback(() => {
    playClick(0.3, 0.85);
    vibrate(12);
  }, [playClick, vibrate]);

  return {
    soundEnabled,
    hapticEnabled,
    setSoundEnabled,
    setHapticEnabled,
    toggleSound,
    toggleHaptic,
    tick,
    press,
  };
}
