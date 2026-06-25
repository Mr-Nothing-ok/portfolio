import React, { useEffect, useRef, useMemo } from 'react';

// ==========================================
// Floating Particles — lightweight canvas-based
// ==========================================
export function FloatingParticles({ count = 60, color = '#8b5ad5', speed = 0.3, sizeRange = [1, 4], connectDistance = 120, className = '' }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w = (canvas.width = canvas.offsetWidth * window.devicePixelRatio);
    let h = (canvas.height = canvas.offsetHeight * window.devicePixelRatio);
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * (w / window.devicePixelRatio),
      y: Math.random() * (h / window.devicePixelRatio),
      vx: (Math.random() - 0.5) * speed,
      vy: (Math.random() - 0.5) * speed,
      r: sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]),
      alpha: 0.15 + Math.random() * 0.45,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, w / window.devicePixelRatio, h / window.devicePixelRatio);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w / window.devicePixelRatio;
        if (p.x > w / window.devicePixelRatio) p.x = 0;
        if (p.y < 0) p.y = h / window.devicePixelRatio;
        if (p.y > h / window.devicePixelRatio) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = color.replace(')', `,${p.alpha})`).replace('rgb', 'rgba').replace('#', '');
        // Handle hex color
        if (color.startsWith('#')) {
          const r = parseInt(color.slice(1, 3), 16);
          const g = parseInt(color.slice(3, 5), 16);
          const b = parseInt(color.slice(5, 7), 16);
          ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha})`;
        }
        ctx.fill();

        // Connect nearby particles
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectDistance) {
            const lineAlpha = (1 - dist / connectDistance) * 0.15;
            if (color.startsWith('#')) {
              const r = parseInt(color.slice(1, 3), 16);
              const g = parseInt(color.slice(3, 5), 16);
              const b = parseInt(color.slice(5, 7), 16);
              ctx.strokeStyle = `rgba(${r},${g},${b},${lineAlpha})`;
            }
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }
      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    const handleResize = () => {
      w = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      h = canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [count, color, speed, sizeRange, connectDistance]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ width: '100%', height: '100%' }}
    />
  );
}

// ==========================================
// Aurora Gradient Background — flowing color bands
// ==========================================
export function AuroraBackground({ colors = ['#8b5ad5', '#00ff41', '#ec4899', '#06b6d4'], className = '' }) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 20% 40%, ${colors[0]}88 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 20%, ${colors[1]}66 0%, transparent 55%),
            radial-gradient(ellipse 70% 50% at 50% 80%, ${colors[2]}55 0%, transparent 60%),
            radial-gradient(ellipse 50% 35% at 70% 60%, ${colors[3]}44 0%, transparent 50%)
          `,
          animation: 'auroraShift 15s ease-in-out infinite alternate',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.08] blur-3xl"
        style={{
          background: `
            radial-gradient(ellipse 90% 60% at 30% 50%, ${colors[0]} 0%, transparent 50%),
            radial-gradient(ellipse 80% 50% at 70% 30%, ${colors[1]} 0%, transparent 45%)
          `,
          animation: 'auroraShift 20s ease-in-out infinite alternate-reverse',
        }}
      />
    </div>
  );
}

// ==========================================
// Morphing Gradient Orbs — animated CSS blobs
// ==========================================
export function GradientOrbs({ className = '' }) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="orb orb-4" />
    </div>
  );
}

// ==========================================
// Starfield Background — twinkling stars
// ==========================================
export function Starfield({ count = 150, className = '' }) {
  const stars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 0.5 + Math.random() * 2,
        delay: Math.random() * 4,
        duration: 2 + Math.random() * 3,
      })),
    [count]
  );

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            animation: `twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ==========================================
// Neon Grid Floor — perspective grid lines
// ==========================================
export function NeonGrid({ color = '#8b5ad5', className = '' }) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} style={{ perspective: '600px' }}>
      <div
        className="absolute w-[200%] h-[200%] left-[-50%] top-[30%] opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(${color}33 1px, transparent 1px),
            linear-gradient(90deg, ${color}33 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          transform: 'rotateX(65deg)',
          animation: 'gridScroll 8s linear infinite',
        }}
      />
    </div>
  );
}

// ==========================================
// Holographic Shimmer — rainbow light sweep
// ==========================================
export function HolographicShimmer({ className = '' }) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 45%, rgba(139,90,213,0.2) 50%, rgba(0,255,65,0.15) 55%, transparent 60%)',
          backgroundSize: '200% 100%',
          animation: 'holographicSweep 6s ease-in-out infinite',
        }}
      />
    </div>
  );
}
