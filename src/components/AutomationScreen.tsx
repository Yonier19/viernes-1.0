import React, { useState } from 'react';
import { 
  Layers, 
  Play, 
  Plus, 
  ExternalLink, 
  CheckCircle, 
  Clock, 
  Music, 
  MessageCircle, 
  Video, 
  MapPin, 
  Calendar, 
  Mail, 
  Calculator, 
  FileText, 
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2
} from 'lucide-react';
import { RoutineItem, OrbThemeColor } from '../types/assistant';
import { memoryStorage } from '../services/memoryStorage';

interface AutomationScreenProps {
  routines: RoutineItem[];
  onRoutinesUpdated: (routines: RoutineItem[]) => void;
  onExecuteAction: (action: any) => void;
  theme: OrbThemeColor;
}

export const AutomationScreen: React.FC<AutomationScreenProps> = ({
  routines,
  onRoutinesUpdated,
  onExecuteAction,
  theme,
}) => {
  const [isAddRoutineOpen, setIsAddRoutineOpen] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [newRoutineTrigger, setNewRoutineTrigger] = useState('');
  const [newRoutineDesc, setNewRoutineDesc] = useState('');

  const appLaunchers = [
    {
      id: 'youtube',
      name: 'YouTube',
      desc: 'Transmisión de vídeo y música',
      icon: Video,
      color: 'text-red-400 border-red-500/40 bg-red-950/20',
      action: { type: 'OPEN_APP', app: 'youtube' },
    },
    {
      id: 'spotify',
      name: 'Spotify',
      desc: 'Reproducción de listas y podcasts',
      icon: Music,
      color: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/20',
      action: { type: 'OPEN_APP', app: 'spotify' },
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      desc: 'Comunicaciones directas',
      icon: MessageCircle,
      color: 'text-green-400 border-green-500/40 bg-green-950/20',
      action: { type: 'OPEN_APP', app: 'whatsapp' },
    },
    {
      id: 'maps',
      name: 'Google Maps',
      desc: 'Navegación táctica y rutas GPS',
      icon: MapPin,
      color: 'text-amber-400 border-amber-500/40 bg-amber-950/20',
      action: { type: 'OPEN_APP', app: 'maps' },
    },
    {
      id: 'calendar',
      name: 'Google Calendar',
      desc: 'Agenda y eventos programados',
      icon: Calendar,
      color: 'text-blue-400 border-blue-500/40 bg-blue-950/20',
      action: { type: 'OPEN_APP', app: 'calendar' },
    },
    {
      id: 'gmail',
      name: 'Gmail',
      desc: 'Bandeja de correos y enlaces',
      icon: Mail,
      color: 'text-rose-400 border-rose-500/40 bg-rose-950/20',
      action: { type: 'OPEN_APP', app: 'gmail' },
    },
    {
      id: 'calculator',
      name: 'Calculadora HUD',
      desc: 'Cálculo aritmético instantáneo',
      icon: Calculator,
      color: 'text-cyan-400 border-cyan-500/40 bg-cyan-950/20',
      action: { type: 'OPEN_APP', app: 'calculator' },
    },
    {
      id: 'timer',
      name: 'Temporizador Táctico',
      desc: 'Alarma y cuenta regresiva activa',
      icon: Clock,
      color: 'text-purple-400 border-purple-500/40 bg-purple-950/20',
      action: { type: 'TIMER', seconds: 300, label: 'Temporizador de 5 Min' },
    },
    {
      id: 'notes',
      name: 'Notas Rápidas',
      desc: 'Bloc de notas sincronizado con Memoria',
      icon: FileText,
      color: 'text-teal-400 border-teal-500/40 bg-teal-950/20',
      action: { type: 'OPEN_APP', app: 'notes' },
    },
  ];

  const handleToggleRoutine = (id: string) => {
    const updated = memoryStorage.toggleRoutine(id);
    onRoutinesUpdated(updated);
  };

  const handleDeleteRoutine = (id: string) => {
    const updated = memoryStorage.deleteRoutine(id);
    onRoutinesUpdated(updated);
  };

  const handleExecuteRoutine = (routine: RoutineItem) => {
    onExecuteAction({
      type: 'ROUTINE',
      name: routine.name,
      steps: routine.steps,
    });
  };

  const handleCreateRoutine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoutineName.trim()) return;

    memoryStorage.saveRoutine({
      name: newRoutineName.trim(),
      triggerPhrase: newRoutineTrigger.trim() || newRoutineName.toLowerCase(),
      description: newRoutineDesc.trim() || 'Rutina personalizada de Viernes.',
      enabled: true,
      steps: [
        { id: '1', action: 'SPEAK', payload: `Iniciando rutina ${newRoutineName}.` },
      ],
    });

    onRoutinesUpdated(memoryStorage.getRoutines());
    setNewRoutineName('');
    setNewRoutineTrigger('');
    setNewRoutineDesc('');
    setIsAddRoutineOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full font-rajdhani">
      {/* Title */}
      <div className="mb-6">
        <h2 className="text-xl font-orbitron font-bold text-white flex items-center gap-2">
          <Layers className="w-6 h-6 text-cyan-400" />
          LANZADOR DE APPS & RUTINAS AUTOMATIZADAS
        </h2>
        <p className="text-xs text-slate-400">
          Control de integraciones, acceso rápido a servicios y secuencias de acciones guiadas por voz.
        </p>
      </div>

      {/* App Launcher Grid */}
      <div className="mb-8">
        <h3 className="text-sm font-orbitron font-semibold text-slate-200 mb-3 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>SERVICIOS Y APLICACIONES VINCULADAS</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {appLaunchers.map((app) => {
            const IconComponent = app.icon;
            return (
              <div
                key={app.id}
                onClick={() => onExecuteAction(app.action)}
                className={`p-3.5 rounded-xl border ${app.color} hover:scale-[1.02] cursor-pointer transition-all flex items-center justify-between group shadow-md`}
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700">
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-orbitron font-semibold text-white tracking-wide">
                      {app.name}
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-tight">{app.desc}</p>
                  </div>
                </div>

                <div className="p-1 rounded text-slate-400 group-hover:text-cyan-300">
                  <ExternalLink className="w-4 h-4" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Routines Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-orbitron font-semibold text-slate-200 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>RUTINAS DE ACCIÓN MULTI-PASO</span>
          </h3>

          <button
            onClick={() => setIsAddRoutineOpen(true)}
            className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-1 shadow-md transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nueva Rutina</span>
          </button>
        </div>

        <div className="space-y-3">
          {routines.map((routine) => (
            <div
              key={routine.id}
              className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md"
            >
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <h4 className="text-sm font-orbitron font-semibold text-white tracking-wide">
                    {routine.name}
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-cyan-300 border border-cyan-800 font-orbitron">
                    Disparador: &quot;{routine.triggerPhrase}&quot;
                  </span>
                </div>
                <p className="text-xs text-slate-400">{routine.description}</p>
                <div className="text-[11px] text-slate-500 mt-1">
                  Pasos configurados: {routine.steps?.length || 1} acción(es) secuencial(es)
                </div>
              </div>

              <div className="flex items-center space-x-2 self-end sm:self-auto">
                <button
                  onClick={() => handleExecuteRoutine(routine)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/60 border border-cyan-500/40 text-cyan-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Ejecutar</span>
                </button>

                <button
                  onClick={() => handleToggleRoutine(routine.id)}
                  className="p-1.5 text-slate-400 hover:text-cyan-300 transition-colors"
                  title={routine.enabled ? 'Desactivar rutina' : 'Activar rutina'}
                >
                  {routine.enabled ? (
                    <ToggleRight className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-slate-600" />
                  )}
                </button>

                <button
                  onClick={() => handleDeleteRoutine(routine.id)}
                  className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
                  title="Eliminar rutina"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Routine Modal */}
      {isAddRoutineOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-slate-950 border border-cyan-500/50 p-6 shadow-2xl font-rajdhani">
            <h3 className="text-base font-orbitron font-bold text-white mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-cyan-400" />
              NUEVA RUTINA TÁCTICA
            </h3>

            <form onSubmit={handleCreateRoutine} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nombre de la Rutina</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Modo Estudio, Salir de Casa..."
                  value={newRoutineName}
                  onChange={(e) => setNewRoutineName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Frase Disparadora por Voz</label>
                <input
                  type="text"
                  required
                  placeholder="ej. modo estudio, vamos a trabajar..."
                  value={newRoutineTrigger}
                  onChange={(e) => setNewRoutineTrigger(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Descripción</label>
                <textarea
                  rows={2}
                  placeholder="Explica qué ejecutará Viernes..."
                  value={newRoutineDesc}
                  onChange={(e) => setNewRoutineDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400 resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddRoutineOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
                >
                  Crear Rutina
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
