import { MemoryItem, RoutineItem, AISettings, SystemTelemetry } from '../types/assistant';

const STORAGE_KEYS = {
  MEMORIES: 'viernes_memories_v4',
  ROUTINES: 'viernes_routines_v4',
  SETTINGS: 'viernes_settings_v4',
  TELEMETRY: 'viernes_telemetry_v4',
};

const INITIAL_MEMORIES: MemoryItem[] = [
  {
    id: 'mem-1',
    title: 'Preferencia de Enfoque',
    content: 'Prefiere respuestas tácticas, directas y elegantes en español.',
    type: 'PREFERENCE',
    category: 'Interacción',
    confidence: 0.98,
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 3,
    accessCount: 14,
  },
  {
    id: 'mem-2',
    title: 'Café Matutino',
    content: 'Espresso doble sin azúcar a primera hora del día.',
    type: 'PREFERENCE',
    category: 'Hábitos',
    confidence: 0.95,
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2,
    accessCount: 8,
  },
  {
    id: 'mem-3',
    title: 'Música de Trabajo',
    content: 'Sintonizar bandas sonoras o synthwave para sesiones intensas de código.',
    type: 'PREFERENCE',
    category: 'Música',
    confidence: 0.92,
    timestamp: Date.now() - 1000 * 60 * 60 * 18,
    accessCount: 5,
  },
  {
    id: 'mem-4',
    title: 'Alias Contacto: Laboratorio',
    content: 'Equipo de desarrollo y laboratorio central de proyectos.',
    type: 'CONTACT_ALIAS',
    category: 'Comunicaciones',
    confidence: 0.99,
    timestamp: Date.now() - 1000 * 60 * 60 * 12,
    accessCount: 19,
  },
  {
    id: 'mem-5',
    title: 'Directriz Stark Industries',
    content: 'Protocolo de seguridad táctica v4.2 activado con cifrado de enlace.',
    type: 'FACT',
    category: 'Seguridad',
    confidence: 1.0,
    timestamp: Date.now() - 1000 * 60 * 60 * 6,
    accessCount: 22,
  },
];

const INITIAL_ROUTINES: RoutineItem[] = [
  {
    id: 'rt-1',
    name: 'Modo Trabajo y Enfoque',
    triggerPhrase: 'modo trabajo',
    description: 'Sesión de productividad con temporizador de 25 min y música instrumental.',
    enabled: true,
    steps: [
      { id: 's1', action: 'SPEAK', payload: 'Iniciando protocolo de enfoque. Sistemas de distracción neutralizados.' },
      { id: 's2', action: 'OPEN_APP', target: 'spotify', payload: 'lofi beats' },
      { id: 's3', action: 'TIMER', payload: '1500' },
    ],
  },
  {
    id: 'rt-2',
    name: 'Buenos Días, Viernes',
    triggerPhrase: 'buenos días',
    description: 'Comprobación de subsistemas matutinos y despliegue del día.',
    enabled: true,
    steps: [
      { id: 's1', action: 'SPEAK', payload: 'Buenos días, jefe. Todos los subsistemas de Viernes están sincronizados y al 100% de capacidad.' },
      { id: 's2', action: 'OPEN_APP', target: 'calendar' },
    ],
  },
  {
    id: 'rt-3',
    name: 'Cierre de Jornada',
    triggerPhrase: 'buenas noches',
    description: 'Protocolo nocturno para archivar tareas y pasar a modo bajo consumo.',
    enabled: true,
    steps: [
      { id: 's1', action: 'SPEAK', payload: 'Jornada completada. Memorias consolidadas en el núcleo. Buen descanso, jefe.' },
    ],
  },
];

export const DEFAULT_SETTINGS: AISettings = {
  provider: 'gemini',
  model: 'gemini-3.8-flash',
  fallbackModel: 'gemini-3.1-flash-lite',
  autoWebSearch: true,
  responseLength: 'breve',
  userCity: 'Madrid',
  userTimezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid' : 'Europe/Madrid',
  customApiKey: '',
  customEndpoint: '',
  wakeWord: 'oye viernes',
  wakeWordActive: true,
  continuousListening: false,
  voiceRate: 1.05,
  voicePitch: 1.0,
  voiceVolume: 1.0,
  voiceName: '',
  autoSpeak: true,
  soundEffects: true,
  orbTheme: 'cyan',
  personality: 'stark',
  voiceEngine: 'electron_gemini',
  startWithWindows: false,
  startHidden: false,
  minimizeToTray: true,
  windowsNotificationsEnabled: true,
  notificationAutoReadApps: ['whatsapp'],
  notificationAllowedApps: [],
  notificationBlockedApps: [],
  privacyNoticeAccepted: true,
  proxyUrl: '',
};

