/**
 * Now Playing share cards.
 *
 * Renders a fixed-resolution 1080×1080 PNG of the current track — album art,
 * title, artist, and OldPod.fm branding — entirely with the Canvas 2D API (no
 * dependencies). The card is the app's organic-growth surface, so the wordmark
 * is part of the composition, not decoration.
 *
 * Cross-origin safety: album art is loaded with `crossOrigin='anonymous'`. The
 * three music CDNs (Spotify i.scdn.co, Apple mzstatic, Audius) send
 * `Access-Control-Allow-Origin: *`, so they draw and export cleanly. A host
 * without CORS (e.g. an arbitrary radio favicon) fails to LOAD under anonymous
 * mode rather than tainting the canvas, so we fall back to the placeholder
 * gradient and export still succeeds. The canvas therefore never taints.
 */
import type { Track } from './providers/types';
import { albumArtPlaceholder } from './spotify';

const SIZE = 1080;

/** Parse a `#rrggbb` string into [r, g, b]. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Scale a color toward black (f<1) or white (f>1), clamped. */
function shade([r, g, b]: [number, number, number], f: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(f <= 1 ? v * f : v + (255 - v) * (f - 1))));
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}

/** Load an image for canvas use; resolves null if it fails or would taint. */
function loadArt(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Round-rect path (older Safari lacks ctx.roundRect). */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Wrap `text` to at most `maxLines`, ellipsizing if anything is dropped. */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  let idx = 0;
  while (idx < words.length && lines.length < maxLines) {
    const word = words[idx];
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
      idx++;
    } else {
      lines.push(line);
      line = '';
    }
  }
  if (line && lines.length < maxLines) lines.push(line);

  // Truncated if words remain unplaced, or the final line itself overflows
  // (e.g. one very long word). Either way, ellipsize the last line to fit.
  const last = lines.length - 1;
  const overflows = last >= 0 && ctx.measureText(lines[last]).width > maxWidth;
  if ((idx < words.length || overflows) && last >= 0) {
    let s = lines[last];
    while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
    lines[last] = `${s.replace(/\s+$/, '')}…`;
  }
  return lines;
}

/**
 * Render the share card and return it as a PNG Blob. Rejects only if the
 * browser cannot produce a blob from the canvas at all.
 */
export async function renderShareCard(track: Track): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  const base = hexToRgb(albumArtPlaceholder(track.album || track.name));
  const sans = '-apple-system, "Segoe UI", Roboto, system-ui, sans-serif';

  // Background: a soft diagonal gradient derived from the album's color, then
  // darkened so light text and the artwork read clearly.
  const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  bg.addColorStop(0, shade(base, 0.55));
  bg.addColorStop(1, shade(base, 0.18));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Top caption.
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `600 30px ${sans}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.save();
  ctx.translate(SIZE / 2, 120);
  // Letter-spaced manually for a clean tracking look.
  const caption = 'NOW PLAYING';
  ctx.font = `700 30px ${sans}`;
  let cx = -(ctx.measureText(caption.replace(/ /g, '  ')).width) / 2;
  for (const ch of caption) {
    ctx.fillText(ch, cx, 0);
    cx += ctx.measureText(ch).width + 8;
  }
  ctx.restore();

  // Album art (or placeholder), centered. Sized to leave room below for a
  // two-line title + artist + footer without collisions.
  const art = await loadArt(track.albumArt);
  const artSize = 560;
  const artX = (SIZE - artSize) / 2;
  const artY = 180;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 24;
  roundRect(ctx, artX, artY, artSize, artSize, 36);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, artX, artY, artSize, artSize, 36);
  ctx.clip();
  if (art) {
    // Cover-fit the source image into the square.
    const scale = Math.max(artSize / art.width, artSize / art.height);
    const dw = art.width * scale;
    const dh = art.height * scale;
    ctx.drawImage(art, artX + (artSize - dw) / 2, artY + (artSize - dh) / 2, dw, dh);
  } else {
    const ph = ctx.createLinearGradient(artX, artY, artX + artSize, artY + artSize);
    ph.addColorStop(0, shade(base, 1.25));
    ph.addColorStop(1, shade(base, 0.7));
    ctx.fillStyle = ph;
    ctx.fillRect(artX, artY, artSize, artSize);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `200px ${sans}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♪', SIZE / 2, artY + artSize / 2 + 10);
  }
  ctx.restore();

  // Track title (up to 2 lines) + artist, positioned from the art's bottom so
  // the artist never overlaps the footer regardless of title length.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.font = `700 56px ${sans}`;
  const titleLines = wrapLines(ctx, track.name, SIZE - 160, 2);
  let ty = artY + artSize + 80;
  for (const ln of titleLines) {
    ctx.fillText(ln, SIZE / 2, ty);
    ty += 62;
  }

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = `400 40px ${sans}`;
  const [artistLine] = wrapLines(ctx, track.artist, SIZE - 160, 1);
  ctx.fillText(artistLine, SIZE / 2, ty - 4);

  // Footer wordmark: "oldpod" white, ".fm" tinted with a lightened album color.
  const footY = SIZE - 60;
  ctx.font = `800 44px ${sans}`;
  const wmA = 'oldpod';
  const wmB = '.fm';
  const wA = ctx.measureText(wmA).width;
  const wB = ctx.measureText(wmB).width;
  const glyph = '♪ ';
  ctx.font = `800 44px ${sans}`;
  const wGlyph = ctx.measureText(glyph).width;
  const total = wGlyph + wA + wB;
  let fx = (SIZE - total) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(glyph, fx, footY);
  fx += wGlyph;
  ctx.fillStyle = '#fff';
  ctx.fillText(wmA, fx, footY);
  fx += wA;
  ctx.fillStyle = shade(base, 1.5);
  ctx.fillText(wmB, fx, footY);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
      'image/png',
    );
  });
}

/** True when the platform can share files via the Web Share API. */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    const probe = new File([new Blob()], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function fileName(track: Track): string {
  const slug = `${track.artist}-${track.name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `oldpod-${slug || 'now-playing'}.png`;
}

/**
 * Share the card via the native sheet when files are supported, otherwise
 * trigger a download. MUST be called from within a user-gesture handler with an
 * already-rendered blob so Safari keeps the gesture for Web Share.
 */
export async function shareCard(blob: Blob, track: Track): Promise<'shared' | 'downloaded'> {
  const name = fileName(track);
  if (canShareFiles()) {
    const file = new File([blob], name, { type: 'image/png' });
    try {
      await navigator.share({
        files: [file],
        title: 'OldPod.fm',
        text: `${track.name} — ${track.artist}`,
      });
      return 'shared';
    } catch (err) {
      // User-cancelled share is not an error worth surfacing.
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
      // Fall through to download on any other share failure.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
