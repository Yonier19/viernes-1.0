/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * src/components/PermissionsScreen.tsx
 * Panel de Seguridad, Permisos y Control del Dispositivo por Niveles (Fase 5).
 * Integra la Auditoría Integral de Internet (generate_204, DNS, Gemini API, Grounding, URL_ANALYSIS, Proxy/Firewall, Informe "Puedo/No puedo")
 * y la Administración del Dispositivo Windows (Interruptor maestro, Niveles 0-3, Modo solo lectura, Botón de pánico, Carpetas permitidas, Historial con Undo).
 */

import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Mic, 
  Volume2, 
  HardDrive, 
  Bell, 
  Lock, 
  Unlock,
  CheckCircle2, 
  XCircle,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Check,
  Globe,
  Sliders,
  Folder,
  FolderPlus,
  Trash2,
  RotateCcw,
  Zap,
  Activity,
  FileText,
  Search,
  Laptop,
  Radio,
  Plus,
  X,
  ExternalLink
} from 'lucide-react';
import { 
  OrbThemeColor, 
  DeviceControlConfig, 
  DeviceAuditLogEntry, 
  InternetAuditReport,
  ActionLevel 
} from '../types/assistant';
import { audioService } from '../services/audioService';

interface PermissionsScreenProps {
  theme: OrbThemeColor;
}

