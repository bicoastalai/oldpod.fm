/**
 * Minimal ambient types for MusicKit JS v3.
 *
 * We deliberately avoid a heavy MusicKit types dependency (no new npm deps per
 * the repo rules beyond the serverless `jose`) and declare only the slice of the
 * global `MusicKit` namespace that `services/apple-music.ts` and
 * `hooks/useAppleMusicPlayer.ts` actually use. The library attaches
 * `window.MusicKit` once `https://js-cdn.music.apple.com/musickit/v3/musickit.js`
 * loads and dispatches a `musickitloaded` event on `document`.
 */
declare namespace MusicKit {
  interface ConfigureOptions {
    developerToken: string;
    app: { name: string; build: string };
  }

  /** Numeric playback states (subset we react to). */
  interface PlaybackStates {
    none: number;
    loading: number;
    playing: number;
    paused: number;
    stopped: number;
    ended: number;
    seeking: number;
    waiting: number;
    stalled: number;
    completed: number;
  }

  interface SetQueueOptions {
    song?: string;
    songs?: string[];
    album?: string;
    playlist?: string;
    url?: string;
  }

  /** A configured MusicKit instance (returned by `configure`/`getInstance`). */
  interface MusicKitInstance {
    readonly developerToken: string;
    readonly musicUserToken: string | null;
    readonly isAuthorized: boolean;
    /** e.g. "us" — present after configure/authorize. */
    readonly storefrontId: string;
    readonly storefrontCountryCode?: string;
    /** Numeric current playback state (compare against MusicKit.PlaybackStates). */
    readonly playbackState: number;
    readonly currentPlaybackTime: number;
    readonly currentPlaybackDuration: number;
    readonly isPlaying: boolean;
    volume: number;

    authorize(): Promise<string>;
    unauthorize(): Promise<void>;
    setQueue(options: SetQueueOptions): Promise<unknown>;
    play(): Promise<void>;
    pause(): void;
    stop(): Promise<void> | void;
    seekToTime(seconds: number): Promise<void> | void;
    changeToMediaItem(descriptor: unknown): Promise<void>;

    addEventListener(name: string, callback: (event?: unknown) => void): void;
    removeEventListener(name: string, callback: (event?: unknown) => void): void;
  }

  /** Event name constants exposed on the global namespace. */
  interface Events {
    playbackStateDidChange: string;
    playbackTimeDidChange: string;
    playbackDurationDidChange: string;
    mediaItemDidChange: string;
    nowPlayingItemDidChange: string;
    authorizationStatusDidChange: string;
  }
}

interface MusicKitGlobal {
  configure(options: MusicKit.ConfigureOptions): Promise<MusicKit.MusicKitInstance>;
  getInstance(): MusicKit.MusicKitInstance | undefined;
  readonly PlaybackStates: MusicKit.PlaybackStates;
  readonly Events: MusicKit.Events;
}

interface Window {
  MusicKit?: MusicKitGlobal;
}
