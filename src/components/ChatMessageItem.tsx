import React, { useState } from 'react';
import { 
  Volume2, 
  Copy, 
  Check, 
  ExternalLink, 
  Zap, 
  Globe, 
  Sparkles, 
  ShieldCheck, 
  HelpCircle, 
  BookmarkPlus, 
  RotateCcw,
  Layers,
  Cpu,
  AlertTriangle,
  FileText
} from 'lucide-react';
import { ChatMessage, OrbThemeColor, ResponseTier, ConfidenceLevel } from '../types/assistant';
import { AuraAvatar } from './AuraAvatar';
import { audioService } from '../services/audioService';

interface ChatMessageItemProps {
  message: ChatMessage;
  theme: OrbThemeColor;
  onExecuteAction?: (action: any) => void;
  onFollowUpClick?: (prompt: string) => void;
  onSaveToMemory?: (content: string) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  theme,
  onExecuteAction,
  onFollowUpClick,
  onSaveToMemory,
}) => {
  const isViernes = message.sender === 'viernes';
  const [copied, setCopied] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [savedMemoryDone, setSavedMemoryDone] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePlayVoice = () => {
    setIsPlayingAudio(true);
    let speechText = message.text;
    if (message.sources && message.sources.length > 0) {
      const sourceList = message.sources.slice(0, 2).map((s) => s.title).join(' y ');
      speechText += ` Información fundamentada según fuentes como ${sourceList}.`;
    }

    audioService.speak(speechText, {
      onEnd: () => setIsPlayingAudio(false),
      onError: () => setIsPlayingAudio(false),
    });
  };

  const openSourceLink = (url: string) => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && typeof electronAPI.openExternal === 'function') {
      electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const handleSaveMemoryClick = () => {
    if (onSaveToMemory) {
      onSaveToMemory(message.text);
      setSavedMemoryDone(true);
      setTimeout(() => setSavedMemoryDone(false), 3000);
    }
  };

  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const getConfidenceBadge = (confidence?: ConfidenceLevel) => {
    switch (confidence) {
      case 'alta':
        return { label: 'Confianza Alta', color: 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300' };
      case 'media':
        return { label: 'Confianza Media', color: 'bg-amber-950/80 border-amber-500/50 text-amber-300' };
      case 'baja':
        return { label: 'Confianza Baja', color: 'bg-rose-950/80 border-rose-500/50 text-rose-300' };
      default:
        return { label: 'Confianza Alta', color: 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300' };
    }
  };

  const getTierLabel = (tier?: ResponseTier, source?: string) => {
    if (tier === 'web' || source === 'gemini_search') {
      return { label: 'Fuente: Web (Google Search)', icon: Globe, color: 'text-cyan-300 border-cyan-400/40 bg-cyan-950/80' };
    }
    if (tier === 'gemini_lite') {
      return { label: 'Fuente: IA Ligera (Flash Lite)', icon: Cpu, color: 'text-purple-300 border-purple-400/40 bg-purple-950/80' };
    }
    if (tier === 'gemini' || source === 'gemini') {
      return { label: 'Fuente: IA (Gemini Core)', icon: Sparkles, color: 'text-sky-300 border-sky-400/40 bg-sky-950/80' };
    }
    if (tier === 'cache') {
      return { label: 'Fuente: Caché Táctica', icon: Layers, color: 'text-teal-300 border-teal-400/40 bg-teal-950/80' };
    }
    if (tier === 'emergency') {
      return { label: 'Fuente: Contingencia', icon: AlertTriangle, color: 'text-amber-300 border-amber-400/40 bg-amber-950/80' };
    }
    return { label: 'Fuente: Local Stark', icon: Cpu, color: 'text-slate-300 border-slate-600/40 bg-slate-900/80' };
  };

  const confInfo = getConfidenceBadge(message.confidence);
  const tierInfo = getTierLabel(message.tier, message.source);
  const TierIcon = tierInfo.icon;

  return (
    <div className={`flex w-full space-x-3 my-3.5 ${isViernes ? 'justify-start' : 'justify-end'}`}>
      {isViernes && <AuraAvatar sender="viernes" theme={theme} isSpeaking={isPlayingAudio} />}

      <div
        className={`max-w-[88%] sm:max-w-[78%] rounded-2xl p-4 transition-all ${
          isViernes
            ? 'bg-slate-900/90 border border-cyan-500/30 text-slate-100 shadow-lg shadow-cyan-950/40 rounded-tl-sm'
            : 'bg-cyan-950/80 border border-cyan-600/40 text-cyan-50 shadow-md shadow-cyan-900/30 rounded-tr-sm ml-auto'
        }`}
      >
        {/* Header line with Sender name, Badges & Time */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-[11px] font-rajdhani text-slate-400">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-orbitron font-semibold text-cyan-300 tracking-wider">
              {isViernes ? 'VIERNES // ASISTENTE' : 'COMANDO USUARIO'}
            </span>

            {isViernes && (
              <>
                {/* Discrete Tier Indicator */}
                <span className={`inline-flex items-center space-x-1 px-1.5 py-0.2 rounded border text-[9px] font-orbitron ${tierInfo.color}`}>
                  <TierIcon className="w-2.5 h-2.5" />
                  <span>{tierInfo.label}</span>
                </span>

                {/* Confidence Badge */}
                <span className={`inline-flex items-center space-x-1 px-1.5 py-0.2 rounded border text-[9px] font-orbitron ${confInfo.color}`}>
                  <ShieldCheck className="w-2.5 h-2.5" />
                  <span>{confInfo.label}</span>
                </span>
              </>
            )}
          </div>

          <span className="text-[10px] text-slate-500 shrink-0">{formattedTime}</span>
        </div>

        {/* Message Content */}
        <div className="text-sm leading-relaxed font-rajdhani font-medium whitespace-pre-wrap break-words">
          {message.text}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-cyan-400 animate-pulse align-middle" />
          )}
        </div>

        {/* Sensitive Disclaimer (Medical, Legal, Financial) */}
        {message.disclaimer && (
          <div className="mt-3 p-2.5 rounded-lg bg-amber-950/30 border border-amber-600/40 flex items-start space-x-2 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-tight text-amber-200/90 font-rajdhani">
              {message.disclaimer}
            </div>
          </div>
        )}

        {/* Clarification Question for Ambiguous Queries */}
        {message.clarificationQuestion && (
          <div className="mt-3 p-2.5 rounded-lg bg-purple-950/30 border border-purple-500/40 flex items-start space-x-2 text-xs text-purple-200">
            <HelpCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-tight font-rajdhani">
              <span className="font-semibold text-purple-300">Aclaración táctica: </span>
              {message.clarificationQuestion}
            </div>
          </div>
        )}

        {/* Grounding Sources (Google Search) */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-slate-800/80">
            <div className="flex items-center space-x-1.5 text-[11px] font-orbitron text-cyan-400 mb-1.5">
              <Globe className="w-3.5 h-3.5" />
              <span>FUENTES DE INFORMACIÓN EN VIVO:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {message.sources.map((src, i) => (
                <button
                  key={i}
                  onClick={() => openSourceLink(src.url)}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-950/90 hover:bg-cyan-950/80 border border-slate-700/80 hover:border-cyan-400/50 text-[11px] text-slate-300 hover:text-cyan-200 transition-colors"
                  title={src.url}
                >
                  <span className="truncate max-w-[200px]">{src.title}</span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-60" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action Badge & Interactive Trigger */}
        {message.action && (
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
            {message.action.type === 'DEVICE_ACTION' ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-orbitron border ${
                  message.action.level === 3
                    ? 'bg-rose-950/80 border-rose-500/60 text-rose-300'
                    : message.action.level === 2
                    ? 'bg-amber-950/80 border-amber-500/60 text-amber-300'
                    : message.action.level === 1
                    ? 'bg-sky-950/80 border-sky-500/60 text-sky-300'
                    : 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                }`}>
                  <Zap className="w-3 h-3" />
                  <span>
                    CONTROL DISPOSITIVO (NIVEL {message.action.level ?? 1}): {message.action.deviceAction}
                  </span>
                </span>
                {message.action.summary && (
                  <span className="text-xs text-slate-300 font-rajdhani">
                    {message.action.summary}
                  </span>
                )}
                {onExecuteAction && (
                  <button
                    onClick={() => onExecuteAction(message.action)}
                    className="inline-flex items-center space-x-1 px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold transition-all cursor-pointer shadow-md"
                  >
                    <span>{message.action.level && message.action.level >= 2 ? 'Confirmar Acción' : 'Ejecutar'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : message.action.type === 'OPEN_DIAGNOSTICS' ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-cyan-950/80 border border-cyan-500/50 text-[11px] font-orbitron text-cyan-300">
                  <Globe className="w-3 h-3 text-cyan-400" />
                  <span>AUDITORÍA DE ACCESOS A INTERNET</span>
                </span>
                {onExecuteAction && (
                  <button
                    onClick={() => onExecuteAction(message.action)}
                    className="inline-flex items-center space-x-1 px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-semibold transition-all cursor-pointer shadow-md"
                  >
                    <span>Ver Panel de Diagnóstico</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-cyan-950/80 border border-cyan-500/50 text-[11px] font-orbitron text-cyan-300">
                  <Zap className="w-3 h-3 text-cyan-400" />
                  <span>
                    ACCIÓN: {message.action.type}{' '}
                    {message.action.app ? `(${message.action.app.toUpperCase()})` : ''}
                  </span>
                </div>

                {onExecuteAction && (
                  <button
                    onClick={() => onExecuteAction(message.action)}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-400/40 text-[11px] font-rajdhani font-semibold text-white transition-colors cursor-pointer"
                  >
                    <span>Desplegar</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Follow-up Quick Action Chips (Requirement 5) */}
        {isViernes && onFollowUpClick && !message.isStreaming && (
          <div className="mt-3 pt-2 border-t border-slate-800/60 flex flex-wrap gap-1.5">
            <button
              onClick={() => onFollowUpClick('Dame más detalles sobre esto')}
              className="px-2 py-0.5 rounded text-[10px] font-rajdhani font-semibold bg-slate-950/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-cyan-300 transition-colors"
            >
              + Más detalle
            </button>
            <button
              onClick={() => onFollowUpClick('Resume esto en una sola frase clave')}
              className="px-2 py-0.5 rounded text-[10px] font-rajdhani font-semibold bg-slate-950/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-cyan-300 transition-colors"
            >
              ⚡ Resúmelo
            </button>
            <button
              onClick={() => onFollowUpClick('Verifica esta información en la web con datos actuales')}
              className="px-2 py-0.5 rounded text-[10px] font-rajdhani font-semibold bg-slate-950/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-cyan-300 transition-colors"
            >
              🌐 Verifica en la web
            </button>
            <button
              onClick={handleSaveMemoryClick}
              className={`px-2 py-0.5 rounded text-[10px] font-rajdhani font-semibold border transition-colors flex items-center space-x-1 ${
                savedMemoryDone 
                  ? 'bg-emerald-950 border-emerald-400 text-emerald-300' 
                  : 'bg-slate-950/80 hover:bg-slate-800 border-slate-700 text-slate-300 hover:text-cyan-300'
              }`}
            >
              <BookmarkPlus className="w-2.5 h-2.5" />
              <span>{savedMemoryDone ? '¡Guardado en Memoria!' : 'Recuérdame esto'}</span>
            </button>
          </div>
        )}

        {/* Footer Toolbar: Voice Replay & Copy */}
        <div className="mt-2.5 pt-1.5 flex items-center justify-end space-x-3 text-[11px] text-slate-500">
          {isViernes && (
            <button
              onClick={handlePlayVoice}
              className={`flex items-center space-x-1 hover:text-cyan-300 transition-colors ${
                isPlayingAudio ? 'text-cyan-400 animate-pulse font-semibold' : ''
              }`}
              title="Escuchar respuesta"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{isPlayingAudio ? 'Reproduciendo...' : 'Escuchar'}</span>
            </button>
          )}

          <button
            onClick={handleCopy}
            className="flex items-center space-x-1 hover:text-cyan-300 transition-colors"
            title="Copiar texto"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
        </div>
      </div>

      {!isViernes && <AuraAvatar sender="user" />}
    </div>
  );
};