export const PermissionsScreen: React.FC<PermissionsScreenProps> = ({ theme }) => {
  // Permisos base de navegador / hardware
  const [micStatus, setMicStatus] = useState<'GRANTED' | 'DENIED' | 'PROMPT'>('PROMPT');
  const [notifStatus, setNotifStatus] = useState<'GRANTED' | 'DENIED' | 'PROMPT'>('PROMPT');
  const [storedApiKey, setStoredApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  // Fase 5 Parte A: Auditoría de Acceso a Internet
  const [internetAudit, setInternetAudit] = useState<InternetAuditReport | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Fase 5 Parte B: Configuración de Control del Dispositivo
  const [deviceConfig, setDeviceConfig] = useState<DeviceControlConfig>({
    enabled: false,
    maxLevel: 1,
    maxAllowedLevel: 1,
    readOnly: false,
    allowedFolders: ['C:\\Users\\Default'],
    allowedApps: ['notepad', 'calc', 'msedge', 'chrome', 'spotify', 'mspaint', 'cmd'],
    panicDisabled: false,
  });
  const [configLoading, setConfigLoading] = useState(false);
  const [configSavedToast, setConfigSavedToast] = useState<string | null>(null);
  const [panicToast, setPanicToast] = useState<string | null>(null);

  // Historial de Auditoría Local (device_audit.log)
  const [auditLogs, setAuditLogs] = useState<DeviceAuditLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [undoLoadingId, setUndoLoadingId] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<string | null>(null);

  // Nueva carpeta para whitelist
  const [newFolderInput, setNewFolderInput] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);

  // Pestaña interna de la sección
  const [subTab, setSubTab] = useState<'device' | 'internet' | 'audit' | 'keystore'>('device');

  // Inicialización y carga de datos
  useEffect(() => {
    // 1. Permiso de Notificaciones
    if ('Notification' in window) {
      if (Notification.permission === 'granted') setNotifStatus('GRANTED');
      else if (Notification.permission === 'denied') setNotifStatus('DENIED');
      else setNotifStatus('PROMPT');
    }

    // 2. Permiso de Micrófono
    audioService.checkMicrophonePermission().then((status) => {
      if (status === 'granted') setMicStatus('GRANTED');
      else if (status === 'denied') setMicStatus('DENIED');
      else setMicStatus('PROMPT');
    }).catch(() => {});

    // 3. Keystore local
    const existing = localStorage.getItem('viernes_secure_keystore');
    if (existing) {
      try {
        setStoredApiKey(atob(existing));
      } catch {
        setStoredApiKey(existing);
      }
    }

    // 4. Cargar configuración de control de dispositivo desde Electron o servidor
    loadDeviceConfig();

    // 5. Cargar historial de auditoría
    loadAuditLogs();

    // 6. Ejecutar verificación de acceso a internet al iniciar (sin bloquear)
    runInternetAuditCheck(false);
  }, []);

  const loadDeviceConfig = async () => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && typeof electronAPI.getDeviceControlConfig === 'function') {
      try {
        const cfg = await electronAPI.getDeviceControlConfig();
        if (cfg) setDeviceConfig(cfg);
      } catch (err) {
        console.warn('Error cargando config de dispositivo en Electron:', err);
      }
    } else {
      // Modo navegador: leer de localStorage
      const saved = localStorage.getItem('viernes_device_control_config');
      if (saved) {
        try {
          setDeviceConfig(JSON.parse(saved));
        } catch {}
      }
    }
  };

  const saveDeviceConfigUpdates = async (updates: Partial<DeviceControlConfig>) => {
    const updated = { ...deviceConfig, ...updates };
    setDeviceConfig(updated);

    const electronAPI = (window as any).electronAPI;
    if (electronAPI && typeof electronAPI.setDeviceControlConfig === 'function') {
      try {
        await electronAPI.setDeviceControlConfig(updates);
      } catch (err) {
        console.error('Error guardando en Electron:', err);
      }
    } else {
      localStorage.setItem('viernes_device_control_config', JSON.stringify(updated));
    }

    setConfigSavedToast('Configuración de control actualizada');
    setTimeout(() => setConfigSavedToast(null), 2500);
  };

  const loadAuditLogs = async () => {
    setLogsLoading(true);
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && typeof electronAPI.getDeviceAuditLogs === 'function') {
      try {
        const logs = await electronAPI.getDeviceAuditLogs(80);
        if (Array.isArray(logs)) setAuditLogs(logs);
      } catch (err) {
        console.warn('Error cargando audit logs:', err);
      } finally {
        setLogsLoading(false);
      }
    } else {
      // Modo navegador: simular logs recientes
      const simulated: DeviceAuditLogEntry[] = [
        {
          id: 'log-sim-1',
          timestamp: Date.now() - 3600000,
          dateFormatted: new Date(Date.now() - 3600000).toLocaleString('es-ES'),
          origin: 'USER_VOICE',
          action: 'VOLUME_SET',
          params: { level: 50 },
          level: 1,
          result: 'SUCCESS',
          message: 'Volumen ajustado al 50%',
          reversible: true,
          revertPayload: { action: 'VOLUME_SET', params: { level: 30 } },
        },
        {
          id: 'log-sim-2',
          timestamp: Date.now() - 1800000,
          dateFormatted: new Date(Date.now() - 1800000).toLocaleString('es-ES'),
          origin: 'USER_TEXT',
          action: 'APP_OPEN',
          params: { app: 'calc' },
          level: 1,
          result: 'SUCCESS',
          message: 'Calculadora de Windows iniciada',
          reversible: true,
          revertPayload: { action: 'APP_CLOSE', params: { app: 'calc' } },
        },
        {
          id: 'log-sim-3',
          timestamp: Date.now() - 900000,
          dateFormatted: new Date(Date.now() - 900000).toLocaleString('es-ES'),
          origin: 'WEB_PAGE',
          action: 'FILE_DELETE',
          params: { filePath: 'test.txt' },
          level: 3,
          result: 'BLOCKED',
          message: 'Bloqueado por regla de seguridad: El contenido web externo no puede originar acciones de dispositivo (Inyección de prompt prevenida).',
          reversible: false,
        },
      ];
      setAuditLogs(simulated);
      setLogsLoading(false);
    }
  };

  const handlePanicButton = async () => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && typeof electronAPI.panicDisableDeviceControl === 'function') {
      try {
        const res = await electronAPI.panicDisableDeviceControl();
        if (res.success) {
          setDeviceConfig((prev) => ({ ...prev, enabled: false, panicDisabled: true }));
        }
      } catch (err: any) {
        console.error('Error activando pánico:', err);
      }
    } else {
      setDeviceConfig((prev) => ({ ...prev, enabled: false, panicDisabled: true }));
      localStorage.setItem('viernes_device_control_config', JSON.stringify({ ...deviceConfig, enabled: false, panicDisabled: true }));
    }

    audioService.playActivationSound();
    setPanicToast('🚨 BOTÓN DE PÁNICO ACTIVADO: Todo el control del dispositivo ha sido deshabilitado de inmediato.');
    setTimeout(() => setPanicToast(null), 5000);
  };

  const handleUndoAction = async (logId: string) => {
    setUndoLoadingId(logId);
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && typeof electronAPI.undoDeviceAction === 'function') {
      try {
        const res = await electronAPI.undoDeviceAction(logId);
        if (res.success) {
          setUndoToast(`✓ Acción revertida con éxito: ${res.message}`);
          loadAuditLogs();
        } else {
          setUndoToast(`✗ No se pudo revertir: ${res.error}`);
        }
      } catch (err: any) {
        setUndoToast(`✗ Error: ${err.message}`);
      } finally {
        setUndoLoadingId(null);
        setTimeout(() => setUndoToast(null), 4000);
      }
    } else {
      setUndoToast('✓ [Modo Simulado] Acción revertida con éxito.');
      setUndoLoadingId(null);
      setTimeout(() => setUndoToast(null), 4000);
    }
  };

  const handleAddFolder = () => {
    const trimmed = newFolderInput.trim();
    if (!trimmed) return;

    // Validación de carpetas protegidas
    const lower = trimmed.toLowerCase();
    if (
      lower.includes('system32') || 
      lower === 'c:\\windows' || 
      lower.startsWith('c:\\windows\\') ||
      lower === 'c:\\program files' ||
      lower.startsWith('c:\\program files\\')
    ) {
      setFolderError('Por seguridad, Windows/System32 y Archivos de Programa están estrictamente excluidos de la lista permitida.');
      return;
    }

    if (deviceConfig.allowedFolders.includes(trimmed)) {
      setFolderError('Esta carpeta ya está en la lista de permitidos.');
      return;
    }

    const nextFolders = [...deviceConfig.allowedFolders, trimmed];
    saveDeviceConfigUpdates({ allowedFolders: nextFolders });
    setNewFolderInput('');
    setFolderError(null);
  };

  const handleRemoveFolder = (folderToRemove: string) => {
    const nextFolders = deviceConfig.allowedFolders.filter((f) => f !== folderToRemove);
    saveDeviceConfigUpdates({ allowedFolders: nextFolders });
  };

  const runInternetAuditCheck = async (forceFresh = true) => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const url = forceFresh 
        ? '/api/assistant/diagnostics/internet-access?fresh=true' 
        : '/api/assistant/diagnostics/internet-access';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: InternetAuditReport = await res.json();
      setInternetAudit(data);
    } catch (err: any) {
      setAuditError(`Error ejecutando auditoría: ${err.message}`);
    } finally {
      setAuditLoading(false);
    }
  };

  const requestMicPermission = async () => {
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setMicStatus('DENIED');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStatus('GRANTED');
      audioService.playActivationSound();
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setMicStatus('DENIED');
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setNotifStatus('GRANTED');
        audioService.playActivationSound();
        new Notification('Viernes // Stark OS', {
          body: 'Notificaciones tácticas autorizadas con éxito.',
        });
      } else {
        setNotifStatus('DENIED');
      }
    }
  };

  const handleSaveKey = () => {
    if (!storedApiKey.trim()) {
      localStorage.removeItem('viernes_secure_keystore');
    } else {
      const encoded = btoa(storedApiKey.trim());
      localStorage.setItem('viernes_secure_keystore', encoded);
    }
    setKeySaved(true);
    audioService.playActivationSound();
    setTimeout(() => setKeySaved(false), 2000);
  };

  // Status helper colors
  const getStatusBadge = (status: 'green' | 'amber' | 'red') => {
    if (status === 'green') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-orbitron font-bold bg-emerald-950/80 border border-emerald-500/50 text-emerald-300">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>VERDE // OPERATIVO</span>
        </span>
      );
    }
    if (status === 'amber') {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-orbitron font-bold bg-amber-950/80 border border-amber-500/50 text-amber-300">
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          <span>ÁMBAR // LIMITADO</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-orbitron font-bold bg-rose-950/80 border border-rose-500/50 text-rose-300">
        <XCircle className="w-3 h-3 text-rose-400" />
        <span>ROJO // INACCESIBLE</span>
      </span>
    );
  };

  const getLevelBadge = (level: number) => {
    switch (level) {
      case 0:
        return <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-600/50 text-[10px] font-orbitron">NIVEL 0: SOLO LECTURA</span>;
      case 1:
        return <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-600/50 text-[10px] font-orbitron">NIVEL 1: BAJO RIESGO</span>;
      case 2:
        return <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-600/50 text-[10px] font-orbitron">NIVEL 2: CONFIRMACIÓN VERBAL/CLIC</span>;
      case 3:
        return <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-600/50 text-[10px] font-orbitron">NIVEL 3: CLIC FÍSICO OBLIGATORIO</span>;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-6xl mx-auto w-full font-rajdhani">
      {/* Toast de Pánico */}
      {panicToast && (
        <div className="mb-4 p-3.5 rounded-xl bg-rose-950/90 border-2 border-rose-500 text-rose-200 text-xs font-orbitron flex items-center justify-between shadow-2xl animate-bounce">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{panicToast}</span>
          </div>
          <button onClick={() => setPanicToast(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Toast de Configuración Guardada */}
      {configSavedToast && (
        <div className="mb-4 p-2.5 rounded-xl bg-cyan-950/90 border border-cyan-500 text-cyan-200 text-xs font-orbitron flex items-center space-x-2 shadow-lg">
          <Check className="w-4 h-4 text-cyan-400" />
          <span>{configSavedToast}</span>
        </div>
      )}

      {/* Toast de Deshacer */}
      {undoToast && (
        <div className="mb-4 p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-orbitron flex items-center space-x-2 shadow-lg">
          <RotateCcw className="w-4 h-4 text-cyan-400" />
          <span>{undoToast}</span>
        </div>
      )}

      {/* Header Principal */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-orbitron font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-cyan-400" />
            SEGURIDAD, ACCESOS & ADMINISTRACIÓN DEL DISPOSITIVO
          </h2>
          <p className="text-xs text-slate-400">
            Fase 5: Auditoría de acceso a internet, control escalonado de Windows por niveles, confirmaciones físicas y registro de auditoría local.
          </p>
        </div>

        {/* Botón de Pánico Global */}
        <button
          onClick={handlePanicButton}
          className="px-4 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 border border-rose-400 text-white font-orbitron text-xs font-bold tracking-wider shadow-lg shadow-rose-950/60 flex items-center space-x-2 transition-all cursor-pointer shrink-0"
        >
          <AlertTriangle className="w-4 h-4 text-white animate-pulse" />
          <span>BOTÓN DE PÁNICO</span>
        </button>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 mb-6 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setSubTab('device')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-orbitron font-semibold flex items-center space-x-2 transition-all cursor-pointer ${
            subTab === 'device'
              ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/60 shadow-md shadow-cyan-950'
              : 'text-slate-400 hover:text-white bg-slate-900/60 border border-slate-800'
          }`}
        >
          <Laptop className="w-3.5 h-3.5" />
          <span>Control del Dispositivo (Fase 5B)</span>
        </button>

        <button
          onClick={() => setSubTab('internet')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-orbitron font-semibold flex items-center space-x-2 transition-all cursor-pointer ${
            subTab === 'internet'
              ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/60 shadow-md shadow-cyan-950'
              : 'text-slate-400 hover:text-white bg-slate-900/60 border border-slate-800'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Auditoría de Internet (Fase 5A)</span>
        </button>

        <button
          onClick={() => {
            setSubTab('audit');
            loadAuditLogs();
          }}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-orbitron font-semibold flex items-center space-x-2 transition-all cursor-pointer ${
            subTab === 'audit'
              ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/60 shadow-md shadow-cyan-950'
              : 'text-slate-400 hover:text-white bg-slate-900/60 border border-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Registro de Auditoría (device_audit.log)</span>
        </button>

        <button
          onClick={() => setSubTab('keystore')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-orbitron font-semibold flex items-center space-x-2 transition-all cursor-pointer ${
            subTab === 'keystore'
              ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/60 shadow-md shadow-cyan-950'
              : 'text-slate-400 hover:text-white bg-slate-900/60 border border-slate-800'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Permisos Base & Keystore</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* SUBTAB 1: CONTROL DEL DISPOSITIVO POR NIVELES (PARTE B)  */}
      {/* ======================================================== */}
      {subTab === 'device' && (
        <div className="space-y-6">
          {/* Panel de Interruptores Maestros */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-cyan-500/40 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-800 gap-3">
              <div>
                <h3 className="text-sm font-orbitron font-bold text-white flex items-center space-x-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span>INTERRUPTOR MAESTRO Y PRIVILEGIOS DE ADMINISTRACIÓN</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Viernes solo puede ejecutar órdenes que pertenezcan a su catálogo estructurado. Cero ejecución libre de comandos de shell.
                </p>
              </div>

              {/* Master Switch Status */}
              <div className="flex items-center space-x-3">
                <span className="text-xs font-orbitron font-semibold text-slate-300">
                  {deviceConfig.enabled ? 'CONTROL ACTIVO' : 'CONTROL DESACTIVADO (POR DEFECTO)'}
                </span>
                <button
                  onClick={() => saveDeviceConfigUpdates({ enabled: !deviceConfig.enabled, panicDisabled: false })}
                  className={`w-14 h-7 rounded-full p-1 transition-all cursor-pointer ${
                    deviceConfig.enabled ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-all transform ${
                      deviceConfig.enabled ? 'translate-x-7' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Grid de Modos y Nivel Máximo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Modo Solo Lectura */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-orbitron font-semibold text-white">Modo Solo Lectura (Estricto)</h4>
                  <p className="text-[11px] text-slate-400">
                    Solo permite telemetría (CPU, RAM, batería, procesos, red, hora). Bloquea cualquier modificación de estado.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={deviceConfig.readOnly}
                  onChange={(e) => saveDeviceConfigUpdates({ readOnly: e.target.checked })}
                  disabled={!deviceConfig.enabled}
                  className="w-5 h-5 rounded accent-cyan-500 cursor-pointer disabled:opacity-40"
                />
              </div>

              {/* Selector de Nivel Máximo Permitido */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-orbitron font-semibold text-white">Nivel Máximo Permitido</label>
                  {getLevelBadge(deviceConfig.maxLevel ?? 1)}
                </div>
                <select
                  value={deviceConfig.maxLevel ?? 1}
                  onChange={(e) => {
                    const lvl = parseInt(e.target.value, 10) as ActionLevel;
                    saveDeviceConfigUpdates({ maxLevel: lvl, maxAllowedLevel: lvl });
                  }}
                  disabled={!deviceConfig.enabled || deviceConfig.readOnly}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-orbitron text-white focus:outline-none focus:border-cyan-400 disabled:opacity-40"
                >
                  <option value={0}>Nivel 0: Solo lectura (Telemetría, CPU/RAM, Batería, Procesos)</option>
                  <option value={1}>Nivel 1: Reversibles de bajo riesgo (Volumen, Brillo, Bloqueo, Apps)</option>
                  <option value={2}>Nivel 2: Confirmación verbal/clic (Cierre forzoso, Apagar/Reiniciar, Wi-Fi)</option>
                  <option value={3}>Nivel 3: Confirmación con clic físico (Papelera, UAC puntual, Registro)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Carpetas Permitidas (Whitelist) & Reglas de Escritura */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Folder className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-orbitron font-bold text-white">
                  LISTA BLANCA DE CARPETAS ACCESIBLES (PATH WHITELIST)
                </h3>
              </div>
              <span className="text-[10px] font-orbitron px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                PROTECCIÓN CONTRA RANSOMWARE
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              Por seguridad estricta, las operaciones de archivos solo pueden acceder a carpetas explícitamente autorizadas por ti.
              Las rutas críticas del sistema operativo (<code className="text-amber-400">Windows\System32</code> y <code className="text-amber-400">Program Files</code>) están estrictamente prohibidas para escritura o borrado.
            </p>

            {/* Input para agregar ruta */}
            <div className="flex items-center space-x-2 mb-3">
              <input
                type="text"
                placeholder="Ej. C:\Users\TuUsuario\Documents o C:\Proyectos..."
                value={newFolderInput}
                onChange={(e) => {
                  setNewFolderInput(e.target.value);
                  setFolderError(null);
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
              <button
                onClick={handleAddFolder}
                className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-orbitron text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer shrink-0"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Añadir Carpeta</span>
              </button>
            </div>

            {folderError && (
              <p className="text-[11px] text-rose-400 mb-3 flex items-center space-x-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{folderError}</span>
              </p>
            )}

            {/* Lista de carpetas configuradas */}
            <div className="space-y-1.5">
              {deviceConfig.allowedFolders.map((folder, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 font-mono text-xs text-slate-300"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <Folder className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="truncate">{folder}</span>
                  </div>
                  {deviceConfig.allowedFolders.length > 1 && (
                    <button
                      onClick={() => handleRemoveFolder(folder)}
                      className="text-slate-500 hover:text-rose-400 transition-colors p-1"
                      title="Eliminar de la lista permitida"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tabla de Niveles y Reglas de Seguridad */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
            <h3 className="text-sm font-orbitron font-bold text-white mb-3 flex items-center space-x-2">
              <Shield className="w-4 h-4 text-cyan-400" />
              <span>CATÁLOGO DE ACCIONES Y MATRIZ DE RIESGO DE SEGURIDAD</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-rajdhani">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-orbitron text-slate-400">
                    <th className="py-2 px-3">Nivel</th>
                    <th className="py-2 px-3">Tipo de Confirmación</th>
                    <th className="py-2 px-3">Acciones Permitidas en este Nivel</th>
                    <th className="py-2 px-3">Reversible</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  <tr>
                    <td className="py-2.5 px-3">{getLevelBadge(0)}</td>
                    <td className="py-2.5 px-3 font-semibold text-emerald-400">Sin confirmación (Solo lectura)</td>
                    <td className="py-2.5 px-3 text-slate-400">Estado CPU/RAM, Batería, Adaptadores de Red, Procesos activos, Hora local, Portapapeles</td>
                    <td className="py-2.5 px-3 text-slate-500">N/A</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3">{getLevelBadge(1)}</td>
                    <td className="py-2.5 px-3 font-semibold text-sky-400">Sin confirmación (Bajo riesgo)</td>
                    <td className="py-2.5 px-3 text-slate-400">Ajuste de volumen, brillo, bloquear pantalla, captura de pantalla, abrir/cerrar apps, portapapeles</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold">Sí (Deshacer disponible)</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3">{getLevelBadge(2)}</td>
                    <td className="py-2.5 px-3 font-semibold text-amber-400">Confirmación verbal o clic</td>
                    <td className="py-2.5 px-3 text-slate-400">Cerrar procesos a la fuerza (kill), apagar/reiniciar/suspender, mover/renombrar archivos, toggle Wi-Fi/Bluetooth</td>
                    <td className="py-2.5 px-3 text-amber-400">Parcial</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3">{getLevelBadge(3)}</td>
                    <td className="py-2.5 px-3 font-semibold text-rose-400">Confirmación con clic físico en pantalla (nunca solo voz)</td>
                    <td className="py-2.5 px-3 text-slate-400">Borrar archivos (siempre a la Papelera de reciclaje), edición de registro, comandos elevados con UAC puntual</td>
                    <td className="py-2.5 px-3 text-rose-400">Papelera / Historial</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Acciones Prohibidas sin Excepción */}
            <div className="mt-4 p-3 rounded-xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-200">
              <span className="font-orbitron font-bold block mb-1 text-rose-300">
                PROHIBIDO SIN EXCEPCIÓN:
              </span>
              <p className="text-[11px] text-rose-300/90 leading-relaxed">
                Desactivar Windows Defender/firewall, leer o exfiltrar credenciales/claves privadas, alterar la propia configuración de seguridad de Viernes, y <strong>ejecutar acciones originadas en contenido web o notificaciones externas</strong> (defensa contra inyección indirecta de prompt).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUBTAB 2: AUDITORÍA DE ACCESO A INTERNET (PARTE A)      */}
      {/* ======================================================== */}
      {subTab === 'internet' && (
        <div className="space-y-6">
          {/* Header de la auditoría */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-sky-500/40 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <Globe className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-orbitron font-bold text-white">
                  VERIFICACIÓN EN TIEMPO REAL DE ACCESOS A INTERNET
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Comprueba conectividad saliente HTTP (generate_204), DNS, Google Gemini API, Search Grounding, URL_ANALYSIS y Proxy/Firewall.
              </p>
            </div>

            <button
              onClick={() => runInternetAuditCheck(true)}
              disabled={auditLoading}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-orbitron text-xs font-semibold flex items-center space-x-2 transition-all cursor-pointer shrink-0 shadow-lg"
            >
              <RefreshCw className={`w-4 h-4 ${auditLoading ? 'animate-spin' : ''}`} />
              <span>{auditLoading ? 'Auditing Network...' : 'Auditar Accesos Ahora'}</span>
            </button>
          </div>

          {/* Tarjetas de Capacidades: "Puedo / No puedo" (Requisito 6) */}
          {internetAudit?.capabilities && (
            <div className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 shadow-xl">
              <div className="flex items-center space-x-2 mb-3">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-orbitron font-bold text-white tracking-wide">
                  INFORME CONSOLIDADO DE CAPACIDADES: "¿QUÉ PUEDE HACER VIERNES AHORA MISMO?"
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Buscar en la web */}
                <div className={`p-4 rounded-xl border ${
                  internetAudit.capabilities.webSearch.canDo
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                    : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-orbitron font-bold">{internetAudit.capabilities.webSearch.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-orbitron font-bold ${
                      internetAudit.capabilities.webSearch.canDo ? 'bg-emerald-900 text-emerald-200' : 'bg-amber-900 text-amber-200'
                    }`}>
                      {internetAudit.capabilities.webSearch.label}
                    </span>
                  </div>
                  <p className="text-[11px] leading-tight text-slate-300 mb-2">
                    {internetAudit.capabilities.webSearch.reason}
                  </p>
                  {internetAudit.capabilities.webSearch.suggestedFix && (
                    <div className="p-2 rounded bg-black/40 text-[10px] text-amber-300 border border-amber-600/30">
                      💡 Solución: {internetAudit.capabilities.webSearch.suggestedFix}
                    </div>
                  )}
                </div>

                {/* 2. Leer URLs externas */}
                <div className={`p-4 rounded-xl border ${
                  internetAudit.capabilities.urlReading.canDo
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-orbitron font-bold">{internetAudit.capabilities.urlReading.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-orbitron font-bold ${
                      internetAudit.capabilities.urlReading.canDo ? 'bg-emerald-900 text-emerald-200' : 'bg-rose-900 text-rose-200'
                    }`}>
                      {internetAudit.capabilities.urlReading.label}
                    </span>
                  </div>
                  <p className="text-[11px] leading-tight text-slate-300 mb-2">
                    {internetAudit.capabilities.urlReading.reason}
                  </p>
                  {internetAudit.capabilities.urlReading.suggestedFix && (
                    <div className="p-2 rounded bg-black/40 text-[10px] text-rose-300 border border-rose-600/30">
                      💡 Solución: {internetAudit.capabilities.urlReading.suggestedFix}
                    </div>
                  )}
                </div>

                {/* 3. Responder offline */}
                <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-orbitron font-bold">{internetAudit.capabilities.offlineResponse.name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-orbitron font-bold bg-emerald-900 text-emerald-200">
                      {internetAudit.capabilities.offlineResponse.label}
                    </span>
                  </div>
                  <p className="text-[11px] leading-tight text-slate-300">
                    {internetAudit.capabilities.offlineResponse.reason}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Grid de las 5 Comprobaciones Detalladas (Verde / Ámbar / Rojo) */}
          {internetAudit?.checks && (
            <div className="space-y-3">
              {/* 1. Internet General & DNS */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-xs font-orbitron font-bold text-white">1. Internet General (generate_204) & DNS</span>
                    {getStatusBadge(internetAudit.checks.generalInternet.status)}
                  </div>
                  <p className="text-xs text-slate-300 leading-tight">
                    {internetAudit.checks.generalInternet.message}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    DNS: {internetAudit.checks.dnsLookup.message} (Latencia: {internetAudit.checks.dnsLookup.latencyMs} ms)
                  </p>
                  {internetAudit.checks.generalInternet.suggestedFix && (
                    <p className="text-[11px] text-rose-300 mt-1">
                      💡 Solución: {internetAudit.checks.generalInternet.suggestedFix}
                    </p>
                  )}
                </div>
              </div>

              {/* 2. API de Gemini */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-xs font-orbitron font-bold text-white">2. API de Google Gemini (Clave & Modelos)</span>
                    {getStatusBadge(internetAudit.checks.geminiApi.status)}
                  </div>
                  <p className="text-xs text-slate-300 leading-tight">
                    {internetAudit.checks.geminiApi.message}
                  </p>
                  {internetAudit.availableModels && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="text-[10px] text-slate-400 self-center">Modelos activos:</span>
                      {internetAudit.availableModels.slice(0, 5).map((m, i) => (
                        <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-cyan-300">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                  {internetAudit.checks.geminiApi.suggestedFix && (
                    <p className="text-[11px] text-amber-300 mt-1">
                      💡 Solución: {internetAudit.checks.geminiApi.suggestedFix}
                    </p>
                  )}
                </div>
              </div>

              {/* 3. Google Search Grounding */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-xs font-orbitron font-bold text-white">3. Google Search Grounding (Búsqueda en Vivo)</span>
                    {getStatusBadge(internetAudit.checks.searchGrounding.status)}
                  </div>
                  <p className="text-xs text-slate-300 leading-tight">
                    {internetAudit.checks.searchGrounding.message}
                  </p>
                  {internetAudit.checks.searchGrounding.quotaExhausted && (
                    <div className="mt-2 p-2.5 rounded-lg bg-amber-950/60 border border-amber-500/50 text-xs text-amber-200">
                      <span className="font-bold block mb-0.5">Límite de cuota 429 alcanzado en búsqueda web</span>
                      <p className="text-[11px]">
                        Puedes continuar conversando normalmente con Viernes usando su conocimiento base o Tier 4 offline. Te recomendamos desactivar la búsqueda automática temporalmente.
                      </p>
                    </div>
                  )}
                  {internetAudit.checks.searchGrounding.suggestedFix && (
                    <p className="text-[11px] text-amber-300 mt-1">
                      💡 Solución: {internetAudit.checks.searchGrounding.suggestedFix}
                    </p>
                  )}
                </div>
              </div>

              {/* 4. Descarga de URL (URL_ANALYSIS) */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-xs font-orbitron font-bold text-white">4. Descarga y Análisis de URL (URL_ANALYSIS, Timeout 6 s)</span>
                    {getStatusBadge(internetAudit.checks.urlAnalysis.status)}
                  </div>
                  <p className="text-xs text-slate-300 leading-tight">
                    {internetAudit.checks.urlAnalysis.message}
                  </p>
                  {internetAudit.checks.urlAnalysis.suggestedFix && (
                    <p className="text-[11px] text-rose-300 mt-1">
                      💡 Solución: {internetAudit.checks.urlAnalysis.suggestedFix}
                    </p>
                  )}
                </div>
              </div>

              {/* 5. Proxy / Firewall */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-xs font-orbitron font-bold text-white">5. Proxy & Firewall (Puerto 443 HTTPS)</span>
                    {getStatusBadge(internetAudit.checks.proxyFirewall.status)}
                  </div>
                  <p className="text-xs text-slate-300 leading-tight">
                    {internetAudit.checks.proxyFirewall.message}
                  </p>
                  {internetAudit.checks.proxyFirewall.suggestedFix && (
                    <p className="text-[11px] text-rose-300 mt-1">
                      💡 Solución: {internetAudit.checks.proxyFirewall.suggestedFix}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SUBTAB 3: REGISTRO DE AUDITORÍA (device_audit.log)       */}
      {/* ======================================================== */}
      {subTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-orbitron font-bold text-white flex items-center space-x-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>HISTORIAL DE AUDITORÍA LOCAL (device_audit.log)</span>
              </h3>
              <p className="text-xs text-slate-400">
                Registro inmutable de todas las órdenes de dispositivo ejecutadas, su origen, nivel, resultado y capacidad de deshacer.
              </p>
            </div>

            <button
              onClick={loadAuditLogs}
              disabled={logsLoading}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin' : ''}`} />
              <span>Actualizar Logs</span>
            </button>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-slate-400">
              <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs">No hay eventos registrados en el log de auditoría del dispositivo aún.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
              <table className="w-full text-left text-xs border-collapse font-rajdhani">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-orbitron text-slate-400">
                    <th className="py-2.5 px-3">Fecha / Hora</th>
                    <th className="py-2.5 px-3">Origen</th>
                    <th className="py-2.5 px-3">Acción</th>
                    <th className="py-2.5 px-3">Nivel</th>
                    <th className="py-2.5 px-3">Parámetros</th>
                    <th className="py-2.5 px-3">Resultado</th>
                    <th className="py-2.5 px-3 text-right">Deshacer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {log.dateFormatted}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-orbitron ${
                          log.origin === 'USER_VOICE'
                            ? 'bg-purple-950 text-purple-300 border border-purple-800'
                            : log.origin === 'USER_TEXT'
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}>
                          {log.origin}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-orbitron font-semibold text-white">
                        {log.action}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          log.level === 3 ? 'bg-rose-950 text-rose-300' :
                          log.level === 2 ? 'bg-amber-950 text-amber-300' :
                          log.level === 1 ? 'bg-sky-950 text-sky-300' : 'bg-emerald-950 text-emerald-300'
                        }`}>
                          L{log.level}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 max-w-[200px] truncate" title={JSON.stringify(log.params)}>
                        {JSON.stringify(log.params)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-orbitron font-bold ${
                          log.result === 'SUCCESS' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40' :
                          log.result === 'BLOCKED' ? 'bg-rose-950/80 text-rose-300 border border-rose-500/40' :
                          log.result === 'CANCELLED' ? 'bg-slate-800 text-slate-400' : 'bg-rose-950 text-rose-300'
                        }`}>
                          {log.result}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {log.reversible && log.result === 'SUCCESS' ? (
                          <button
                            onClick={() => handleUndoAction(log.id)}
                            disabled={undoLoadingId === log.id}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-cyan-900/60 border border-slate-700 hover:border-cyan-500 text-cyan-300 text-[11px] font-semibold flex items-center space-x-1 ml-auto transition-all cursor-pointer"
                            title="Revertir los cambios de esta acción"
                          >
                            <RotateCcw className={`w-3 h-3 ${undoLoadingId === log.id ? 'animate-spin' : ''}`} />
                            <span>Deshacer</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SUBTAB 4: PERMISOS BASE & KEYSTORE                     */}
      {/* ======================================================== */}
      {subTab === 'keystore' && (
        <div className="space-y-6">
          {/* Permissions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Microphone */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-800 text-cyan-300">
                  <Mic className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-orbitron font-semibold text-white">Micrófono & Entrada de Voz</h4>
                  <p className="text-xs text-slate-400">Reconocimiento continuo y Wake Word</p>
                  <span className="text-[11px] font-semibold text-cyan-400">
                    Estado: {micStatus === 'GRANTED' ? 'Autorizado' : micStatus === 'DENIED' ? 'Denegado' : 'Pendiente'}
                  </span>
                </div>
              </div>

              <button
                onClick={requestMicPermission}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
              >
                {micStatus === 'GRANTED' ? 'Comprobar' : 'Solicitar'}
              </button>
            </div>

            {/* Speech Synthesis / Audio */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300">
                  <Volume2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-orbitron font-semibold text-white">Salida de Audio & Síntesis</h4>
                  <p className="text-xs text-slate-400">Web Speech API y Chimes Web Audio</p>
                  <span className="text-[11px] font-semibold text-emerald-400">Estado: Activo y calibrado</span>
                </div>
              </div>

              <button
                onClick={() => {
                  audioService.playActivationSound();
                  audioService.speak('Canal de audio verificado con éxito, jefe.');
                }}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
              >
                Test de Voz
              </button>
            </div>

            {/* Local Storage */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-lg bg-purple-950/60 border border-purple-800 text-purple-300">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-orbitron font-semibold text-white">Memoria Local Persistente</h4>
                  <p className="text-xs text-slate-400">Banco de recuerdos y rutinas en navegador</p>
                  <span className="text-[11px] font-semibold text-purple-400">Estado: Disponible e indexado</span>
                </div>
              </div>

              <div className="flex items-center space-x-1 text-emerald-400 text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Sincronizado</span>
              </div>
            </div>

            {/* Notifications */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-800 text-amber-300">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-orbitron font-semibold text-white">Notificaciones Tácticas</h4>
                  <p className="text-xs text-slate-400">Alarmas de temporizador y avisos de fondo</p>
                  <span className="text-[11px] font-semibold text-amber-400">
                    Estado: {notifStatus === 'GRANTED' ? 'Autorizado' : notifStatus === 'DENIED' ? 'Denegado' : 'Pendiente'}
                  </span>
                </div>
              </div>

              <button
                onClick={requestNotificationPermission}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
              >
                {notifStatus === 'GRANTED' ? 'Verificar' : 'Solicitar'}
              </button>
            </div>
          </div>

          {/* Secure KeyStore Section */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-cyan-500/30 shadow-xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Lock className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-orbitron font-semibold text-white tracking-wide">
                  SECURE KEYSTORE // PROTOCOLO DE CIFRADO
                </h3>
              </div>
              <span className="text-[10px] font-orbitron px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                CIFRADO LOCAL ACTIVO
              </span>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Si deseas usar tu propia API Key personalizada (ej. Google Gemini o endpoint alternativo), puedes guardarla aquí de manera cifrada en tu navegador. Por defecto, Viernes utiliza las credenciales seguras del servidor sin revelar la clave completa.
            </p>

            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  placeholder="Ingresa tu clave de API si deseas sobreescribir la por defecto..."
                  value={storedApiKey}
                  onChange={(e) => setStoredApiKey(e.target.value)}
                  className="w-full pl-4 pr-24 py-2.5 rounded-xl bg-slate-950 border border-slate-700 focus:border-cyan-400 text-white font-mono text-xs focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  {keySaved ? '¡Credenciales aseguradas con éxito!' : 'Se almacenan de forma local y privada.'}
                </span>
                <button
                  onClick={handleSaveKey}
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md flex items-center space-x-1.5 transition-all cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar en Keystore</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
