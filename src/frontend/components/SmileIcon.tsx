import React from 'react';

interface Props {
  size?: number;
  color?: string;
}

const SmileIcon: React.FC<Props> = ({ size = 24, color = '#ffd230' }) => (
  <svg viewBox="-72 -75 144 150" width={size} height={size} fill="none">
    <polygon
      points="0,-70 60.6,-35 60.6,35 0,70 -60.6,35 -60.6,-35"
      stroke={color} strokeWidth="4.5" strokeLinejoin="round"
    />
    <circle cx="-18" cy="-18" r="5.5" fill={color} />
    <circle cx="18" cy="-18" r="5.5" fill={color} />
    <path
      d="M -28 5 Q -14 30 0 34 Q 14 30 28 5"
      stroke={color} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

export default SmileIcon;