class MemoryStorage {
  private syncTimer: any = null;

  constructor() {
    this.syncWithServer();
  }

  // Sync with persistent userData on server
  async syncWithServer() {
    try {
      const res = await fetch('/api/assistant/userdata');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.memories) && data.memories.length > 0) {
          localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(data.memories));
        }
        if (Array.isArray(data.routines) && data.routines.length > 0) {
          localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify(data.routines));
        }
        if (data.settings && Object.keys(data.settings).length > 0) {
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
        }
      }
    } catch {}
  }

  private persistToServer() {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(async () => {
      try {
        await fetch('/api/assistant/userdata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memories: this.getMemories(),
            routines: this.getRoutines(),
            settings: this.getSettings(),
            updatedAt: Date.now(),
          }),
        });
      } catch {}
    }, 400);
  }

  // Memories
  getMemories(): MemoryItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MEMORIES);
      return data ? JSON.parse(data) : INITIAL_MEMORIES;
    } catch {
      return INITIAL_MEMORIES;
    }
  }

  saveMemory(item: Omit<MemoryItem, 'id' | 'timestamp' | 'accessCount'>): MemoryItem {
    const memories = this.getMemories();
    const newMemory: MemoryItem = {
      ...item,
      id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: Date.now(),
      accessCount: 1,
    };
    const updated = [newMemory, ...memories];
    try {
      localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(updated));
    } catch {}
    this.persistToServer();
    return newMemory;
  }

  updateMemory(id: string, updates: Partial<MemoryItem>) {
    const memories = this.getMemories();
    const updated = memories.map(m => (m.id === id ? { ...m, ...updates } : m));
    try {
      localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(updated));
    } catch {}
    this.persistToServer();
    return updated;
  }

  deleteMemory(id: string): MemoryItem[] {
    const memories = this.getMemories();
    const updated = memories.filter(m => m.id !== id);
    try {
      localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(updated));
    } catch {}
    this.persistToServer();
    return updated;
  }

  // Routines
  getRoutines(): RoutineItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ROUTINES);
      return data ? JSON.parse(data) : INITIAL_ROUTINES;
    } catch {
      return INITIAL_ROUTINES;
    }
  }

  saveRoutine(routine: Omit<RoutineItem, 'id'>): RoutineItem {
    const routines = this.getRoutines();
    const newRoutine: RoutineItem = {
      ...routine,
      id: `rt-${Date.now()}`,
    };
    const updated = [newRoutine, ...routines];
    try {
      localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify(updated));
    } catch {}
    this.persistToServer();
    return newRoutine;
  }

  toggleRoutine(id: string): RoutineItem[] {
    const routines = this.getRoutines();
    const updated = routines.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    try {
      localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify(updated));
    } catch {}
    this.persistToServer();
    return updated;
  }

  deleteRoutine(id: string): RoutineItem[] {
    const routines = this.getRoutines();
    const updated = routines.filter(r => r.id !== id);
    try {
      localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify(updated));
    } catch {}
    this.persistToServer();
    return updated;
  }

  // Settings
  getSettings(): AISettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  saveSettings(settings: Partial<AISettings>): AISettings {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
    } catch {}
    this.persistToServer();
    return updated;
  }

  // Telemetry
  getTelemetry(): SystemTelemetry {
    return {
      status: 'ONLINE',
      coreVersion: 'v4.2.0-STARK',
      battery: 98,
      quantumSync: 99.4,
      residentService: true,
    };
  }

  // Export & Import
  exportData(): string {
    const data = {
      version: '4.2',
      exportDate: new Date().toISOString(),
      memories: this.getMemories(),
      routines: this.getRoutines(),
      settings: this.getSettings(),
    };
    return JSON.stringify(data, null, 2);
  }

  importData(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed.memories)) {
        localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(parsed.memories));
      }
      if (Array.isArray(parsed.routines)) {
        localStorage.setItem(STORAGE_KEYS.ROUTINES, JSON.stringify(parsed.routines));
      }
      if (parsed.settings) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(parsed.settings));
      }
      this.persistToServer();
      return true;
    } catch {
      return false;
    }
  }

  clearAll() {
    localStorage.removeItem(STORAGE_KEYS.MEMORIES);
    localStorage.removeItem(STORAGE_KEYS.ROUTINES);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    this.persistToServer();
  }
}

export const memoryStorage = new MemoryStorage();
