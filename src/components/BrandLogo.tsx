import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showBadge?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showBadge = true,
  className = ''
}) => {
  const isSmall = size === 'sm';
  const isLarge = size === 'lg';

  const iconDim = isSmall ? 'w-6 h-6' : isLarge ? 'w-10 h-10' : 'w-8 h-8';
  const textClass = isSmall
    ? 'text-base font-bold tracking-wider'
    : isLarge
    ? 'text-2xl font-extrabold tracking-widest'
    : 'text-lg font-bold tracking-wider';

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Original Darkano Geometric Core Glyph */}
      <div className={`relative ${iconDim} flex items-center justify-center`}>
        {/* Ambient glow behind glyph */}
        <div className="absolute inset-0 bg-rose-600/25 rounded-lg blur-md" />
        
        {/* Geometric Hex-Chamber Frame */}
        <div className="relative w-full h-full bg-[#120308] border border-rose-500/35 rounded-lg flex items-center justify-center overflow-hidden shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]">
          {/* Internal diagonal architectural lines */}
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/20 via-transparent to-black" />
          
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-4/5 h-4/5 text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Darkano D & Chevron Hybrid Glyph */}
            <path d="M5 4h8a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5H5V4z" fill="currentColor" fillOpacity="0.15" />
            <path d="M5 4h7a5 5 0 0 1 5 5 5 5 0 0 1-5 5H5" />
            <path d="M12 14l5 6" />
            <circle cx="12" cy="9" r="1.5" fill="#f43f5e" />
          </svg>
        </div>
      </div>

      {/* Wordmark Typography */}
      <div className="flex items-center gap-1.5">
        <span className={`text-white uppercase font-black font-mono ${textClass} tracking-wider bg-gradient-to-r from-white via-rose-100 to-rose-300/80 bg-clip-text text-transparent`}>
          DARKANO
        </span>
        {showBadge && (
          <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold tracking-wider uppercase text-rose-300 bg-rose-950/60 border border-rose-500/35 rounded shadow-[0_0_10px_rgba(244,63,94,0.2)]">
            AI
          </span>
        )}
      </div>
    </div>
  );
};
