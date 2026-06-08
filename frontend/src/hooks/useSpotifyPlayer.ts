import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoredToken, refreshAccessToken } from '../services/auth';
import type { Track } from '../services/spotify';

export interface SDKPlayerState {
  isPlaying: boolean;
  track: Track | null;
  positionMs: number;
  durationMs: number;
}

type PlayJob = (deviceId: string) => Promise<void>;

let singletonPlayer: any = null;
let connectPromise: Promise<string | null> | null = null;

/**
 * iOS/iPadOS lock media volume to the hardware buttons — the Web Playback SDK's
 * setVolume/getVolume are no-ops there (getVolume always returns 1). Everywhere
 * else the SDK exposes a real, readable software volume we can mirror.
 */
const isVolumeHardwareLocked =
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

function destroyPlayer() {
  connectPromise = null;
  if (singletonPlayer) {
    try {
      singletonPlayer.disconnect();
    } catch {
      /* ignore */
    }
    singletonPlayer = null;
  }
}

/** Spotify injects a hidden iframe; without these styles it often fails to init (Chrome). */
function fixSdkIframe() {
  const iframe = document.querySelector(
    'iframe[src*="sdk.scdn.co"]'
  ) as HTMLIFrameElement | null;
  if (!iframe) return;
  iframe.style.display = 'block';
  iframe.style.position = 'absolute';
  iframe.style.top = '-1000px';
  iframe.style.left = '-1000px';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.border = 'none';
}

async function transferPlayback(accessToken: string, deviceId: string) {
  await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
}

function waitForSpotifySdk(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).Spotify) {
      resolve();
      return;
    }
    const prev = (window as any).onSpotifyWebPlaybackSDKReady;
    (window as any).onSpotifyWebPlaybackSDKReady = () => {
      prev?.();
      resolve();
    };
  });
}

