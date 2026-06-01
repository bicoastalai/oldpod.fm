import React, { useEffect, useRef } from 'react';

interface Props {
  onScroll: (direction: 'up' | 'down') => void;
  onClick: (button: 'menu' | 'next' | 'previous' | 'playPause' | 'select') => void;
}

const ClickWheel: React.FC<Props> = ({ onScroll, onClick }) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const touchAngleRef = useRef<number | null>(null);
  const mouseAngleRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const angle = (x: number, y: number) => {
    const deg = (Math.atan2(y, x) * 180) / Math.PI;
    return (deg + 360) % 360;
  };

  const normDiff = (a: number, b: number) => {
    let d = a - b;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  };

  // ── Touch ──────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    touchAngleRef.current = angle(e.touches[0].clientX - cx, e.touches[0].clientY - cy);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchAngleRef.current === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const cur = angle(e.touches[0].clientX - cx, e.touches[0].clientY - cy);
    const diff = normDiff(cur, touchAngleRef.current);
    if (Math.abs(diff) > 20) {
      onScroll(diff > 0 ? 'down' : 'up');
      touchAngleRef.current = cur;
    }
  };

  const handleTouchEnd = () => {
    touchAngleRef.current = null;
  };

  // ── Mouse ──────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = wheelRef.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Only start drag on the ring, not the center button (radius ~36px)
    if (dist > 36) {
      isDraggingRef.current = true;
      mouseAngleRef.current = angle(dx, dy);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || mouseAngleRef.current === null) return;
      const rect = wheelRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const cur = angle(e.clientX - cx, e.clientY - cy);
      const diff = normDiff(cur, mouseAngleRef.current);
      if (Math.abs(diff) > 15) {
        onScroll(diff > 0 ? 'down' : 'up');
        mouseAngleRef.current = cur;
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      mouseAngleRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onScroll]);

  return (
    <div className="click-wheel-wrap">
      <div
        ref={wheelRef}
        className="click-wheel"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        {/* MENU */}
        <button className="wheel-btn wheel-btn-menu" onClick={() => onClick('menu')}>
          MENU
        </button>

        {/* ▶⏸ Play/Pause */}
        <button className="wheel-btn wheel-btn-play" onClick={() => onClick('playPause')}>
          ▶⏸
        </button>

        {/* ◀◀ Previous */}
        <button className="wheel-btn wheel-btn-prev" onClick={() => onClick('previous')}>
          ⏮
        </button>

        {/* ▶▶ Next */}
        <button className="wheel-btn wheel-btn-next" onClick={() => onClick('next')}>
          ⏭
        </button>

        {/* Center select */}
        <button className="center-btn" onClick={() => onClick('select')} />
      </div>
    </div>
  );
};

export default ClickWheel;
