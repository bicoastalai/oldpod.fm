/**
 * The catalog of music sources OldPod.fm knows about. `ready` providers are
 * selectable today; `planned` ones render in the Sources screen as the roadmap
 * so the multi-source direction is visible while implementations land.
 */
import type { ProviderId, ProviderMeta } from './types';

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'demo',
    label: 'Demo',
    blurb: 'Sample library — no account needed',
    status: 'ready',
    capabilities: {
      needsLogin: false,
      needsPremiumForPlayback: false,
      hasLibrary: true,
      hasSearch: true,
      canSeek: true,
    },
  },
  {
    id: 'spotify',
    label: 'Spotify',
    blurb: 'Your library — Premium required for playback',
    status: 'ready',
    capabilities: {
      needsLogin: true,
      needsPremiumForPlayback: true,
      hasLibrary: true,
      hasSearch: true,
      canSeek: true,
    },
  },
  {
    id: 'audius',
    label: 'Audius',
    blurb: 'Free & open — no login (coming soon)',
    status: 'planned',
    capabilities: {
      needsLogin: false,
      needsPremiumForPlayback: false,
      hasLibrary: false,
      hasSearch: true,
      canSeek: true,
    },
  },
  {
    id: 'youtube',
    label: 'YouTube',
    blurb: 'Huge free catalog — no login (coming soon)',
    status: 'planned',
    capabilities: {
      needsLogin: false,
      needsPremiumForPlayback: false,
      hasLibrary: false,
      hasSearch: true,
      canSeek: true,
    },
  },
  {
    id: 'radio',
    label: 'Radio',
    blurb: 'Live stations worldwide (coming soon)',
    status: 'planned',
    capabilities: {
      needsLogin: false,
      needsPremiumForPlayback: false,
      hasLibrary: false,
      hasSearch: true,
      canSeek: false,
    },
  },
];

export function getProviderMeta(id: ProviderId): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
