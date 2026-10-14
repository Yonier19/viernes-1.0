import React, { useState, useEffect } from 'react';
import { Timer, X, Play, Pause, RotateCcw, Bell } from 'lucide-react';
import { audioService } from '../../services/audioService';

interface TimerWidgetProps {
  initialSeconds: number;
  label?: string;
  onClose: () => void;
}

export const TimerWidget: React.FC<TimerWidgetProps> = ({
  initialSeconds = 60,
  label = 'Alarma Táctica Viernes',
  onClose,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(true);
  const [hasFinished, setHasFinished] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (isRunning && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => prev - 1);
      }, 1000);
    } else if (secondsLeft === 0 && !hasFinished) {
      setHasFinished(true);
      setIsRunning(false);
      audioService.playAlarmSound();
    }
    return () => clearInterval(interval);
  }, [isRunning, secondsLeft, hasFinished]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 rounded-xl bg-slate-950/95 border border-cyan-500/50 p-4 shadow-2xl shadow-cyan-950/80 backdrop-blur-lg animate-in fade-in slide-in-from-bottom-5">
      <div className="flex items-center justify-between pb-3 border-b border-cyan-900/30">
        <div className="flex items-center space-x-2 text-cyan-400 font-orbitron text-xs font-semibold">
          <Timer className="w-4 h-4 text-cyan-300 animate-pulse" />
          <span>{label}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="py-6 flex flex-col items-center justify-center">
        <div
          className={`font-orbitron text-4xl tracking-wider font-bold ${
            hasFinished
              ? 'text-red-400 animate-bounce'
              : secondsLeft < 10
              ? 'text-amber-400 animate-pulse'
              : 'text-cyan-300 text-glow-cyan'
          }`}
        >
          {formatTime(secondsLeft)}
        </div>
        <p className="text-[11px] font-rajdhani text-slate-400 mt-1">
          {hasFinished ? '¡TIEMPO FINALIZADO!' : isRunning ? 'CUENTA REGRESIVA ACTIVA' : 'EN PAUSA'}
        </p>
      </div>

      <div className="flex items-center justify-center space-x-3 pt-2">
        <button
          onClick={() => setIsRunning(!isRunning)}
          disabled={hasFinished}
          className={`px-3 py-1.5 rounded-lg flex items-center space-x-1 text-xs font-rajdhani font-semibold border transition-all ${
            isRunning
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-300 hover:bg-amber-900/40'
              : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/40'
          }`}
        >
          {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{isRunning ? 'Pausar' : 'Reanudar'}</span>
        </button>

        <button
          onClick={() => {
            setSecondsLeft(initialSeconds);
            setHasFinished(false);
            setIsRunning(true);
          }}
          className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 flex items-center space-x-1 text-xs font-rajdhani font-semibold transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reiniciar</span>
        </button>

        <button
          onClick={() => setSecondsLeft((prev) => prev + 60)}
          className="px-2.5 py-1.5 rounded-lg bg-cyan-950/30 border border-cyan-800 text-cyan-300 text-xs font-rajdhani font-semibold hover:bg-cyan-900/30"
        >
          +1 min
        </button>
      </div>
    </div>
  );
};
