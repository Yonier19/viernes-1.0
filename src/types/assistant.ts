export type ListeningState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING';

export type MemoryType = 'PREFERENCE' | 'CONTACT_ALIAS' | 'ROUTINE' | 'COMMAND_HISTORY' | 'FACT';

export interface MemoryItem {
  id: string;
  title: string;
  content: string;
  type: MemoryType;
  category?: string;
  confidence: number;
  timestamp: number;
  accessCount: number;
}

export interface RoutineStep {
  id: string;
  action: 'OPEN_APP' | 'SPEAK' | 'TIMER' | 'COMMAND';
  target?: string;
  payload?: string;
}

export interface RoutineItem {
  id: string;
  name: string;
  triggerPhrase: string;
  description: string;
  enabled: boolean;
  steps: RoutineStep[];
}

export interface GroundingSource {
  title: string;
  url: string;
}

export interface WindowsNotification {
  id: string;
  app: string;
  title: string;
  text: string;
  timestamp: number;
  read?: boolean;
}

export type ResponseTier = 'web' | 'gemini' | 'gemini_lite' | 'local' | 'emergency' | 'cache';
export type ConfidenceLevel = 'alta' | 'media' | 'baja';
export type ResponseLength = 'breve' | 'normal' | 'detallada';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'viernes';
  text: string;
  timestamp: number;
  intent?: string;
  action?: {
    type: string;
    app?: string;
    query?: string;
    name?: string;
    seconds?: number;
    title?: string;
    content?: string;
    deviceAction?: string;
    level?: number;
    params?: any;
    actionId?: string;
    requiresPhysicalClick?: boolean;
    summary?: string;
  };
  sources?: GroundingSource[];
  source?: 'gemini' | 'gemini_search' | 'local_subsystem' | 'gemini_lite' | 'emergency';
  tier?: ResponseTier;
  confidence?: ConfidenceLevel;
  disclaimer?: string;
  clarificationQuestion?: string;
  isCorrection?: boolean;
  isStreaming?: boolean;
}

export type OrbThemeColor = 'cyan' | 'amethyst' | 'gold' | 'emerald';

export type PowerProfile = 'eco' | 'balanced' | 'performance';

export interface AISettings {
  provider: 'gemini' | 'local' | 'custom';
  model: string;
  fallbackModel?: string;
  autoWebSearch?: boolean;
  responseLength?: ResponseLength;
  userCity?: string;
  userTimezone?: string;
  customApiKey: string;
  customEndpoint: string;
  wakeWord: string;
  wakeWordActive: boolean;
  continuousListening: boolean;
  voiceRate: number;
  voicePitch: number;
  voiceVolume: number;
  voiceName: string;
  autoSpeak: boolean;
  soundEffects: boolean;
  orbTheme: OrbThemeColor;
  personality: 'stark' | 'formal' | 'friendly' | 'concise';
  voiceEngine?: 'electron_gemini' | 'browser_speech' | 'edge_launcher';
  
  // Perfiles de Energía y Rendimiento (Fase 4: Optimización)
  powerProfile?: PowerProfile; // 'eco' (0 fps reposo, 60s notifs) | 'balanced' (1 fps reposo, 30s notifs) | 'performance' (60 fps continuo)

  // Windows & Desktop Features
  startWithWindows?: boolean;
  startHidden?: boolean;
  minimizeToTray?: boolean;
  windowsNotificationsEnabled?: boolean;
  notificationAutoReadApps?: string[];
  notificationAllowedApps?: string[];
  notificationBlockedApps?: string[];
  privacyNoticeAccepted?: boolean;
  proxyUrl?: string;
  // Floating Overlay (Fase 2)
  overlayEnabled?: boolean;
  overlayCorner?: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left';
  overlayDisplayId?: number;
  overlayOpacityIdle?: number;
  overlayPosition?: { x: number; y: number };

  // Detección de Palabra de Activación & Escucha Continua (Fases 3 y 4)
  wakeWordEnabled?: boolean;
  wakeWordEngine?: 'local_phonetic' | 'porcupine_wasm';
  wakeWordPhrase?: 'viernes' | 'oye viernes' | 'hola viernes' | 'friday';
  wakeWordSensitivity?: number; // 0.1 - 1.0 (default 0.65)
  selectedMicDeviceId?: string;
  bargeInEnabled?: boolean; // Interrumpir respuesta si el usuario vuelve a hablar
  globalShortcutCombo?: string; // Por defecto 'CommandOrControl+Alt+V'
  porcupineAccessKey?: string; // Clave Picovoice opcional para motor Porcupine
}

export type AssistantLifecycleState = 
  | 'IDLE' 
  | 'WAKE_DETECTED' 
  | 'LISTENING' 
  | 'PROCESSING' 
  | 'SPEAKING' 
  | 'PAUSED' 
  | 'ERROR';

export interface AssistantStatePayload {
  state: AssistantLifecycleState;
  previousState?: AssistantLifecycleState;
  reason?: string;
  timestamp: number;
}

