import React from 'react';

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
}

const SearchScreen: React.FC<Props> = ({ query, selectedIndex, onKeyClick }) => {
  return (
    <div className="search-screen">
      <div className="search-query">
        <span className="search-query-text">{query || 'Type a search…'}</span>
        <span className="search-caret">|</span>
      </div>
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
