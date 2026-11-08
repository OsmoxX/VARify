'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { useMounted } from '@/lib/hooks';

/** Piłka odbijająca się od krawędzi okna — port `login.js` (animacja przez rAF, bez re-renderów Reacta). */
export function BouncingBall() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.left = '12%';
      el.style.top = '18%';
      return;
    }
    let x = Math.random() * Math.max(0, window.innerWidth - 60);
    let y = Math.random() * Math.max(0, window.innerHeight - 60);
    let vx = 2.5 + Math.random() * 1.5;
    let vy = 2.0 + Math.random() * 1.5;
    let angle = 0;
    let raf = 0;

    const tick = () => {
      x += vx;
      y += vy;
      angle += 3;
      if (x + 50 >= window.innerWidth || x <= 0) vx *= -1;
      if (y + 50 >= window.innerHeight || y <= 0) vy *= -1;
      el.style.left = `${Math.max(0, Math.min(x, window.innerWidth - 50))}px`;
      el.style.top = `${Math.max(0, Math.min(y, window.innerHeight - 50))}px`;
      el.style.transform = `rotate(${angle}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div ref={ref} className="football" aria-hidden>
      ⚽
    </div>
  );
}

const PARTICLE_COUNT = 30;

/**
 * 30 unoszących się cząsteczek. Wartości wyliczane deterministycznie z indeksu (wyglądają losowo),
 * dzięki czemu HTML z serwera i klienta jest identyczny — bez błędów hydratacji.
 */
export function Particles() {
  const mounted = useMounted();
  if (!mounted) return null;
  return (
    <div className="particles" aria-hidden>
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <div
          key={i}
          className="particle"
          style={
            {
              '--left': `${(i * 37 + 11) % 100}%`,
              '--duration': `${7 + ((i * 53) % 80) / 10}s`,
              animationDelay: `${((i * 29) % 80) / 10}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Lekki przechył karty za kursorem (3D parallax) — na osobnej otoczce, żeby nie kłócić się z animacją `cardIn`. */
export function useCardTilt(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const onMove = (e: MouseEvent) => {
      const xAxis = (window.innerWidth / 2 - e.pageX) / 35;
      const yAxis = (window.innerHeight / 2 - e.pageY) / 35;
      el.style.transition = 'none';
      el.style.transform = `perspective(1000px) rotateY(${xAxis}deg) rotateX(${yAxis}deg)`;
    };
    const onLeave = () => {
      el.style.transition = 'transform 0.5s ease';
      el.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg)';
    };
    document.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [ref]);
}