export interface AutoStartConfig {
  openAtLogin: boolean;
  startHidden?: boolean;
}

export interface DisplayInfo {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
  scaleFactor: number;
}

export interface GlobalShortcutStatus {
  registered: boolean;
  shortcut: string;
  error?: string;
}

export interface SystemTelemetry {
  status: 'ONLINE' | 'STANDBY' | 'ENGAGED';
  coreVersion: string;
  battery: number;
  quantumSync: number;
  residentService: boolean;
  internetStatus?: 'ONLINE' | 'OFFLINE' | 'RECONNECTING';
  lifecycleState?: AssistantLifecycleState;
}

export interface ElectronAPI {
  isElectron: boolean;
  openExternal: (url: string) => Promise<void>;
  launchEdgeApp: (port?: number) => Promise<void>;
  getUserDataPath: () => Promise<string>;
  encryptString: (text: string) => Promise<string>;
  decryptString: (encryptedBase64: string) => Promise<string>;

  // Windows Auto-start & Silent background start
  getAutoStart: () => Promise<{ openAtLogin: boolean; startHidden: boolean }>;
  setAutoStart: (config: boolean | AutoStartConfig) => Promise<{ openAtLogin: boolean; startHidden: boolean }>;

  // Lifecycle & Assistant State Machine
  getAssistantState: () => Promise<{ state: AssistantLifecycleState; isMicMuted: boolean; overlayVisible: boolean; timestamp: number }>;
  setAssistantState: (state: AssistantLifecycleState, reason?: string) => Promise<{ success: boolean; state: AssistantLifecycleState }>;
  onAssistantStateChanged: (callback: (payload: AssistantStatePayload) => void) => () => void;

  // Microphone Mute State & Events
  getMicrophoneMuted: () => Promise<boolean>;
  setMicrophoneMuted: (muted: boolean) => Promise<boolean>;
  onMicrophoneMuteChanged: (callback: (muted: boolean) => void) => () => void;

  // Window Controls & Overlay
  openMainWindow: () => Promise<boolean>;
  minimizeMainWindow: () => Promise<boolean>;
  toggleOverlay: () => Promise<boolean>;

