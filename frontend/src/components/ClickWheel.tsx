import React, { useRef } from 'react';

interface Props {
  onScroll: (direction: 'up' | 'down') => void;
  onClick: (button: 'menu' | 'next' | 'previous' | 'playPause' | 'select') => void;
}

const ClickWheel: React.FC<Props> = ({ onScroll, onClick }) => {
  const touchStartAngle = useRef<number | null>(null);

  const calculateAngle = (x: number, y: number) => {
    const radians = Math.atan2(y, x);
    const degrees = (radians * 180) / Math.PI;
    return (degrees + 360) % 360;
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.touches[0].clientX - (rect.left + rect.width / 2);
    const y = event.touches[0].clientY - (rect.top + rect.height / 2);
    touchStartAngle.current = calculateAngle(x, y);
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.touches[0].clientX - (rect.left + rect.width / 2);
    const y = event.touches[0].clientY - (rect.top + rect.height / 2);

    if (touchStartAngle.current !== null) {
      const currentAngle = calculateAngle(x, y);
      const diff = currentAngle - touchStartAngle.current;

      if (Math.abs(diff) > 30) {
        onScroll(diff > 0 ? 'down' : 'up');
        touchStartAngle.current = currentAngle;
      }
    }
  };

  const handleClick = (button: 'menu' | 'next' | 'previous' | 'playPause' | 'select') => {
    onClick(button);
  };

  return (
    <div
      className="w-56 h-56 bg-gray-300 rounded-full relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <button
        className="absolute top-4 left-1/2 transform -translate-x-1/2"
        onClick={() => handleClick('menu')}
      >
        Menu
      </button>
      <button
        className="absolute bottom-4 left-1/2 transform -translate-x-1/2"
        onClick={() => handleClick('playPause')}
      >
        Play/Pause
      </button>
      <button
        className="absolute left-4 top-1/2 transform -translate-y-1/2"
        onClick={() => handleClick('previous')}
      >
        Previous
      </button>
      <button
        className="absolute right-4 top-1/2 transform -translate-y-1/2"
        onClick={() => handleClick('next')}
      >
        Next
      </button>
      <button
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-500 w-16 h-16 rounded-full"
        onClick={() => handleClick('select')}
      >
        Select
      </button>
    </div>
  );
};

export default ClickWheel;