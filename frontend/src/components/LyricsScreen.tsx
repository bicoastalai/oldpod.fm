import React, { useEffect, useMemo, useRef } from 'react';
import type { TrackLyrics } from '../services/lyrics';
import { getLyricsHighlightIndex } from '../services/lyrics';

interface Props {
  lyrics: TrackLyrics | null;
  loading: boolean;
  positionMs: number;
  selectedIndex: number;
  userScrolled: boolean;
}

function visibleLines<T>(items: T[], selectedIdx: number, windowSize = 5): [T[], number] {
  const half = Math.floor(windowSize / 2);
  let start = Math.max(0, selectedIdx - half);
  const end = Math.min(items.length, start + windowSize);
  start = Math.max(0, end - windowSize);
  return [items.slice(start, end), selectedIdx - start];
}

const LyricsScreen: React.FC<Props> = ({
  lyrics,
  loading,
  positionMs,
  selectedIndex,
  userScrolled,
}) => {
  const listRef = useRef<HTMLUListElement>(null);

  const highlightIdx = useMemo(() => {
    if (!lyrics?.lines.length) return 0;
    return getLyricsHighlightIndex(
      lyrics.lines,
      positionMs,
      selectedIndex,
      userScrolled
    );
  }, [lyrics, positionMs, selectedIndex, userScrolled]);

  const [visible, localHighlight] = useMemo(() => {
    if (!lyrics?.lines.length) return [[], 0] as const;
    return visibleLines(lyrics.lines, highlightIdx, 5);
  }, [lyrics, highlightIdx]);

  const startOffset = highlightIdx - localHighlight;

  useEffect(() => {
    const el = listRef.current?.querySelector('.lyrics-line.active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx]);

  if (loading) {
    return (
      <div className="lyrics-screen lyrics-screen--center">
        <div className="loading-dots">
          <div className="loading-dot" />
          <div className="loading-dot" />
          <div className="loading-dot" />
        </div>
      </div>
    );
  }

  if (!lyrics) {
    return (
      <div className="lyrics-screen lyrics-screen--center">
        <span className="lyrics-empty">Lyrics not available</span>
      </div>
    );
  }

  if (lyrics.instrumental) {
    return (
      <div className="lyrics-screen lyrics-screen--center">
        <span className="lyrics-empty">Instrumental</span>
      </div>
    );
  }

  if (lyrics.lines.length === 0) {
    return (
      <div className="lyrics-screen lyrics-screen--center">
        <span className="lyrics-empty">Lyrics not available</span>
      </div>
    );
  }

  return (
    <ul ref={listRef} className="lyrics-screen lyrics-list">
      {visible.map((line, i) => {
        const globalIdx = startOffset + i;
        const isActive = globalIdx === highlightIdx;
        return (
          <li
            key={globalIdx}
            className={`lyrics-line${isActive ? ' active' : ''}`}
          >
            {line.text}
          </li>
        );
      })}
    </ul>
  );
};

export default LyricsScreen;
