import type { Track } from './spotify';

const LRCLIB = 'https://lrclib.net/api';
const USER_AGENT = 'OldPod.fm/1.0 (https://github.com/bicoastalai/oldpod.fm)';

export interface LyricsLine {
  timeMs: number | null;
  text: string;
}

export interface TrackLyrics {
  instrumental: boolean;
  synced: boolean;
  lines: LyricsLine[];
}

/** Parse LRC synced lyrics into timed lines. */
export function parseLrc(lrc: string): LyricsLine[] {
  const lines: LyricsLine[] = [];
  for (const raw of lrc.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^\[(\d+):(\d+)\.(\d+)\]\s*(.*)$/);
    if (!match) continue;
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const centis = parseInt(match[3].padEnd(2, '0').slice(0, 2), 10);
    const text = match[4].trim();
    if (!text) continue;
    lines.push({ timeMs: (minutes * 60 + seconds) * 1000 + centis * 10, text });
  }
  return lines.sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0));
}

function parsePlainLyrics(text: string): LyricsLine[] {
  return text
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((line) => ({ timeMs: null, text: line }));
}

function activeLineIndex(lines: LyricsLine[], positionMs: number): number {
  if (lines.length === 0) return 0;
  if (lines[0].timeMs == null) return 0;
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i].timeMs ?? 0) <= positionMs) idx = i;
    else break;
  }
  return idx;
}

export function getLyricsHighlightIndex(
  lines: LyricsLine[],
  positionMs: number,
  scrollIndex: number,
  userScrolled: boolean
): number {
  if (!userScrolled && lines.some((l) => l.timeMs != null)) {
    return activeLineIndex(lines, positionMs);
  }
  return scrollIndex;
}

// Demo lyrics for a few well-known mock tracks.
const MOCK_LYRICS: Record<string, TrackLyrics> = {
  'Bohemian Rhapsody|Queen': {
    instrumental: false,
    synced: true,
    lines: parseLrc(`[00:00.00] Is this the real life?
[00:08.00] Is this just fantasy?
[00:16.00] Caught in a landslide
[00:20.00] No escape from reality
[00:28.00] Open your eyes
[00:32.00] Look up to the skies and see`),
  },
  'Billie Jean|Michael Jackson': {
    instrumental: false,
    synced: false,
    lines: parsePlainLyrics(
      "She was more like a beauty queen from a movie scene\n" +
        "Well I said don't mind, but what do you mean\n" +
        "I am the one who will dance on the floor in the round\n" +
        "People always told me be careful of what you do"
    ),
  },
};

async function queryLrcLib(track: Track, cached: boolean): Promise<TrackLyrics | null> {
  const durationSec = Math.round(track.durationMs / 1000);
  const params = new URLSearchParams({
    track_name: track.name,
    artist_name: track.artist,
    album_name: track.album,
    duration: String(durationSec),
  });
  const path = cached ? '/get-cached' : '/get';
  const res = await fetch(`${LRCLIB}${path}?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) return null;

  const data = await res.json();
  if (data.instrumental) {
    return { instrumental: true, synced: false, lines: [] };
  }

  if (data.syncedLyrics) {
    const lines = parseLrc(data.syncedLyrics);
    if (lines.length > 0) return { instrumental: false, synced: true, lines };
  }

  if (data.plainLyrics) {
    const lines = parsePlainLyrics(data.plainLyrics);
    if (lines.length > 0) return { instrumental: false, synced: false, lines };
  }

  return null;
}

/**
 * Fetches lyrics for a track from LRCLib (cached first, then full lookup).
 * Demo tracks use embedded sample lyrics when available.
 */
export async function fetchLyrics(track: Track, isDemoMode: boolean): Promise<TrackLyrics | null> {
  const mockKey = `${track.name}|${track.artist}`;
  if (isDemoMode && MOCK_LYRICS[mockKey]) {
    await new Promise((r) => setTimeout(r, 150));
    return MOCK_LYRICS[mockKey];
  }

  try {
    const cached = await queryLrcLib(track, true);
    if (cached) return cached;
    return await queryLrcLib(track, false);
  } catch {
    return null;
  }
}
