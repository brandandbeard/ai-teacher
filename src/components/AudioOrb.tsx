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

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = size * 0.28;

      // Amplitude driven by volume
      const dynamicAi = Math.min(1, aiVolume * 2.5);
      const dynamicUser = Math.min(1, userVolume * 3.0);
      const combinedEnergy = Math.max(dynamicAi, dynamicUser);

      phase += 0.04 + combinedEnergy * 0.08;

      // Glow backdrop
      const gradient = ctx.createRadialGradient(
        centerX,
        centerY,
        baseRadius * 0.2,
        centerX,
        centerY,
        baseRadius * (1.8 + combinedEnergy * 0.6)
      );

      if (status === 'speaking' || dynamicAi > 0.05) {
        gradient.addColorStop(0, 'rgba(168, 85, 247, 0.45)');
        gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.25)');
        gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
      } else if (status === 'listening' || dynamicUser > 0.05) {
        gradient.addColorStop(0, 'rgba(20, 184, 166, 0.45)');
        gradient.addColorStop(0.5, 'rgba(6, 182, 212, 0.25)');
        gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
      } else if (status === 'connecting') {
        gradient.addColorStop(0, 'rgba(245, 158, 11, 0.35)');
        gradient.addColorStop(0.6, 'rgba(217, 119, 6, 0.15)');
        gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
      } else {
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
        gradient.addColorStop(0.7, 'rgba(30, 41, 59, 0.05)');
        gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
      }

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * (2.0 + combinedEnergy), 0, Math.PI * 2);
      ctx.fill();

      // Deforming wavy sound layers
      const numWaves = 3;
      for (let w = 0; w < numWaves; w++) {
        ctx.beginPath();
        const points = 48;
        const waveOffset = w * 1.8;
        const currentRadius = baseRadius * (0.85 + w * 0.15);

        for (let i = 0; i <= points; i++) {
          const angle = (i / points) * Math.PI * 2;
          const harmonic1 = Math.sin(angle * 3 + phase + waveOffset);
          const harmonic2 = Math.cos(angle * 5 - phase * 0.8 + waveOffset);
          const warp = (harmonic1 * 0.6 + harmonic2 * 0.4) * (combinedEnergy * 28 + 6);

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
          // Inner core
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
          } else {
            coreGrad.addColorStop(0, '#818cf8');
            coreGrad.addColorStop(1, '#4f46e5');
          }
          ctx.fillStyle = coreGrad;
          ctx.fill();
        } else {
          // Outer subtle aura ripples
          ctx.strokeStyle =
            w === 1
              ? 'rgba(255, 255, 255, 0.4)'
              : 'rgba(167, 139, 250, 0.3)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [status, userVolume, aiVolume, size]);

  return (
    <div className="relative flex items-center justify-center select-none" style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        width={size * 1.5}
        height={size * 1.5}
        style={{ width: size * 1.5, height: size * 1.5 }}
        className="pointer-events-none absolute"
      />
      {/* Central State indicator badge */}
      <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/90 drop-shadow">
          {status === 'active' && (aiVolume > 0.02 ? 'Speaking' : userVolume > 0.02 ? 'Listening' : 'Listening...')}
          {status === 'speaking' && 'Gemini Speaking'}
          {status === 'listening' && 'Listening to You'}
          {status === 'connecting' && 'Connecting...'}
          {status === 'interrupted' && 'Interrupted'}
          {status === 'idle' && 'Ready'}
        </span>
      </div>
    </div>
  );
};