export function useSpotifyPlayer(accessToken: string | null) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [sdkState, setSdkState] = useState<SDKPlayerState | null>(null);
  const playerRef = useRef<any>(null);
  const pendingPlayRef = useRef<PlayJob | null>(null);
  const accessTokenRef = useRef(accessToken);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  const resolveToken = useCallback(async (): Promise<string | null> => {
    let token = getStoredToken();
    if (!token) token = await refreshAccessToken();
    return token ?? accessTokenRef.current;
  }, []);

  const ensurePlayer = useCallback(async (): Promise<string | null> => {
    if (deviceId) return deviceId;
    if (!accessTokenRef.current) return null;

    if (connectPromise) return connectPromise;

    connectPromise = (async () => {
      setPlayerError(null);
      const token = await resolveToken();
      if (!token) {
        setPlayerError('Not logged in — sign in again.');
        return null;
      }

      await waitForSpotifySdk();
      const Spotify = (window as any).Spotify;
      if (!Spotify) {
        setPlayerError('Spotify player SDK failed to load.');
        return null;
      }

      // Always start fresh — reusing a failed instance causes "Failed to initialize player".
      destroyPlayer();

      return new Promise<string | null>((resolve) => {
        let settled = false;
        const finish = (id: string | null) => {
          if (settled) return;
          settled = true;
          resolve(id);
        };

        const fail = (message: string) => {
          setPlayerError(message);
          setIsReady(false);
          setDeviceId(null);
          destroyPlayer();
          playerRef.current = null;
          finish(null);
        };

        const player = new Spotify.Player({
          name: 'OldPod.fm',
          getOAuthToken: (cb: (t: string) => void) => {
            void resolveToken().then((t) => {
              if (t) cb(t);
            });
          },
          volume: 0.8,
        });

        player.addListener('ready', async ({ device_id }: { device_id: string }) => {
          fixSdkIframe();
          singletonPlayer = player;
          playerRef.current = player;
          setDeviceId(device_id);
          setIsReady(true);
          setPlayerError(null);

          const fresh = await resolveToken();
          if (fresh) await transferPlayback(fresh, device_id);

          const pending = pendingPlayRef.current;
          if (pending) {
            pendingPlayRef.current = null;
            await pending(device_id);
          }

          finish(device_id);
        });

        player.addListener('not_ready', () => {
          setDeviceId(null);
          setIsReady(false);
        });

        player.addListener('player_state_changed', (state: any) => {
          if (!state) return;
          const t = state.track_window?.current_track;
          setSdkState({
            isPlaying: !state.paused,
            positionMs: state.position,
            durationMs: state.duration,
            track: t
              ? {
                  id: t.id,
                  uri: t.uri,
                  name: t.name,
                  artist: t.artists?.[0]?.name ?? '',
                  album: t.album?.name ?? '',
                  albumArt: t.album?.images?.[0]?.url ?? null,
                  durationMs: state.duration,
                }
              : null,
          });
        });

        player.addListener('initialization_error', ({ message }: { message: string }) => {
          fail(message);
        });

        player.addListener('authentication_error', () => {
          fail('Authentication failed — log out and sign in again.');
        });

        player.addListener('account_error', () => {
          fail('Full Spotify Premium is required (not Lite/Mini).');
        });

        player.addListener('playback_error', ({ message }: { message: string }) => {
          setPlayerError(message);
        });

        singletonPlayer = player;
        playerRef.current = player;

        void player.connect().then((ok: boolean) => {
          if (!ok) fail('Could not connect to Spotify player.');
        });

        // If ready never fires, stop hanging forever.
        window.setTimeout(() => {
          if (!settled) fail('Player connection timed out — try selecting a song again.');
        }, 15000);
      });
    })();

    try {
      return await connectPromise;
    } finally {
      connectPromise = null;
    }
  }, [deviceId, resolveToken]);

  const runWithDevice = useCallback(
    async (job: PlayJob) => {
      const id = await ensurePlayer();
      if (id) {
        await job(id);
        return;
      }
      pendingPlayRef.current = job;
    },
    [ensurePlayer]
  );

  const activatePlayback = useCallback(async () => {
    // Unlock the audio element synchronously inside the user gesture FIRST.
    // iOS/Safari (and Chrome autoplay rules) require activateElement() to run
    // within the click; awaiting a network connect beforehand loses the gesture
    // and playback silently reverts to pause after transfer.
    const existing = playerRef.current ?? singletonPlayer;
    if (existing?.activateElement) {
      try {
        await existing.activateElement();
      } catch {
        /* ignore — best effort */
      }
    }
    await ensurePlayer();
  }, [ensurePlayer]);

  const setPlayerVolume = useCallback((volumePct: number) => {
    const player = playerRef.current ?? singletonPlayer;
    if (player?.setVolume) {
      player.setVolume(Math.max(0, Math.min(1, volumePct / 100)));
    }
  }, []);

  /** Reads the SDK's actual software volume (0–100), or null if unavailable. */
  const getDeviceVolume = useCallback(async (): Promise<number | null> => {
    const player = playerRef.current ?? singletonPlayer;
    if (!player?.getVolume) return null;
    try {
      const v = await player.getVolume();
      return typeof v === 'number' ? Math.round(v * 100) : null;
    } catch {
      return null;
    }
  }, []);

  // Connect the player as soon as we have a token so the device is registered
  // and `activateElement()` can run within the first play gesture (see above).
  useEffect(() => {
    if (accessToken && !deviceId) {
      void ensurePlayer();
    }
  }, [accessToken, deviceId, ensurePlayer]);

  useEffect(() => {
    if (!accessToken) {
      pendingPlayRef.current = null;
      destroyPlayer();
      playerRef.current = null;
      setDeviceId(null);
      setIsReady(false);
      setPlayerError(null);
    }
  }, [accessToken]);

  return {
    deviceId,
    isReady,
    playerError,
    sdkState,
    activatePlayback,
    runWithDevice,
    ensurePlayer,
    setPlayerVolume,
    getDeviceVolume,
    volumeControllable: !isVolumeHardwareLocked,
  };
}
