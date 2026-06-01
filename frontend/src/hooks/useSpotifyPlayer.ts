import { useEffect, useRef, useState } from 'react';
import type { Track } from '../services/spotify';

export interface SDKPlayerState {
  isPlaying: boolean;
  track: Track | null;
  positionMs: number;
  durationMs: number;
}

export function useSpotifyPlayer(accessToken: string | null) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [sdkState, setSdkState] = useState<SDKPlayerState | null>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    if (!accessToken) return;

    const init = () => {
      const Spotify = (window as any).Spotify;
      if (!Spotify) return;

      const player = new Spotify.Player({
        name: 'OldPod.fm',
        getOAuthToken: (cb: (t: string) => void) => cb(accessToken),
        volume: 0.8,
      });

      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        setDeviceId(device_id);
      });

      player.addListener('not_ready', () => {
        setDeviceId(null);
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

      player.connect();
      playerRef.current = player;
    };

    if ((window as any).Spotify) {
      init();
    } else {
      (window as any).onSpotifyWebPlaybackSDKReady = init;
    }

    return () => {
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [accessToken]);

  return { deviceId, sdkState };
}
