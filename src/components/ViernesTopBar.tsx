import React from 'react';
import { 
  Bot, 
  Cpu, 
  Shield, 
  Settings, 
  Brain, 
  Layers, 
  Radio, 
  BatteryMedium, 
  Sparkles,
  Volume2,
  VolumeX,
  Bell,
  Wifi,
  WifiOff,
  RefreshCw
} from 'lucide-react';
import { SystemTelemetry, OrbThemeColor } from '../types/assistant';

interface ViernesTopBarProps {
  activeTab: 'assistant' | 'memory' | 'automation' | 'permissions' | 'settings' | 'notifications';
  setActiveTab: (tab: 'assistant' | 'memory' | 'automation' | 'permissions' | 'settings' | 'notifications') => void;
  telemetry: SystemTelemetry;
  theme: OrbThemeColor;
  isMuted: boolean;
  onToggleMute: () => void;
  isResidentActive: boolean;
  onToggleResident: () => void;
  notificationsCount?: number;
  internetStatus?: 'ONLINE' | 'OFFLINE' | 'RECONNECTING';
}

export const ViernesTopBar: React.FC<ViernesTopBarProps> = ({
  activeTab,
  setActiveTab,
  telemetry,
  theme,
  isMuted,
  onToggleMute,
  isResidentActive,
  onToggleResident,
  notificationsCount = 0,
  internetStatus = 'ONLINE',
}) => {
  const themeAccent = {
    cyan: 'text-cyan-400 border-cyan-500/40 bg-cyan-950/30',
    amethyst: 'text-purple-400 border-purple-500/40 bg-purple-950/30',
    gold: 'text-amber-400 border-amber-500/40 bg-amber-950/30',
    emerald: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/30',
  }[theme];

  const activeTabClass = (tab: string) =>
    activeTab === tab
      ? `border-b-2 font-semibold shadow-sm ${themeAccent} text-white`
      : 'text-slate-400 hover:text-slate-200 border-b-2 border-transparent hover:bg-slate-900/40';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-cyan-900/30 bg-slate-950/85 backdrop-blur-md">
      {/* HUD Telemetry Upper Banner */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-slate-800/60 text-[11px] font-rajdhani text-slate-400">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="flex items-center space-x-1 text-cyan-400 font-semibold tracking-wider font-orbitron">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>F.R.I.D.A.Y. // VIERNES OS</span>
          </div>
          <span className="hidden sm:inline-block text-slate-600">|</span>
          <div className="hidden sm:flex items-center space-x-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-500" />
            <span>NÚCLEO: {telemetry.quantumSync}%</span>
          </div>

          <span className="text-slate-600">|</span>
          {/* Internet Status Indicator */}
          <div className="flex items-center space-x-1.5">
            {internetStatus === 'ONLINE' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-semibold hidden md:inline">EN LÍNEA</span>
              </>
            ) : internetStatus === 'RECONNECTING' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                <span className="text-amber-400 font-semibold">RECONECTANDO</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
                <span className="text-red-400 font-semibold">SIN CONEXIÓN (LOCAL)</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Botón de Pánico (Fase 5) */}
          <button
            onClick={async () => {
              if (window.electronAPI?.panicDisableDeviceControl) {
                await window.electronAPI.panicDisableDeviceControl('Pulsado desde la barra de telemetría HUD');
              }
              alert('🚨 ¡BOTÓN DE PÁNICO ACTIVADO! El control del dispositivo ha sido deshabilitado de inmediato.');
            }}
            className="flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold tracking-wide transition-all bg-red-950/70 hover:bg-red-900 border border-red-500/60 text-red-300 hover:text-white cursor-pointer shadow-sm shadow-red-950"
            title="Desactiva inmediatamente todo el control del dispositivo y cancela acciones pendientes"
          >
            <span className="w-2 h-2 rounded-full bg-red-400 animate-ping mr-0.5" />
            <span>PÁNICO</span>
          </button>

          {/* Resident Mode Toggle */}
          <button
            onClick={onToggleResident}
            className={`flex items-center space-x-1.5 px-2 py-0.5 rounded text-[11px] transition-all border ${
              isResidentActive
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Activa el modo continuo o en segundo plano"
          >
            <Radio className={`w-3 h-3 ${isResidentActive ? 'animate-pulse text-emerald-400' : ''}`} />
            <span className="hidden sm:inline">{isResidentActive ? 'RESIDENTE ACTIVO' : 'RESIDENTE OFF'}</span>
          </button>

          {/* Sound Mute Button */}
          <button
            onClick={onToggleMute}
            className="p-1 rounded text-slate-400 hover:text-cyan-300 transition-colors"
            title={isMuted ? 'Activar voz de Viernes' : 'Silenciar voz'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5 text-cyan-400" />}
          </button>

          <div className="flex items-center space-x-1">
            <BatteryMedium className="w-3.5 h-3.5 text-cyan-400" />
            <span>{telemetry.battery}%</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-2 gap-2">
        {/* Brand identity */}
        <div className="flex items-center space-x-3 self-start sm:self-auto">
          <div className="relative w-9 h-9 rounded-lg bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center glow-cyan">
            <Bot className="w-5 h-5 text-cyan-300" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-orbitron font-bold text-white tracking-wider flex items-center gap-2">
              VIERNES
              <span className="text-[10px] font-rajdhani px-1.5 py-0.2 rounded bg-cyan-900/40 text-cyan-300 border border-cyan-500/30">
                v4.2 STARK
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 font-rajdhani">
              Inteligencia Táctica & Asistencia Proactiva
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto scrollbar-none py-1">
          <button
            onClick={() => setActiveTab('assistant')}
            className={`px-3 py-1.5 rounded-t text-xs font-rajdhani tracking-wide flex items-center space-x-1.5 transition-all ${activeTabClass(
              'assistant'
            )}`}
          >
            <Bot className="w-4 h-4" />
            <span>Asistente</span>
          </button>

          {/* Notifications Tab with Counter Badge */}
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-3 py-1.5 rounded-t text-xs font-rajdhani tracking-wide flex items-center space-x-1.5 transition-all relative ${activeTabClass(
              'notifications'
            )}`}
          >
            <Bell className="w-4 h-4" />
            <span>Notificaciones</span>
            {notificationsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white font-orbitron text-[9px] font-bold animate-pulse">
                {notificationsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('memory')}
            className={`px-3 py-1.5 rounded-t text-xs font-rajdhani tracking-wide flex items-center space-x-1.5 transition-all ${activeTabClass(
              'memory'
            )}`}
          >
            <Brain className="w-4 h-4" />
            <span>Memoria</span>
          </button>

          <button
            onClick={() => setActiveTab('automation')}
            className={`px-3 py-1.5 rounded-t text-xs font-rajdhani tracking-wide flex items-center space-x-1.5 transition-all ${activeTabClass(
              'automation'
            )}`}
          >
            <Layers className="w-4 h-4" />
            <span>Automatización</span>
          </button>

          <button
            onClick={() => setActiveTab('permissions')}
            className={`px-3 py-1.5 rounded-t text-xs font-rajdhani tracking-wide flex items-center space-x-1.5 transition-all ${activeTabClass(
              'permissions'
            )}`}
          >
            <Shield className="w-4 h-4" />
            <span>Seguridad</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 rounded-t text-xs font-rajdhani tracking-wide flex items-center space-x-1.5 transition-all ${activeTabClass(
              'settings'
            )}`}
          >
            <Settings className="w-4 h-4" />
            <span>Ajustes</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
