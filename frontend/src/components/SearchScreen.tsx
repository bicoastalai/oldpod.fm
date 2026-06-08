import React, { useRef } from 'react';

/**
 * Ordered set of "keys" the click wheel scrolls through to compose a query.
 * The three trailing entries are special actions handled by the caller.
 */
export const SEARCH_KEYS: string[] = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ...'0123456789'.split(''),
  'SPACE',
  'DEL',
  'GO',
];

const KEY_GLYPH: Record<string, string> = {
  SPACE: '␣',
  DEL: '⌫',
  GO: 'GO',
};

interface Props {
  query: string;
  selectedIndex: number;
  onKeyClick: (index: number) => void;
  onQueryChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

const SearchScreen: React.FC<Props> = ({
  query,
  selectedIndex,
  onKeyClick,
  onQueryChange,
  onSubmit,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="search-screen">
      {/* Native text field — tap to use the phone keyboard */}
      <form
        className="search-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          // Read straight from the field to avoid a stale controlled-value race.
          onSubmit(inputRef.current?.value ?? query);
        }}
      >
        <span className="search-input-icon" aria-hidden>🔍</span>
        <input
          ref={inputRef}
          className="search-input"
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search songs, artists…"
          aria-label="Search music"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
        />
      </form>

      <div className="search-keys-hint">or spin the wheel</div>

      {/* Click-wheel keypad (kept for the retro flow) */}
      <div className="search-keys">
        {SEARCH_KEYS.map((key, i) => (
          <button
            key={key}
            className={`search-key${i === selectedIndex ? ' selected' : ''}${
              key.length > 1 ? ' search-key-wide' : ''
            }`}
            onClick={() => onKeyClick(i)}
          >
            {KEY_GLYPH[key] ?? key}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SearchScreen;
