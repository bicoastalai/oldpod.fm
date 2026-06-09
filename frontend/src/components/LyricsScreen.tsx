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

const LyricsScreen: React.FC<Props> = ({
  lyrics,
  loading,
  positionMs,
  selectedIndex,
  userScrolled,
}) => {
  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);
  // -1 means "haven't scrolled for this lyric set yet" → first move jumps,
  // later moves glide, so the active line visibly follows the music.
  const lastScrolledIdx = useRef(-1);

  const lines = lyrics?.lines ?? [];

  // Derive the active line from playback position (synced) or the user's wheel
  // selection (plain lyrics / manual scroll). Cheap: a single pass over lines.
  const activeIdx = useMemo(() => {
    if (lines.length === 0) return 0;
    return getLyricsHighlightIndex(lines, positionMs, selectedIndex, userScrolled);
  }, [lines, positionMs, selectedIndex, userScrolled]);

  // Build the list only when the lines or the active line change — not on every
  // position tick — so a rapidly-updating positionMs doesn't re-render the list.
  const items = useMemo(
    () =>
      lines.map((line, i) => (
        <li
          key={i}
          ref={(el) => {
            lineRefs.current[i] = el;
          }}
          className={`lyrics-line${i === activeIdx ? ' active' : ''}`}
        >
          {line.text}
        </li>
      )),
    [lines, activeIdx]
  );

  // New lyric set (new track): reset the scroll baseline so the next scroll jumps.
  useEffect(() => {
    lastScrolledIdx.current = -1;
  }, [lyrics]);

  // Keep the active line centered, gliding as it advances with the music.
  useEffect(() => {
    if (lines.length === 0) return;
    const el = lineRefs.current[activeIdx];
    if (!el) return;
    const behavior: ScrollBehavior = lastScrolledIdx.current === -1 ? 'auto' : 'smooth';
    el.scrollIntoView({ block: 'center', behavior });
    lastScrolledIdx.current = activeIdx;
  }, [activeIdx, lines.length]);

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

  if (lines.length === 0) {
    return (
      <div className="lyrics-screen lyrics-screen--center">
        <span className="lyrics-empty">Lyrics not available</span>
      </div>
    );
  }

  return (
    <ul className="lyrics-screen lyrics-list" aria-label="Lyrics">
      {items}
    </ul>
  );
};

export default LyricsScreen;
