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
    blurb: 'Built-in sample tracks',
    status: 'ready',
    capabilities: {
      needsLogin: false,
      needsPremiumForPlayback: false,
      hasLibrary: true,
      hasArtists: true,
      hasArtistTopTracks: true,
      hasSearch: true,
      canSeek: true,
    },
  },
  {
    id: 'spotify',
    label: 'Spotify',
    blurb: 'Your playlists, albums & artists',
    status: 'ready',
    capabilities: {
      needsLogin: true,
      needsPremiumForPlayback: true,
      hasLibrary: true,
      hasArtists: true,
      // Spotify removed GET /artists/{id}/top-tracks for Development Mode apps
      // (Feb 2026 migration). The artist list still loads, but top tracks 403s.
      hasArtistTopTracks: false,
      hasSearch: true,
      canSeek: true,
    },
  },
  {
    id: 'audius',
    label: 'Audius',
    blurb: 'Open indie catalog, real audio',
    status: 'ready',
    capabilities: {
      needsLogin: false,
      needsPremiumForPlayback: false,
      hasLibrary: false,
      hasArtists: false,
      hasArtistTopTracks: false,
      hasSearch: true,
      canSeek: true,
    },
  },
  {
    id: 'youtube',
    label: 'YouTube',
    blurb: 'Big catalog (coming soon)',
    status: 'planned',
    capabilities: {
      needsLogin: false,
      needsPremiumForPlayback: false,
      hasLibrary: false,
      hasArtists: false,
      hasArtistTopTracks: false,
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
      hasArtists: false,
      hasArtistTopTracks: false,
      hasSearch: true,
      canSeek: false,
    },
  },
];

export function getProviderMeta(id: ProviderId): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
