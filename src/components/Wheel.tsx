import { useId } from 'react';
import type { CSSProperties } from 'react';
import { motion } from '../content';

interface WheelProps { active: number; entering: boolean; mobile: boolean }

export function Wheel({ active, entering, mobile }: WheelProps) {
  const id = useId().replaceAll(':', '');
  // The reference is a fixed-angle, fixed-thickness rectangle mask. Only length
  // grows on entry; rotating the mask never rotates the stationary gradient.
  const radius = 846;
  const thickness = mobile ? 32 * radius / 230 : 98;
  return (
    <svg className={`wheel ${entering ? 'is-entering' : ''}`} viewBox="0 0 1692 1692"
      aria-hidden="true" focusable="false" data-angle={Math.min(active, 2) * 30}
      style={{ visibility: active === 3 ? 'hidden' : 'visible' }}>
      <defs>
        <linearGradient id={`${id}-heat`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#ffa462" /><stop offset=".52" stopColor="#fc7946" />
          <stop offset=".77" stopColor="#ef4433" /><stop offset="1" stopColor="#80231b" />
        </linearGradient>
        <clipPath id={`${id}-mask`} clipPathUnits="userSpaceOnUse" className="wheel-rotor"
          style={{ transform: `translate(${radius}px, ${radius}px) rotate(${Math.min(active, 2) * 30}deg)` }}>
              {Array.from({ length: 12 }, (_, index) => (
                <rect key={index} className="ray" transform={`rotate(${90 + index * 30})`}
                  x="0" y={-thickness / 2} width={radius} height={thickness}
                  style={{ '--ray-delay': `${index * motion.rayInterval}ms` } as CSSProperties} />
              ))}
        </clipPath>
      </defs>
      <rect width="1692" height="1692" fill={`url(#${id}-heat)`} clipPath={`url(#${id}-mask)`} />
    </svg>
  );
}
