import React, { useState } from 'react';
import { 
  Bell, 
  Volume2, 
  Sparkles, 
  Trash2, 
  Check, 
  Clock, 
  MessageCircle, 
  Mail, 
  Chrome, 
  ShieldCheck, 
  ExternalLink,
  Filter,
  Radio,
  CheckCircle2
} from 'lucide-react';
import { WindowsNotification, OrbThemeColor } from '../types/assistant';
import { audioService } from '../services/audioService';

interface NotificationsPanelProps {
  notifications: WindowsNotification[];
  onClearNotifications: () => void;
  onDismissNotification: (id: string) => void;
  onSummarizeNotifications: () => void;
  theme: OrbThemeColor;
  isEnabled: boolean;
  onToggleEnabled: () => void;
}

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  notifications,
  onClearNotifications,
  onDismissNotification,
  onSummarizeNotifications,
  theme,
  isEnabled,
  onToggleEnabled,
}) => {
  const [selectedApp, setSelectedApp] = useState<string>('ALL');

  // Extract unique apps for filter tabs
  const apps = ['ALL', ...Array.from(new Set(notifications.map((n) => n.app)))];

  const filtered = notifications.filter((n) => selectedApp === 'ALL' || n.app === selectedApp);

  const handleReadAloud = (notif?: WindowsNotification) => {
    if (notif) {
      audioService.speak(`Notificación de ${notif.app}. ${notif.title}: ${notif.text}`);
    } else if (notifications.length > 0) {
      const summaryText = notifications
        .slice(0, 5)
        .map((n, i) => `Notificación ${i + 1} de ${n.app}. ${n.title}: ${n.text}.`)
        .join(' ');
      audioService.speak(`Tienes ${notifications.length} notificaciones registradas. ` + summaryText);
    } else {
      audioService.speak('No tienes notificaciones pendientes en este momento, jefe.');
    }
  };

  const getAppBadgeColor = (app: string) => {
    const lower = app.toLowerCase();
    if (lower.includes('whatsapp')) return 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300';
    if (lower.includes('outlook') || lower.includes('correo') || lower.includes('mail')) return 'bg-blue-950/70 border-blue-500/50 text-blue-300';
    if (lower.includes('chrome')) return 'bg-amber-950/70 border-amber-500/50 text-amber-300';
    if (lower.includes('telegram')) return 'bg-sky-950/70 border-sky-500/50 text-sky-300';
    if (lower.includes('discord')) return 'bg-indigo-950/70 border-indigo-500/50 text-indigo-300';
    return 'bg-cyan-950/70 border-cyan-500/50 text-cyan-300';
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full font-rajdhani">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-orbitron font-bold text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-cyan-400" />
            CENTRO DE NOTIFICACIONES DE WINDOWS
          </h2>
          <p className="text-xs text-slate-400">
            Monitoreo en tiempo real de avisos del sistema (WhatsApp, correos, alertas) mediante base local wpndatabase.
          </p>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onToggleEnabled}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              isEnabled
                ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300 shadow-md shadow-emerald-950'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Activar o pausar la lectura de notificaciones"
          >
            <Radio className={`w-3.5 h-3.5 ${isEnabled ? 'text-emerald-400 animate-pulse' : ''}`} />
            <span>{isEnabled ? 'Monitoreo Activo' : 'Monitoreo Pausado'}</span>
          </button>

          <button
            onClick={() => handleReadAloud()}
            disabled={notifications.length === 0}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-cyan-950 transition-all"
            title="Leer todas las notificaciones en voz alta"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Leer en Voz Alta</span>
          </button>

          <button
            onClick={onSummarizeNotifications}
            disabled={notifications.length === 0}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-purple-950 transition-all"
            title="Resumir con Inteligencia Artificial"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-200" />
            <span>Resumir con Viernes</span>
          </button>

          {notifications.length > 0 && (
            <button
              onClick={onClearNotifications}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-400 hover:text-red-400 transition-colors"
              title="Borrar todas"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Privacy Notice Banner */}
      <div className="p-3.5 rounded-xl bg-slate-900/90 border border-cyan-900/40 mb-5 flex items-start space-x-3 text-xs text-slate-300">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-white">Privacidad y Procesamiento 100% Local:</span> Las notificaciones se leen directamente en tu PC consultando la base de datos de Windows en modo solo lectura. Nunca se envían a la nube de forma automática; únicamente se transmiten fragmentos cuando solicitas explícitamente un resumen a Viernes.
        </div>
      </div>

      {/* Filter Chips by App */}
      {apps.length > 1 && (
        <div className="flex items-center space-x-2 overflow-x-auto scrollbar-none pb-3 mb-3">
          <Filter className="w-4 h-4 text-slate-500 shrink-0" />
          {apps.map((app) => (
            <button
              key={app}
              onClick={() => setSelectedApp(app)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                selectedApp === app
                  ? 'bg-cyan-950 border-cyan-400 text-cyan-200 shadow-sm'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {app === 'ALL' ? 'Todas' : app}
            </button>
          ))}
        </div>
      )}

      {/* Notification Cards List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800">
          <Bell className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <h4 className="text-sm font-orbitron font-semibold text-slate-300">Sin notificaciones pendientes</h4>
          <p className="text-slate-500 text-xs max-w-sm mx-auto mt-1">
            Cualquier nueva notificación de WhatsApp, correos o alertas de Windows aparecerá aquí automáticamente para ser leída o resumida por Viernes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md group"
            >
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-orbitron font-semibold border ${getAppBadgeColor(item.app)}`}>
                    {item.app}
                  </span>
                  <span className="text-xs text-slate-500 flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                </div>

                {item.title && (
                  <h4 className="text-sm font-orbitron font-semibold text-white tracking-wide mb-0.5">
                    {item.title}
                  </h4>
                )}
                <p className="text-xs text-slate-300 leading-relaxed font-rajdhani">{item.text || '(Sin contenido de texto)'}</p>
              </div>

              <div className="flex items-center space-x-2 self-end sm:self-auto shrink-0">
                <button
                  onClick={() => handleReadAloud(item)}
                  className="px-2.5 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/60 text-cyan-300 text-xs flex items-center space-x-1 transition-colors"
                  title="Leer esta notificación"
                >
                  <Volume2 className="w-3 h-3" />
                  <span>Leer</span>
                </button>

                <button
                  onClick={() => onDismissNotification(item.id)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
                  title="Descartar"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
