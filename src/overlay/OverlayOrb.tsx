import React, { useEffect, useRef } from 'react';
import { AssistantLifecycleState, OrbThemeColor } from '../types/assistant';

interface OverlayOrbProps {
  state: AssistantLifecycleState;
  theme?: OrbThemeColor;
  size?: number; // Default 72
  audioLevel?: number; // 0 to 1
  powerProfile?: 'eco' | 'balanced' | 'performance';
  onClick?: () => void;
}

export const OverlayOrb: React.FC<OverlayOrbProps> = ({
  state,
  theme = 'cyan',
  size = 72,
  audioLevel = 0,
  powerProfile = 'balanced',
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Theme palettes with state overrides
  const getColors = () => {
    if (state === 'LISTENING') {
      return {
        primary: '#FF2E54',
        secondary: '#FF6B8B',
        accent: '#FF003C',
        glow: 'rgba(255, 46, 84, 0.55)',
        deep: 'rgba(50, 0, 15, 0.75)',
      };
    }
    if (state === 'WAKE_DETECTED') {
      return {
        primary: '#FFD700',
        secondary: '#FFA500',
        accent: '#FF4500',
        glow: 'rgba(255, 215, 0, 0.65)',
        deep: 'rgba(60, 40, 0, 0.8)',
      };
    }
    if (state === 'PROCESSING') {
      return {
        primary: '#A855F7',
        secondary: '#C084FC',
        accent: '#7E22CE',
        glow: 'rgba(168, 85, 247, 0.55)',
        deep: 'rgba(35, 10, 55, 0.75)',
      };
    }
    if (state === 'SPEAKING') {
      return {
        primary: '#10B981',
        secondary: '#34D399',
        accent: '#059669',
        glow: 'rgba(16, 185, 129, 0.55)',
        deep: 'rgba(5, 40, 25, 0.75)',
      };
    }
    if (state === 'PAUSED') {
      return {
        primary: '#F59E0B',
        secondary: '#FBBF24',
        accent: '#D97706',
        glow: 'rgba(245, 158, 11, 0.35)',
        deep: 'rgba(45, 30, 5, 0.65)',
      };
    }
    if (state === 'ERROR') {
      return {
        primary: '#EF4444',
        secondary: '#F87171',
        accent: '#B91C1C',
        glow: 'rgba(239, 68, 68, 0.55)',
        deep: 'rgba(50, 5, 5, 0.75)',
      };
    }

    // Default themes for IDLE
    const palettes = {
      cyan: {
        primary: '#00F2FE',
        secondary: '#4FACFE',
        accent: '#00C9FF',
        glow: 'rgba(0, 242, 254, 0.45)',
        deep: 'rgba(0, 25, 55, 0.7)',
      },
      amethyst: {
        primary: '#9D4EDD',
        secondary: '#C77DFF',
        accent: '#7B2CBF',
        glow: 'rgba(157, 78, 221, 0.45)',
        deep: 'rgba(30, 10, 45, 0.7)',
      },
      gold: {
        primary: '#FFD700',
        secondary: '#FFB703',
        accent: '#FB8500',
        glow: 'rgba(255, 183, 3, 0.45)',
        deep: 'rgba(45, 30, 5, 0.7)',
      },
      emerald: {
        primary: '#00F5D4',
        secondary: '#70E000',
        accent: '#00BBF9',
        glow: 'rgba(0, 245, 212, 0.45)',
        deep: 'rgba(5, 35, 25, 0.7)',
      },
    };
    return palettes[theme] || palettes.cyan;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let time = 0;

    const render = () => {
      // Speed up animation based on state
      const speed =
        state === 'WAKE_DETECTED'
          ? 0.08
          : state === 'PROCESSING'
          ? 0.07
          : state === 'LISTENING'
          ? 0.05
          : state === 'SPEAKING'
          ? 0.06
          : 0.025;

      time += speed;
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;
      const baseRadius = width * 0.28;
      const colors = getColors();

      ctx.clearRect(0, 0, width, height);

      // Activity multiplier
      let activityFactor = 1.0;
      if (state === 'LISTENING') activityFactor = 1.5 + audioLevel * 1.5;
      else if (state === 'SPEAKING') activityFactor = 1.7 + Math.sin(time * 3) * 0.3 + audioLevel * 1.4;
      else if (state === 'PROCESSING') activityFactor = 2.0;
      else if (state === 'WAKE_DETECTED') activityFactor = 2.4;
      else if (state === 'PAUSED') activityFactor = 0.4;
      else activityFactor = 1.0 + Math.sin(time) * 0.1;

      // 1. Atmospheric Outer Halo
      const haloGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.2, cx, cy, baseRadius * 1.7);
      haloGrad.addColorStop(0, colors.deep);
      haloGrad.addColorStop(0.5, colors.glow);
      haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 1.6 * (activityFactor * 0.15 + 0.9), 0, Math.PI * 2);
      ctx.fill();

      // 2. Cybernetic Rotating Rings
      ctx.save();
      ctx.translate(cx, cy);

      // Outer ring
      ctx.rotate(time * (state === 'PROCESSING' ? 1.4 : 0.4));
      ctx.strokeStyle = colors.primary;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.8;
      ctx.setLineDash([6, 8, 2, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, baseRadius * 1.25, 0, Math.PI * 2);
      ctx.stroke();

      // 4 orbital tech nodes
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const nx = Math.cos(angle) * baseRadius * 1.25;
        const ny = Math.sin(angle) * baseRadius * 1.25;
        ctx.fillStyle = colors.secondary;
        ctx.beginPath();
        ctx.arc(nx, ny, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Counter-rotating inner ring
      ctx.rotate(-time * (state === 'PROCESSING' ? 2.2 : 0.6));
      ctx.strokeStyle = colors.secondary;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.65;
      ctx.setLineDash([12, 6, 3, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, baseRadius * 1.05, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 3. Central Reactive Waveform Shell
      const wavePoints = 32;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.strokeStyle = colors.primary;
      ctx.lineWidth = 2.0;
      ctx.globalAlpha = 0.9;

      for (let i = 0; i <= wavePoints; i++) {
        const angle = (i / wavePoints) * Math.PI * 2;
        const waveFreq = state === 'PROCESSING' ? 6 : state === 'SPEAKING' ? 5 : 3;
        const waveAmp = state === 'IDLE' ? 2 : 7 * activityFactor;
        const rOffset = Math.sin(angle * waveFreq + time * 3.5) * waveAmp;
        const r = baseRadius * 0.9 + rOffset;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      // 4. Glowing Core
      const coreGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, baseRadius * 0.7);
      coreGrad.addColorStop(0, '#FFFFFF');
      coreGrad.addColorStop(0.35, colors.primary);
      coreGrad.addColorStop(0.75, colors.secondary);
      coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(0, 0, baseRadius * 0.62 * (0.95 + Math.sin(time * 2.5) * 0.06 * activityFactor), 0, Math.PI * 2);
      ctx.fill();

      // Mini tech crosshair in center
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(6, 0);
      ctx.moveTo(0, -6);
      ctx.lineTo(0, 6);
      ctx.stroke();

      if (state === 'IDLE' || state === 'PAUSED') {
        if (powerProfile === 'eco') {
          // Paso 1.1: En reposo y ahorro de energía, 0 renders adicionales (orbe estático, 0% CPU/GPU)
          // Se redibuja automáticamente solo cuando cambie el estado o nivel de audio
          return;
        } else if (powerProfile === 'balanced') {
          // En reposo equilibrado: 1 fps para pulso ultra liviano (< 0.1% CPU/GPU)
          timeoutId = setTimeout(() => {
            animId = requestAnimationFrame(render);
          }, 1000);
        } else {
          // Máximo rendimiento: 60 fps
          animId = requestAnimationFrame(render);
        }
      } else {
        // En actividad (LISTENING, PROCESSING, SPEAKING, WAKE_DETECTED): 60 fps fluido siempre
        animId = requestAnimationFrame(render);
      }
    };

    let timeoutId: any = null;
    render();

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [state, theme, audioLevel, powerProfile]);

  return (
    <div
      onClick={onClick}
      className="relative cursor-pointer select-none flex items-center justify-center transition-transform active:scale-95 hover:scale-105"
      style={{ width: size, height: size }}
      title={`Viernes: ${state} (Haz clic para interactuar o arrastra)`}
    >
      <canvas
        ref={canvasRef}
        width={size * 2}
        height={size * 2}
        className="w-full h-full block drop-shadow-[0_0_15px_rgba(0,242,254,0.4)]"
      />
    </div>
  );
};
