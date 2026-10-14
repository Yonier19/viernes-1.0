import React, { useState } from 'react';
import { Calculator, X, Equal, Delete } from 'lucide-react';

interface CalculatorWidgetProps {
  onClose: () => void;
}

export const CalculatorWidget: React.FC<CalculatorWidgetProps> = ({ onClose }) => {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');

  const handleNum = (num: string) => {
    if (display === '0') setDisplay(num);
    else setDisplay(display + num);
  };

  const handleOp = (op: string) => {
    setEquation(display + ' ' + op + ' ');
    setDisplay('0');
  };

  const handleClear = () => {
    setDisplay('0');
    setEquation('');
  };

  const handleEqual = () => {
    try {
      const full = equation + display;
      const clean = full.replace(/×/g, '*').replace(/÷/g, '/');
      const res = Function(`'use strict'; return (${clean})`)();
      setDisplay(String(res));
      setEquation('');
    } catch {
      setDisplay('Error');
    }
  };

  return (
    <div className="fixed bottom-6 left-6 z-50 w-72 rounded-xl bg-slate-950/95 border border-cyan-500/50 p-4 shadow-2xl shadow-cyan-950/80 backdrop-blur-lg animate-in fade-in">
      <div className="flex items-center justify-between pb-2 border-b border-cyan-900/40">
        <div className="flex items-center space-x-1.5 text-cyan-400 font-orbitron text-xs font-semibold">
          <Calculator className="w-4 h-4 text-cyan-300" />
          <span>CÁLCULO TÁCTICO</span>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="my-3 p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-right">
        <div className="text-[11px] font-rajdhani text-slate-500 h-4">{equation}</div>
        <div className="text-2xl font-orbitron text-cyan-300 tracking-wider truncate">{display}</div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 text-xs font-rajdhani font-semibold">
        <button onClick={handleClear} className="p-2.5 rounded bg-red-950/40 border border-red-500/30 text-red-300 hover:bg-red-900/40 col-span-2">
          AC
        </button>
        <button onClick={() => handleOp('÷')} className="p-2.5 rounded bg-cyan-950/40 border border-cyan-700 text-cyan-300 hover:bg-cyan-900/40">
          ÷
        </button>
        <button onClick={() => handleOp('×')} className="p-2.5 rounded bg-cyan-950/40 border border-cyan-700 text-cyan-300 hover:bg-cyan-900/40">
          ×
        </button>

        {['7', '8', '9'].map((n) => (
          <button key={n} onClick={() => handleNum(n)} className="p-2.5 rounded bg-slate-900/90 border border-slate-800 text-slate-200 hover:bg-slate-800">
            {n}
          </button>
        ))}
        <button onClick={() => handleOp('-')} className="p-2.5 rounded bg-cyan-950/40 border border-cyan-700 text-cyan-300 hover:bg-cyan-900/40">
          -
        </button>

        {['4', '5', '6'].map((n) => (
          <button key={n} onClick={() => handleNum(n)} className="p-2.5 rounded bg-slate-900/90 border border-slate-800 text-slate-200 hover:bg-slate-800">
            {n}
          </button>
        ))}
        <button onClick={() => handleOp('+')} className="p-2.5 rounded bg-cyan-950/40 border border-cyan-700 text-cyan-300 hover:bg-cyan-900/40">
          +
        </button>

        {['1', '2', '3'].map((n) => (
          <button key={n} onClick={() => handleNum(n)} className="p-2.5 rounded bg-slate-900/90 border border-slate-800 text-slate-200 hover:bg-slate-800">
            {n}
          </button>
        ))}
        <button onClick={handleEqual} className="p-2.5 rounded bg-emerald-600 border border-emerald-400 text-white hover:bg-emerald-500 row-span-2 flex items-center justify-center">
          <Equal className="w-4 h-4" />
        </button>

        <button onClick={() => handleNum('0')} className="p-2.5 rounded bg-slate-900/90 border border-slate-800 text-slate-200 hover:bg-slate-800 col-span-2">
          0
        </button>
        <button onClick={() => handleNum('.')} className="p-2.5 rounded bg-slate-900/90 border border-slate-800 text-slate-200 hover:bg-slate-800">
          .
        </button>
      </div>
    </div>
  );
};
