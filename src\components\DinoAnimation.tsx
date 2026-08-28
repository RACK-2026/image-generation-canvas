// Chrome dino-style waiting animation for pipeline progress
// Inspired by chrome://dino

import { useEffect, useState } from 'react';

interface DinoAnimationProps {
  isRunning: boolean;
  currentStep?: string; // e.g. "视觉分析", "方案规划"
}

// Pixel art dino frames (simplified SVG paths)
function DinoRunner({ frame }: { frame: number }) {
  // Two-frame running animation
  const legOffset = frame % 2 === 0 ? 0 : 2;
  
  return (
    <svg width="88" height="100" viewBox="0 0 88 100" className="text-text-primary">
      {/* Body */}
      <rect x="28" y="20" width="32" height="40" fill="currentColor" rx="2" />
      {/* Head */}
      <rect x="48" y="4" width="28" height="24" fill="currentColor" rx="2" />
      {/* Eye */}
      <rect x="66" y="10" width="4" height="4" fill="white" />
      {/* Mouth */}
      <rect x="72" y="20" width="8" height="2" fill="currentColor" />
      {/* Arms */}
      <rect x="52" y="36" width="12" height="4" fill="currentColor" />
      <rect x="60" y="40" width="4" height="6" fill="currentColor" />
      {/* Tail */}
      <rect x="12" y="24" width="20" height="8" fill="currentColor" rx="2" />
      <rect x="4" y="20" width="12" height="8" fill="currentColor" rx="2" />
      {/* Legs - animated */}
      <rect x="34" y="60" width="6" height={16 + legOffset} fill="currentColor" />
      <rect x="48" y="60" width="6" height={16 - legOffset + 2} fill="currentColor" />
      {/* Feet */}
      <rect x="34" y={76 + legOffset} width="10" height="4" fill="currentColor" />
      <rect x="48" y={76 - legOffset + 2} width="10" height="4" fill="currentColor" />
    </svg>
  );
}

// Ground with cacti
function Ground({ offset }: { offset: number }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 h-6 overflow-hidden">
      <svg width="100%" height="24" className="text-border-primary">
        {/* Ground line */}
        <line x1="0" y1="20" x2="100%" y2="20" stroke="currentColor" strokeWidth="1" strokeDasharray="4,2" />
        {/* Cacti - repeating pattern */}
        {[0, 1, 2, 3, 4].map(i => {
          const x = ((i * 200 + offset * 0.5) % 1000) - 50;
          return (
            <g key={i} transform={`translate(${x}, 0)`}>
              {i % 2 === 0 && (
                <>
                  <rect x="0" y="4" width="6" height="16" fill="currentColor" opacity="0.4" />
                  <rect x="-4" y="8" width="4" height="6" fill="currentColor" opacity="0.4" />
                  <rect x="6" y="6" width="4" height="4" fill="currentColor" opacity="0.4" />
                </>
              )}
              {i % 3 === 0 && (
                <>
                  <rect x="80" y="8" width="4" height="12" fill="currentColor" opacity="0.3" />
                  <rect x="76" y="10" width="4" height="4" fill="currentColor" opacity="0.3" />
                </>
              )}
            </g>
          );
        })}
        {/* Clouds */}
        {[0, 1, 2].map(i => {
          const x = ((i * 300 + offset * 0.2) % 900) - 50;
          return (
            <g key={`c${i}`} transform={`translate(${x}, ${2 + i * 2})`} opacity="0.15">
              <rect x="0" y="4" width="30" height="6" fill="currentColor" rx="3" />
              <rect x="6" y="0" width="18" height="6" fill="currentColor" rx="3" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DinoAnimation({ isRunning, currentStep }: DinoAnimationProps) {
  const [frame, setFrame] = useState(0);
  const [groundOffset, setGroundOffset] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!isRunning) return;
    
    const interval = setInterval(() => {
      setFrame(f => f + 1);
      setGroundOffset(g => g + 3);
    }, 150);

    return () => clearInterval(interval);
  }, [isRunning]);

  // Animated dots
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);
    return () => clearInterval(interval);
  }, [isRunning]);

  if (!isRunning) return null;

  return (
    <div className="relative w-full h-28 flex flex-col items-center justify-center overflow-hidden rounded-lg bg-bg-tertiary/30 border border-border-primary/50">
      {/* Dino running */}
      <div className="flex items-end gap-4 mb-2">
        <div className="animate-bounce" style={{ animationDuration: '0.4s' }}>
          <DinoRunner frame={frame} />
        </div>
        
        {/* Status text */}
        <div className="flex flex-col items-start pb-4">
          <span className="text-xs font-mono font-bold text-text-primary tracking-wide">
            {currentStep || '处理中'}{dots}
          </span>
          <span className="text-[10px] text-text-muted font-mono mt-0.5">
            请稍候，AI 正在工作中
          </span>
        </div>
      </div>

      {/* Ground with obstacles */}
      <Ground offset={groundOffset} />

      {/* Score-like timer */}
      <div className="absolute top-2 right-3 font-mono text-[10px] text-text-muted">
        HI: {String(Math.floor(frame / 6)).padStart(5, '0')}
      </div>
    </div>
  );
}

