import React, { useEffect, useRef } from 'react';

interface Props {
  onScroll: (direction: 'up' | 'down') => void;
  onClick: (button: 'menu' | 'next' | 'previous' | 'playPause' | 'select' | 'home') => void;
}

// How long MENU must be held to jump to the home menu (classic iPod gesture).
const MENU_HOLD_MS = 500;

const ClickWheel: React.FC<Props> = ({ onScroll, onClick }) => {
  const wheelRef = useRef<HTMLDivElement>(null);

  // MENU long-press → 'home'. A short press still fires 'menu' (back); the hold
  // timer fires 'home' and flags the press so the trailing click is swallowed.
  const menuHoldTimer = useRef<number | null>(null);
  const menuHeld = useRef(false);
  const startMenuHold = () => {
    menuHeld.current = false;
    menuHoldTimer.current = window.setTimeout(() => {
      menuHeld.current = true;
      menuHoldTimer.current = null;
      onClickRef.current('home');
    }, MENU_HOLD_MS);
  };
  const cancelMenuHold = () => {
    if (menuHoldTimer.current !== null) {
      clearTimeout(menuHoldTimer.current);
      menuHoldTimer.current = null;
    }
  };
  const onMenuClick = () => {
    if (menuHeld.current) {
      menuHeld.current = false; // hold already handled it
      return;
    }
    onClickRef.current('menu');
  };

  // Keep the latest callbacks in refs so the long-lived pointer listeners never
  // capture a stale closure and never need to be torn down / re-added.
  const onScrollRef = useRef(onScroll);
  const onClickRef = useRef(onClick);
  useEffect(() => {
    onScrollRef.current = onScroll;
    onClickRef.current = onClick;
  });

  useEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel) return;

    let lastAngle: number | null = null;
    let activePointer: number | null = null;
    // Accumulate small movements so slow drags still register a step.
    let residual = 0;
    const STEP_DEG = 18;

    const angleAt = (clientX: number, clientY: number) => {
      const rect = wheel.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const deg = (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
      return (deg + 360) % 360;
    };

    const radiusAt = (clientX: number, clientY: number) => {
      const rect = wheel.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      // Normalise against the rendered radius (handles CSS scaling on mobile).
      return Math.sqrt(dx * dx + dy * dy) / (rect.width / 2);
    };

    const normDiff = (a: number, b: number) => {
      let d = a - b;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      return d;
    };

    const onPointerDown = (e: PointerEvent) => {
      // Only the ring background starts a scroll. Presses on a wheel button
      // (MENU/play/prev/next/center) must fall through to their click handlers.
      if (e.target !== wheel) return;
      // Belt-and-suspenders: ignore the very center of the ring.
      if (radiusAt(e.clientX, e.clientY) < 0.36) return;
      activePointer = e.pointerId;
      lastAngle = angleAt(e.clientX, e.clientY);
      residual = 0;
      try {
        wheel.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (activePointer !== e.pointerId || lastAngle === null) return;
      const cur = angleAt(e.clientX, e.clientY);
      residual += normDiff(cur, lastAngle);
      lastAngle = cur;
      while (Math.abs(residual) >= STEP_DEG) {
        const dir = residual > 0 ? 'down' : 'up';
        residual -= residual > 0 ? STEP_DEG : -STEP_DEG;
        onScrollRef.current(dir);
      }
    };

    const endPointer = (e: PointerEvent) => {
      if (activePointer !== e.pointerId) return;
      activePointer = null;
      lastAngle = null;
      residual = 0;
      try {
        wheel.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    wheel.addEventListener('pointerdown', onPointerDown);
    wheel.addEventListener('pointermove', onPointerMove);
    wheel.addEventListener('pointerup', endPointer);
    wheel.addEventListener('pointercancel', endPointer);
    return () => {
      wheel.removeEventListener('pointerdown', onPointerDown);
      wheel.removeEventListener('pointermove', onPointerMove);
      wheel.removeEventListener('pointerup', endPointer);
      wheel.removeEventListener('pointercancel', endPointer);
    };
  }, []);

  return (
    <div className="click-wheel-wrap">
      <div ref={wheelRef} className="click-wheel">
        <button
          className="wheel-btn wheel-btn-menu"
          title="Tap: back · Hold: home"
          onPointerDown={startMenuHold}
          onPointerUp={cancelMenuHold}
          onPointerLeave={cancelMenuHold}
          onPointerCancel={cancelMenuHold}
          onClick={onMenuClick}
        >
          MENU
        </button>

        <button
          className="wheel-btn wheel-btn-play"
          onClick={() => onClickRef.current('playPause')}
        >
          ▶⏸
        </button>

        <button
          className="wheel-btn wheel-btn-prev"
          onClick={() => onClickRef.current('previous')}
        >
          ⏮
        </button>

        <button
          className="wheel-btn wheel-btn-next"
          onClick={() => onClickRef.current('next')}
        >
          ⏭
        </button>

        <button className="center-btn" onClick={() => onClickRef.current('select')} />
      </div>
    </div>
  );
};

export default ClickWheel;