  // Floating Overlay (Fase 2 + Paso 0)
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => void;
  setOverlayExpanded: (expanded: boolean) => Promise<void>;
  setOverlayFocusable: (focusable: boolean) => Promise<boolean>;
  moveOverlayBy: (dx: number, dy: number) => Promise<void>;
  saveOverlayPosition: () => Promise<{ x: number; y: number } | null>;
  getDisplays: () => Promise<DisplayInfo[]>;
  setOverlayCorner: (corner: 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left', displayId?: number) => Promise<{ x: number; y: number }>;
  onOverlayTriggerListening: (callback: (payload: { source: string }) => void) => () => void;
  triggerGlobalShortcutActivation: () => Promise<boolean>;

  // Atajo Global Configurable (Paso 0.b)
  getGlobalShortcutStatus: () => Promise<GlobalShortcutStatus>;
  setGlobalShortcut: (shortcut: string) => Promise<GlobalShortcutStatus>;

  // Detección de Palabra de Activación en Segundo Plano (Fase 3)
  getWakeWordSettings: () => Promise<{ enabled: boolean; phrase: string; sensitivity: number; micDeviceId: string; bargeIn: boolean }>;
  setWakeWordSettings: (settings: { enabled?: boolean; phrase?: string; sensitivity?: number; micDeviceId?: string; bargeIn?: boolean }) => Promise<boolean>;
  notifyWakeWordDetected: (payload?: { phrase?: string; confidence?: number }) => Promise<boolean>;
  onWakeWordDetected: (callback: (payload: { phrase: string; timestamp: number }) => void) => () => void;
  onWakeWordStateChange: (callback: (payload: { active: boolean; reason?: string }) => void) => () => void;

  // Coordinación TTS Cross-Window (Paso 0.d)
  notifyTtsStarted: () => Promise<void>;
  notifyTtsEnded: () => Promise<void>;
  onTtsStop: (callback: () => void) => () => void;

  // Sincronización de Historial de Chat Entre Ventanas (Paso 0.d)
  syncChatMessage: (message: ChatMessage) => Promise<void>;
  onSyncChatMessage: (callback: (message: ChatMessage) => void) => () => void;

  // Windows Notifications Reader API
  onNotificationReceived: (callback: (notif: WindowsNotification) => void) => () => void;
  getRecentNotifications: () => Promise<WindowsNotification[]>;
  setNotificationReaderConfig: (config: any) => Promise<boolean>;

  // Network & Proxy APIs
  getSystemProxy: (testUrl?: string) => Promise<string>;
  setNetworkProxy: (proxyUrl: string) => Promise<{ success: boolean; error?: string }>;

  // Perfiles de Energía & Optimización (Fase 4)
  getPowerProfile: () => Promise<PowerProfile>;
  setPowerProfile: (profile: PowerProfile) => Promise<boolean>;
  getSystemPowerStatus: () => Promise<{ onBattery: boolean; idleTimeSeconds: number }>;

  // Control y Administración del Dispositivo por Niveles (Fase 5)
  getDeviceControlConfig: () => Promise<DeviceControlConfig>;
  setDeviceControlConfig: (config: Partial<DeviceControlConfig>) => Promise<{ success: boolean; config: DeviceControlConfig }>;
  executeDeviceAction: (request: DeviceActionRequest) => Promise<DeviceActionResponse>;
  confirmDeviceAction: (actionId: string, confirmed: boolean, method?: 'PHYSICAL_CLICK' | 'VOICE') => Promise<DeviceActionResponse>;
  getDeviceAuditLogs: (limit?: number) => Promise<DeviceAuditLogEntry[]>;
  undoDeviceAction: (auditEntryId?: string) => Promise<DeviceActionResponse>;
  panicDisableDeviceControl: (reason?: string) => Promise<{ success: boolean; message: string; enabled: boolean }>;
  onDeviceControlUpdated: (callback: (config: DeviceControlConfig) => void) => () => void;
  onDeviceActionConfirmationRequested: (callback: (payload: DeviceActionResponse) => void) => () => void;
}

// ==========================================
// TIPOS DE CONTROL DE DISPOSITIVO (Fase 5)
// ==========================================
export type ActionLevel = 0 | 1 | 2 | 3;

export interface DeviceControlConfig {
  enabled: boolean;
  readOnly: boolean;
  maxLevel?: ActionLevel;
  maxAllowedLevel: number; // 0, 1, 2, 3
  allowedFolders: string[];
  blockedSystemFolders?: string[];
  allowedApps: string[];
  panicDisabled?: boolean;
}

export interface DeviceActionRequest {
  action: string;
  params?: Record<string, any>;
  origin?: 'USER_VOICE' | 'USER_TEXT' | 'GLOBAL_SHORTCUT' | 'SYSTEM_RECOVERY' | 'EXTERNAL_DATA' | 'WEB_PAGE' | 'NOTIFICATION';
  confidence?: number;
  isAudioPlaying?: boolean;
  userConfirmed?: boolean;
  confirmationMethod?: 'PHYSICAL_CLICK' | 'VOICE';
}

export interface DeviceActionResponse {
  success: boolean;
  actionId?: string;
  level?: number;
  action?: string;
  params?: Record<string, any>;
  status?: 'SUCCESS' | 'CONFIRMATION_REQUIRED' | 'CANCELLED' | 'DENIED' | 'FAILED' | 'BLOCKED';
  message?: string;
  error?: string;
  summary?: string;
  requiresPhysicalClick?: boolean;
  warningReason?: string;
  undoable?: boolean;
  data?: any;
}

export interface DeviceAuditLogEntry {
  id: string;
  timestamp: string | number;
  dateFormatted?: string;
  origin: string;
  action: string;
  params: Record<string, any>;
  level: number;
  status?: 'SUCCESS' | 'CONFIRMATION_REQUIRED' | 'CANCELLED' | 'DENIED' | 'FAILED' | 'PENDING_CONFIRMATION' | 'BLOCKED';
  result?: 'SUCCESS' | 'CONFIRMATION_REQUIRED' | 'CANCELLED' | 'DENIED' | 'FAILED' | 'BLOCKED';
  message?: string;
  details?: string;
  reversible?: boolean;
  undoable?: boolean;
  undoData?: any;
  revertPayload?: any;
}

// ==========================================
// TIPOS DE AUDITORÍA DE INTERNET (Fase 5 Parte A)
// ==========================================
export type DiagnosticTrafficLight = 'green' | 'amber' | 'red';

export interface DiagnosticCheckItem {
  id: string;
  name: string;
  status: DiagnosticTrafficLight;
  passed: boolean;
  latencyMs?: number;
  message: string;
  details?: string;
  suggestedFix?: string;
  quotaExhausted?: boolean;
  autoDisableRecommended?: boolean;
}

export interface InternetAuditCapability {
  name: string;
  canDo: boolean; // "Puedo" / "No puedo"
  label: 'Puedo' | 'No puedo';
  reason: string;
  suggestedFix?: string;
}

export interface InternetAuditReport {
  overallStatus: DiagnosticTrafficLight;
  timestamp: number;
  totalLatencyMs: number;
  checks: {
    generalInternet: DiagnosticCheckItem;
    dnsLookup: DiagnosticCheckItem;
    geminiApi: DiagnosticCheckItem;
    searchGrounding: DiagnosticCheckItem;
    urlAnalysis: DiagnosticCheckItem;
    proxyFirewall: DiagnosticCheckItem;
  };
  capabilities: {
    webSearch: InternetAuditCapability;
    urlReading: InternetAuditCapability;
    offlineResponse: InternetAuditCapability;
  };
  summaryText: string;
  apiKeyMasked: string;
  availableModels?: string[];
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
