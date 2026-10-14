import React, { useEffect, useRef } from 'react';
import { ListeningState, OrbThemeColor } from '../types/assistant';

interface ViernesOrbProps {
  state: ListeningState;
  theme: OrbThemeColor;
  audioLevel?: number; // 0 to 1
  powerProfile?: 'eco' | 'balanced' | 'performance';
  onClick?: () => void;
  size?: number;
}

export const ViernesOrb: React.FC<ViernesOrbProps> = ({
  state,
  theme = 'cyan',
  audioLevel = 0,
  powerProfile = 'balanced',
  onClick,
  size = 280,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Theme palettes
  const colorMap = {
    cyan: {
      primary: '#00F2FE',
      secondary: '#4FACFE',
      accent: '#00C9FF',
      glow: 'rgba(0, 242, 254, 0.45)',
      deep: 'rgba(0, 20, 45, 0.7)',
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
  }[theme];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const render = () => {
      time += 0.035;
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;
      const baseRadius = width * 0.28;

      ctx.clearRect(0, 0, width, height);

      // Determine dynamic activity multiplier based on state and audio
      let activityFactor = 1.0;
      if (state === 'LISTENING') activityFactor = 1.6 + audioLevel * 1.5;
      else if (state === 'SPEAKING') activityFactor = 1.9 + Math.sin(time * 3) * 0.4 + audioLevel * 1.8;
      else if (state === 'THINKING') activityFactor = 2.2;
      else activityFactor = 1.0 + Math.sin(time) * 0.1;

      // 1. Atmospheric Outer Halo
      const haloGradient = ctx.createRadialGradient(cx, cy, baseRadius * 0.4, cx, cy, baseRadius * 1.8);
      haloGradient.addColorStop(0, colorMap.deep);
      haloGradient.addColorStop(0.5, colorMap.glow);
      haloGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = haloGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 1.7 * (activityFactor * 0.2 + 0.9), 0, Math.PI * 2);
      ctx.fill();

      // 2. Rotating Cybernetic Rings
      ctx.save();
      ctx.translate(cx, cy);

      // Outer Ring with Tech Nodes
      ctx.rotate(time * (state === 'THINKING' ? 0.8 : 0.2));
      ctx.strokeStyle = colorMap.primary;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.65;
      ctx.setLineDash([8, 12, 3, 12]);
      ctx.beginPath();
      ctx.arc(0, 0, baseRadius * 1.25, 0, Math.PI * 2);
      ctx.stroke();

      // Orbital nodes
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const nx = Math.cos(angle) * baseRadius * 1.25;
        const ny = Math.sin(angle) * baseRadius * 1.25;
        ctx.fillStyle = colorMap.secondary;
        ctx.beginPath();
        ctx.arc(nx, ny, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Middle Counter-rotating Ring
      ctx.rotate(-time * (state === 'THINKING' ? 1.4 : 0.35));
      ctx.strokeStyle = colorMap.secondary;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([16, 8, 4, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, baseRadius * 1.1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 3. Central Reactive Energy Waveform Shell
      const wavePoints = 48;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      ctx.strokeStyle = colorMap.primary;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.85;

      for (let i = 0; i <= wavePoints; i++) {
        const angle = (i / wavePoints) * Math.PI * 2;
        const waveFreq = state === 'THINKING' ? 8 : state === 'SPEAKING' ? 6 : 4;
        const waveAmp = (state === 'IDLE' ? 4 : 12 * activityFactor);
        const rOffset = Math.sin(angle * waveFreq + time * 3) * waveAmp;
        const r = baseRadius * 0.95 + rOffset;
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      // Inner glowing core
      const coreGradient = ctx.createRadialGradient(0, 0, 5, 0, 0, baseRadius * 0.7);
      coreGradient.addColorStop(0, '#FFFFFF');
      coreGradient.addColorStop(0.3, colorMap.primary);
      coreGradient.addColorStop(0.7, colorMap.secondary);
      coreGradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(0, 0, baseRadius * 0.65 * (0.95 + Math.sin(time * 2) * 0.05 * activityFactor), 0, Math.PI * 2);
      ctx.fill();

      // Subtle high-tech crosshair in center
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(12, 0);
      ctx.moveTo(0, -12);
      ctx.lineTo(0, 12);
      ctx.stroke();

      ctx.restore();

      if (state === 'IDLE') {
        if (powerProfile === 'eco') {
          // Paso 1.1: En reposo y modo ahorro, 0 renders adicionales (orbe estático)
          return;
        } else if (powerProfile === 'balanced') {
          timeoutId = setTimeout(() => {
            animationFrameId = requestAnimationFrame(render);
          }, 1000);
        } else {
          animationFrameId = requestAnimationFrame(render);
        }
      } else {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    let timeoutId: any = null;
    render();

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [state, theme, audioLevel, colorMap, powerProfile]);

  const stateLabels = {
    IDLE: 'EN LÍNEA / EN ESPERA',
    LISTENING: 'ESCUCHANDO COMANDO...',
    THINKING: 'PROCESANDO PROTOCOLO...',
    SPEAKING: 'TRANSMITIENDO RESPUESTA',
  };

  const stateBorderColors = {
    IDLE: 'border-cyan-500/30 hover:border-cyan-400',
    LISTENING: 'border-red-400 animate-pulse shadow-lg shadow-red-500/30',
    THINKING: 'border-violet-400 animate-spin-slow shadow-lg shadow-violet-500/30',
    SPEAKING: 'border-emerald-400 shadow-lg shadow-emerald-500/30',
  };

  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      {/* Outer interactive circle container */}
      <div
        onClick={onClick}
        className={`relative cursor-pointer rounded-full p-2 transition-all duration-300 ${stateBorderColors[state]}`}
        style={{ width: size, height: size }}
        title="Toca para interactuar con Viernes"
      >
        <canvas
          ref={canvasRef}
          width={size * 2}
          height={size * 2}
          className="w-full h-full block"
        />

        {/* State pulse badge */}
        <div className="absolute inset-x-0 bottom-2 flex justify-center pointer-events-none">
          <div className="px-3 py-1 rounded-full bg-slate-950/80 border border-cyan-500/40 backdrop-blur-md flex items-center space-x-2 text-[11px] font-orbitron tracking-wider text-cyan-300">
            <span
              className={`w-2 h-2 rounded-full ${
                state === 'LISTENING'
                  ? 'bg-red-400 animate-ping'
                  : state === 'THINKING'
                  ? 'bg-purple-400 animate-pulse'
                  : state === 'SPEAKING'
                  ? 'bg-emerald-400 animate-bounce'
                  : 'bg-cyan-400'
              }`}
            />
            <span>{stateLabels[state]}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
