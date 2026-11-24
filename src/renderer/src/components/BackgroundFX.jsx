import React, { useEffect, useRef } from 'react';
import { useApp } from '../lib/store';

export default function BackgroundFX() {
  const { state } = useApp();
  const canvasRef = useRef(null);
  const appearance = state.config?.appearance || {};
  const fxOn = appearance.fx !== false;
  const particlesOn = fxOn && appearance.particles !== false;
  const scanOn = fxOn && appearance.scanlines !== false;
  const gridOn = fxOn && appearance.grid !== false;
  const theme = appearance.theme;

  useEffect(() => {
    if (!particlesOn) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    // GPU/драйвер может не дать контекст — тогда просто рисуем CSS-слои без частиц.
    if (!ctx) return undefined;
    let raf = 0;
    let w = 0;
    let h = 0;
    let particles = [];
    const colors = [];
    let last = 0;

    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      colors[0] = cs.getPropertyValue('--accent').trim() || '#00f0ff';
      colors[1] = cs.getPropertyValue('--accent-2').trim() || '#ff2d95';
      colors[2] = cs.getPropertyValue('--accent-3').trim() || '#8b5cf6';
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(64, Math.max(18, Math.floor((w * h) / 30000)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.24,
        vy: (Math.random() - 0.5) * 0.24,
        r: Math.random() * 1.7 + 0.6,
        c: colors[Math.floor(Math.random() * colors.length)],
        a: Math.random() * 0.45 + 0.12,
        pulse: Math.random() * Math.PI * 2,
      }));
    };

    const draw = (t) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 33) return;
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -12) p.x = w + 12;
        if (p.x > w + 12) p.x = -12;
        if (p.y < -12) p.y = h + 12;
        if (p.y > h + 12) p.y = -12;
      }
      ctx.lineWidth = 0.6;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 132) {
            ctx.strokeStyle = a.c;
            ctx.globalAlpha = (1 - dist / 132) * 0.085;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      for (const p of particles) {
        const alpha = p.a * (0.68 + 0.32 * Math.sin(t / 1400 + p.pulse));
        ctx.beginPath();
        ctx.fillStyle = p.c;
        ctx.globalAlpha = alpha;
        ctx.shadowColor = p.c;
        ctx.shadowBlur = 9;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    };

    readColors();
    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [particlesOn, theme]);

  return (
    <div className="bg" aria-hidden="true">
      <div className="bg-wallpaper" />
      <div className="bg-tint" />
      {gridOn && <div className="bg-grid" />}
      {scanOn && <div className="bg-scan" />}
      {fxOn && <div className="bg-beam" />}
      <canvas ref={canvasRef} className="bg-particles" />
      <div className="bg-vignette" />
    </div>
  );
}
