/**
 * Minimal ambient types for the YouTube IFrame Player API.
 *
 * We deliberately avoid the `@types/youtube` dependency (no new npm deps per the
 * repo rules) and declare only the slice of the global `YT` namespace that
 * `hooks/useYouTubePlayer.ts` actually uses. The API attaches `window.YT` once
 * `https://www.youtube.com/iframe_api` loads and calls
 * `window.onYouTubeIframeAPIReady`.
 */
declare namespace YT {
  interface PlayerEvent {
    target: Player;
  }

  interface OnStateChangeEvent {
    target: Player;
    /** One of the PlayerState numeric values (-1, 0, 1, 2, 3, 5). */
    data: number;
  }

  interface OnErrorEvent {
    target: Player;
    data: number;
  }

  interface PlayerVars {
    autoplay?: 0 | 1;
    controls?: 0 | 1;
    rel?: 0 | 1;
    modestbranding?: 0 | 1;
    playsinline?: 0 | 1;
    fs?: 0 | 1;
    [key: string]: unknown;
  }

  interface PlayerOptions {
    videoId?: string;
    width?: number | string;
    height?: number | string;
    playerVars?: PlayerVars;
    events?: {
      onReady?: (event: PlayerEvent) => void;
      onStateChange?: (event: OnStateChangeEvent) => void;
      onError?: (event: OnErrorEvent) => void;
    };
  }

  class Player {
    constructor(element: HTMLElement | string, options: PlayerOptions);
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    loadVideoById(videoId: string): void;
    cueVideoById(videoId: string): void;
    setVolume(volume: number): void;
    getVolume(): number;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
    destroy(): void;
  }
}

interface Window {
  YT?: typeof YT;
  onYouTubeIframeAPIReady?: () => void;
}
