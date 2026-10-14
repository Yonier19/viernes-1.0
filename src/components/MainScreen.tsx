import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  MicOff, 
  Send, 
  Sparkles, 
  Trash2, 
  Globe,
  Clock,
  Cpu,
  Brain
} from 'lucide-react';
import { ChatMessage, ListeningState, AISettings } from '../types/assistant';
import { ViernesOrb } from './ViernesOrb';
import { ChatMessageItem } from './ChatMessageItem';

interface MainScreenProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  listeningState: ListeningState;
  onToggleListening: () => void;
  onClearChat: () => void;
  settings: AISettings;
  onExecuteAction: (action: any) => void;
  transcriptInterim: string;
  thinkingStatus?: string;
  onFollowUpClick?: (prompt: string) => void;
  onSaveToMemory?: (content: string) => void;
}

export const MainScreen: React.FC<MainScreenProps> = ({
  messages,
  onSendMessage,
  listeningState,
  onToggleListening,
  onClearChat,
  settings,
  onExecuteAction,
  transcriptInterim,
  thinkingStatus,
  onFollowUpClick,
  onSaveToMemory,
}) => {
  const [inputText, setInputText] = useState('');
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, listeningState, thinkingStatus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const sampleSuggestions = [
    '¿Qué noticias hay de tecnología hoy?',
    '¿Cómo está el clima en Madrid ahora?',
    'Calcula el 15% de 800 más 45',
    'Pon un temporizador de 5 minutos',
    '¿Qué sabes de mis preferencias?',
    'Escribe una función en TypeScript para invertir texto',
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {/* Upper Section: Holographic Viernes Orb & Command Hub */}
      <div className="flex flex-col items-center justify-center pt-3 pb-2 px-4 shrink-0 relative">
        <ViernesOrb
          state={listeningState}
          theme={settings.orbTheme}
          size={190}
          onClick={onToggleListening}
        />

        {/* Live speech transcription badge when speaking */}
        {listeningState === 'LISTENING' && transcriptInterim && (
          <div className="mt-2 px-4 py-1.5 rounded-full bg-red-950/70 border border-red-500/50 text-red-200 text-xs font-rajdhani flex items-center space-x-2 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
            <span>Escuchando: &quot;{transcriptInterim}&quot;</span>
          </div>
        )}

        {/* Live Thinking / Searching Web status indicator (Requirement 5) */}
        {listeningState === 'THINKING' && (
          <div className="mt-2 px-4 py-1.5 rounded-full bg-cyan-950/80 border border-cyan-400/50 text-cyan-200 text-xs font-orbitron flex items-center space-x-2 animate-pulse shadow-md shadow-cyan-950">
            {thinkingStatus && thinkingStatus.toLowerCase().includes('web') ? (
              <Globe className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
            ) : thinkingStatus && thinkingStatus.toLowerCase().includes('local') ? (
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            ) : (
              <Brain className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            )}
            <span>{thinkingStatus || 'Pensando respuesta táctica...'}</span>
          </div>
        )}

        {/* Quick action chips */}
        <div className="w-full max-w-3xl mt-3 flex items-center space-x-2 overflow-x-auto scrollbar-none py-1 px-2">
          {sampleSuggestions.map((sugg, idx) => (
            <button
              key={idx}
              onClick={() => onSendMessage(sugg)}
              className="shrink-0 px-3 py-1 rounded-full bg-slate-900/80 hover:bg-cyan-950/80 border border-slate-700/80 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-200 text-xs font-rajdhani transition-all flex items-center space-x-1.5 backdrop-blur-sm"
            >
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>{sugg}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Middle Section: Chat Logs */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 max-w-4xl w-full mx-auto" ref={chatScrollRef}>
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 font-rajdhani">
            <div className="w-14 h-14 rounded-full bg-cyan-950/30 border border-cyan-800/40 flex items-center justify-center mb-3 text-cyan-400">
              <Sparkles className="w-7 h-7" />
            </div>
            <h3 className="font-orbitron font-semibold text-white text-base mb-1">
              PROTOCOLOS DE ASISTENCIA LISTOS
            </h3>
            <p className="text-xs max-w-md text-slate-400 mb-4">
              Puedes hablar diciendo &quot;Oye Viernes&quot;, tocar el orbe central, o escribir tu comando en la consola inferior.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/60 text-xs font-rajdhani text-slate-400">
              <span>Registro de Sesión Activa</span>
              <button
                onClick={onClearChat}
                className="flex items-center space-x-1 text-slate-500 hover:text-red-400 transition-colors"
                title="Limpiar registro"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpiar</span>
              </button>
            </div>

            {messages.map((msg) => (
              <ChatMessageItem
                key={msg.id}
                message={msg}
                theme={settings.orbTheme}
                onExecuteAction={onExecuteAction}
                onFollowUpClick={onFollowUpClick}
                onSaveToMemory={onSaveToMemory}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Command Bar */}
      <div className="p-3 sm:p-4 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-md shrink-0">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex items-center space-x-2">
          {/* Mic Button */}
          <button
            type="button"
            onClick={onToggleListening}
            className={`p-2.5 rounded-xl border transition-all ${
              listeningState === 'LISTENING'
                ? 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-950 animate-pulse'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50'
            }`}
            title={listeningState === 'LISTENING' ? 'Detener escucha' : 'Activar reconocimiento vocal'}
          >
            {listeningState === 'LISTENING' ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Text Input */}
          <div className="relative flex-1">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder='Escribe tu comando o consulta ("¿Qué tiempo hace?", "Calcula...", "Pon alarma")...'
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 focus:border-cyan-400 text-slate-100 placeholder-slate-500 text-sm font-rajdhani focus:outline-none focus:ring-1 focus:ring-cyan-500/50 shadow-inner"
            />
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:hover:bg-cyan-600 text-white font-semibold transition-all shadow-md shadow-cyan-950"
            title="Enviar comando"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};
