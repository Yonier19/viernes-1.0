import React from 'react';
import { Bot, User, Sparkles } from 'lucide-react';
import { OrbThemeColor } from '../types/assistant';

interface AuraAvatarProps {
  sender: 'user' | 'viernes';
  theme?: OrbThemeColor;
  size?: 'sm' | 'md' | 'lg';
  isSpeaking?: boolean;
}

export const AuraAvatar: React.FC<AuraAvatarProps> = ({
  sender,
  theme = 'cyan',
  size = 'md',
  isSpeaking = false,
}) => {
  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base',
  }[size];

  const themeGlow = {
    cyan: 'border-cyan-400 text-cyan-300 shadow-cyan-500/40',
    amethyst: 'border-purple-400 text-purple-300 shadow-purple-500/40',
    gold: 'border-amber-400 text-amber-300 shadow-amber-500/40',
    emerald: 'border-emerald-400 text-emerald-300 shadow-emerald-500/40',
  }[theme];

  if (sender === 'user') {
    return (
      <div
        className={`${sizeClasses} rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-slate-200 shadow-md shrink-0`}
      >
        <User className="w-4 h-4" />
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <div
        className={`${sizeClasses} rounded-full bg-slate-950 border-2 ${themeGlow} flex items-center justify-center shadow-lg ${
          isSpeaking ? 'animate-pulse scale-105' : ''
        } transition-all`}
      >
        <Bot className="w-5 h-5 text-cyan-300" />
      </div>
      {isSpeaking && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
      )}
    </div>
  );
};
