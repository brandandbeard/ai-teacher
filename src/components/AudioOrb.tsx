import React, { useEffect, useRef } from 'react';

interface AudioOrbProps {
  status: 'idle' | 'connecting' | 'active' | 'speaking' | 'listening' | 'interrupted';
  userVolume: number;
  aiVolume: number;
  size?: number;
}

export const AudioOrb: React.FC<AudioOrbProps> = ({
  status,
  userVolume,
  aiVolume,
  size = 240,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let phase = 0;

    // Handle high DPI screens
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const render = () => {
      ctx.clearRect(0, 0, size, size);

      const centerX = size / 2;
      const centerY = size / 2;
      const baseRadius = size * 0.28;

      // Energy calculation
      const dynamicAi = Math.min(1, aiVolume * 2.8);
      const dynamicUser = Math.min(1, userVolume * 3.2);
      const combinedEnergy = Math.max(dynamicAi, dynamicUser);

      // Phase progression (always active and alive in all states)
      if (status === 'connecting') {
        phase += 0.08;
      } else if (status === 'speaking' || status === 'listening') {
        phase += 0.045 + combinedEnergy * 0.08;
      } else {
        // Idle breathing motion
        phase += 0.035;
      }

      // 1. Ambient Glow Backdrop
      const glowMultiplier =
        status === 'connecting'
          ? 2.2 + 0.3 * Math.sin(phase * 2)
          : status === 'speaking'
          ? 2.2 + dynamicAi * 0.8
          : status === 'listening'
          ? 2.2 + dynamicUser * 0.8
          : 1.9 + 0.2 * Math.sin(phase * 1.5);

      const glowGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius * 0.2,
        centerX,
        centerY,
        baseRadius * glowMultiplier
      );

      if (status === 'speaking' || dynamicAi > 0.05) {
        glowGrad.addColorStop(0, 'rgba(168, 85, 247, 0.55)');
        glowGrad.addColorStop(0.5, 'rgba(99, 102, 241, 0.3)');
        glowGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      } else if (status === 'listening' || dynamicUser > 0.05) {
        glowGrad.addColorStop(0, 'rgba(20, 184, 166, 0.55)');
        glowGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.3)');
        glowGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      } else if (status === 'connecting') {
        glowGrad.addColorStop(0, 'rgba(245, 158, 11, 0.6)');
        glowGrad.addColorStop(0.5, 'rgba(217, 119, 6, 0.35)');
        glowGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      } else if (status === 'interrupted') {
        glowGrad.addColorStop(0, 'rgba(239, 68, 68, 0.5)');
        glowGrad.addColorStop(0.6, 'rgba(185, 28, 28, 0.2)');
        glowGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      } else {
        // Idle vibrant cosmic nebula glow
        glowGrad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
        glowGrad.addColorStop(0.4, 'rgba(99, 102, 241, 0.3)');
        glowGrad.addColorStop(0.8, 'rgba(147, 51, 234, 0.15)');
        glowGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      }

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * glowMultiplier, 0, Math.PI * 2);
      ctx.fill();

      // 2. Multi-layered dynamic wavy fluid sphere
      const numWaves = 3;
      for (let w = 0; w < numWaves; w++) {
        ctx.beginPath();
        const points = 56;
        const waveOffset = w * 1.9;
        const currentRadius = baseRadius * (0.84 + w * 0.14);

        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          const harmonic1 = Math.sin(angle * 3 + phase + waveOffset);
          const harmonic2 = Math.cos(angle * 5 - phase * 0.9 + waveOffset);
          const harmonic3 = Math.sin(angle * 2 + phase * 1.4);

          // Guaranteed warp even when completely quiet so AI is visibly alive
          let warp = 0;
          if (status === 'connecting') {
            warp = (harmonic1 * 0.5 + harmonic2 * 0.5) * (14 + 6 * Math.sin(phase * 3));
          } else if (status === 'speaking' || status === 'listening') {
            warp = (harmonic1 * 0.6 + harmonic2 * 0.4) * (combinedEnergy * 30 + 8);
          } else {
            // Idle breathing waves (smooth, elegant liquid movement)
            warp = (harmonic1 * 0.5 + harmonic2 * 0.3 + harmonic3 * 0.2) * (8 + 3 * Math.sin(phase * 1.5));
          }

          const r = currentRadius + warp;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();

        if (w === 0) {
          // Inner glowing core
          const coreGrad = ctx.createLinearGradient(
            centerX - currentRadius,
            centerY - currentRadius,
            centerX + currentRadius,
            centerY + currentRadius
          );

          if (status === 'speaking' || dynamicAi > 0.05) {
            coreGrad.addColorStop(0, '#c084fc');
            coreGrad.addColorStop(0.5, '#6366f1');
            coreGrad.addColorStop(1, '#3b82f6');
          } else if (status === 'listening' || dynamicUser > 0.05) {
            coreGrad.addColorStop(0, '#2dd4bf');
            coreGrad.addColorStop(0.5, '#06b6d4');
            coreGrad.addColorStop(1, '#3b82f6');
          } else if (status === 'connecting') {
            coreGrad.addColorStop(0, '#fbbf24');
            coreGrad.addColorStop(0.5, '#f59e0b');
            coreGrad.addColorStop(1, '#d97706');
          } else if (status === 'interrupted') {
            coreGrad.addColorStop(0, '#f87171');
            coreGrad.addColorStop(0.5, '#ef4444');
            coreGrad.addColorStop(1, '#b91c1c');
          } else {
            // Idle core: bright cyan to electric indigo
            coreGrad.addColorStop(0, '#38bdf8');
            coreGrad.addColorStop(0.5, '#6366f1');
            coreGrad.addColorStop(1, '#8b5cf6');
          }

          ctx.fillStyle = coreGrad;
          ctx.fill();

          // Core highlight sheen
          const sheenGrad = ctx.createRadialGradient(
            centerX - baseRadius * 0.35,
            centerY - baseRadius * 0.35,
            baseRadius * 0.05,
            centerX,
            centerY,
            baseRadius * 0.8
          );
          sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
          sheenGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.15)');
          sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = sheenGrad;
          ctx.fill();
        } else if (w === 1) {
          // Mid aura stroke
          ctx.strokeStyle =
            status === 'connecting'
              ? 'rgba(251, 191, 36, 0.6)'
              : status === 'speaking'
              ? 'rgba(192, 132, 252, 0.6)'
              : status === 'listening'
              ? 'rgba(45, 212, 191, 0.6)'
              : 'rgba(56, 189, 248, 0.55)';
          ctx.lineWidth = 1.8;
          ctx.stroke();
        } else {
          // Outer subtle aura
          ctx.strokeStyle =
            status === 'connecting'
              ? 'rgba(245, 158, 11, 0.4)'
              : 'rgba(167, 139, 250, 0.35)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }

      // 3. Orbiting Satellites (Active particles moving around the sphere)
      const orbitSpeed = status === 'connecting' ? phase * 1.8 : phase * 0.6;
      const orbitRadiusX = baseRadius * 1.35;
      const orbitRadiusY = baseRadius * 0.65;

      const sat1X = centerX + Math.cos(orbitSpeed) * orbitRadiusX;
      const sat1Y = centerY + Math.sin(orbitSpeed) * orbitRadiusY;
      ctx.beginPath();
      ctx.arc(sat1X, sat1Y, 3, 0, Math.PI * 2);
      ctx.fillStyle = status === 'connecting' ? '#fde68a' : '#67e8f9';
      ctx.shadowColor = status === 'connecting' ? '#f59e0b' : '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      const sat2X = centerX + Math.cos(orbitSpeed + Math.PI) * (orbitRadiusX * 0.9);
      const sat2Y = centerY + Math.sin(orbitSpeed + Math.PI) * (orbitRadiusY * 0.9);
      ctx.beginPath();
      ctx.arc(sat2X, sat2Y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = status === 'connecting' ? '#fbbf24' : '#c084fc';
      ctx.shadowColor = status === 'connecting' ? '#d97706' : '#a855f7';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [status, userVolume, aiVolume, size]);

  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size }}
    >
      {/* Background Soft Glow Blur */}
      <div
        className={`absolute inset-4 rounded-full blur-2xl transition-all duration-700 pointer-events-none ${
          status === 'speaking'
            ? 'bg-purple-600/35 scale-125'
            : status === 'listening'
            ? 'bg-cyan-500/35 scale-125'
            : status === 'connecting'
            ? 'bg-amber-500/40 scale-110 animate-pulse'
            : status === 'interrupted'
            ? 'bg-red-500/35 scale-110'
            : 'bg-cyan-500/25 scale-105'
        }`}
      />

      {/* Rotating Orbit Rings when connecting */}
      {status === 'connecting' && (
        <>
          <div
            className="absolute inset-2 rounded-full border-2 border-transparent border-t-amber-400 border-r-amber-500/50 animate-spin pointer-events-none"
            style={{ animationDuration: '1.2s' }}
          />
          <div
            className="absolute inset-5 rounded-full border border-transparent border-b-amber-300 border-l-amber-400/40 animate-spin pointer-events-none"
            style={{ animationDuration: '2s', animationDirection: 'reverse' }}
          />
        </>
      )}

      {/* Rotating Ambient Rings when Idle */}
      {status === 'idle' && (
        <>
          <div
            className="absolute inset-3 rounded-full border border-cyan-500/20 border-t-cyan-400/60 animate-spin pointer-events-none"
            style={{ animationDuration: '10s' }}
          />
          <div
            className="absolute inset-7 rounded-full border border-indigo-500/20 border-b-indigo-400/50 animate-spin pointer-events-none"
            style={{ animationDuration: '14s', animationDirection: 'reverse' }}
          />
        </>
      )}

      {/* Main Canvas Sphere */}
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="pointer-events-none absolute z-10"
      />

      {/* Central State Indicator Badge */}
      <div className="relative z-20 flex flex-col items-center justify-center pointer-events-none px-3 py-1 rounded-full bg-slate-950/70 backdrop-blur-md border border-slate-700/60 shadow-xl">
        <span className="text-[11px] font-bold uppercase tracking-wider text-white drop-shadow flex items-center gap-1.5">
          {status === 'connecting' && (
            <>
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
              <span className="text-amber-300">Connecting...</span>
            </>
          )}
          {status === 'active' && (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{aiVolume > 0.02 ? 'Speaking' : userVolume > 0.02 ? 'Listening' : 'Live'}</span>
            </>
          )}
          {status === 'speaking' && (
            <>
              <span className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
              <span className="text-purple-200">AI Teacher Speaking</span>
            </>
          )}
          {status === 'listening' && (
            <>
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-cyan-200">Listening to You</span>
            </>
          )}
          {status === 'interrupted' && (
            <>
              <span className="h-2 w-2 rounded-full bg-red-400" />
              <span className="text-red-300">Interrupted</span>
            </>
          )}
          {status === 'idle' && (
            <>
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-cyan-200">Ready to Learn</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
};
