const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  launchEdgeApp: (port) => ipcRenderer.invoke('launch-edge-app', port),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  encryptString: (text) => ipcRenderer.invoke('encrypt-string', text),
  decryptString: (encryptedBase64) => ipcRenderer.invoke('decrypt-string', encryptedBase64),

  // Windows Auto-start & Silent background start
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (config) => ipcRenderer.invoke('set-auto-start', config),

  // Lifecycle & Assistant State Machine
  getAssistantState: () => ipcRenderer.invoke('assistant-get-state'),
  setAssistantState: (state, reason) => ipcRenderer.invoke('assistant-set-state', state, reason),
  onAssistantStateChanged: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('assistant-state-changed', handler);
    return () => ipcRenderer.removeListener('assistant-state-changed', handler);
  },

  // Microphone Mute State & Events
  getMicrophoneMuted: () => ipcRenderer.invoke('get-microphone-muted'),
  setMicrophoneMuted: (muted) => ipcRenderer.invoke('set-microphone-muted', muted),
  onMicrophoneMuteChanged: (callback) => {
    const handler = (event, muted) => callback(muted);
    ipcRenderer.on('microphone-mute-changed', handler);
    return () => ipcRenderer.removeListener('microphone-mute-changed', handler);
  },

  // Window Controls & Overlay (Fase 2)
  openMainWindow: () => ipcRenderer.invoke('open-main-window'),
  minimizeMainWindow: () => ipcRenderer.invoke('minimize-main-window'),
  toggleOverlay: () => ipcRenderer.invoke('toggle-overlay'),

  // Floating Overlay (Fase 2 + Paso 0)
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  setOverlayExpanded: (expanded) => ipcRenderer.invoke('set-overlay-expanded', expanded),
  setOverlayFocusable: (focusable) => ipcRenderer.invoke('set-overlay-focusable', focusable),
  moveOverlayBy: (dx, dy) => ipcRenderer.invoke('overlay-move-by', { dx, dy }),
  saveOverlayPosition: () => ipcRenderer.invoke('overlay-save-position'),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  setOverlayCorner: (corner, displayId) => ipcRenderer.invoke('set-overlay-corner', { corner, displayId }),
  onOverlayTriggerListening: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('overlay-trigger-listening', handler);
    return () => ipcRenderer.removeListener('overlay-trigger-listening', handler);
  },
  triggerGlobalShortcutActivation: () => ipcRenderer.invoke('trigger-global-shortcut-activation'),

  // Atajo Global Configurable (Paso 0.b)
  getGlobalShortcutStatus: () => ipcRenderer.invoke('get-global-shortcut-status'),
  setGlobalShortcut: (shortcut) => ipcRenderer.invoke('set-global-shortcut', shortcut),

  // Detección de Palabra de Activación en Segundo Plano (Fase 3)
  getWakeWordSettings: () => ipcRenderer.invoke('get-wake-word-settings'),
  setWakeWordSettings: (settings) => ipcRenderer.invoke('set-wake-word-settings', settings),
  notifyWakeWordDetected: (payload) => ipcRenderer.invoke('notify-wake-word-detected', payload),
  onWakeWordDetected: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('wake-word-detected', handler);
    return () => ipcRenderer.removeListener('wake-word-detected', handler);
  },
  onWakeWordStateChange: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('wake-word-state-change', handler);
    return () => ipcRenderer.removeListener('wake-word-state-change', handler);
  },

  // Coordinación TTS Cross-Window (Paso 0.d)
  notifyTtsStarted: () => ipcRenderer.invoke('notify-tts-started'),
  notifyTtsEnded: () => ipcRenderer.invoke('notify-tts-ended'),
  onTtsStop: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('tts-stop', handler);
    return () => ipcRenderer.removeListener('tts-stop', handler);
  },

  // Sincronización de Historial de Chat Entre Ventanas (Paso 0.d)
  syncChatMessage: (message) => ipcRenderer.invoke('sync-chat-message', message),
  onSyncChatMessage: (callback) => {
    const handler = (event, message) => callback(message);
    ipcRenderer.on('sync-chat-message', handler);
    return () => ipcRenderer.removeListener('sync-chat-message', handler);
  },

  // Windows Notifications Reader API
  onNotificationReceived: (callback) => {
    const handler = (event, notification) => callback(notification);
    ipcRenderer.on('notification-received', handler);
    return () => ipcRenderer.removeListener('notification-received', handler);
  },
  getRecentNotifications: () => ipcRenderer.invoke('get-recent-notifications'),
  setNotificationReaderConfig: (config) => ipcRenderer.invoke('set-notification-reader-config', config),

  // Network & Proxy APIs
  getSystemProxy: (testUrl) => ipcRenderer.invoke('get-system-proxy', testUrl),
  setNetworkProxy: (proxyUrl) => ipcRenderer.invoke('set-network-proxy', proxyUrl),

  // Perfiles de Energía & Optimización (Fase 4)
  getPowerProfile: () => ipcRenderer.invoke('get-power-profile'),
  setPowerProfile: (profile) => ipcRenderer.invoke('set-power-profile', profile),
  getSystemPowerStatus: () => ipcRenderer.invoke('get-system-power-status'),

  // Control y Administración del Dispositivo por Niveles (Fase 5)
  getDeviceControlConfig: () => ipcRenderer.invoke('device-control-get-config'),
  setDeviceControlConfig: (config) => ipcRenderer.invoke('device-control-set-config', config),
  executeDeviceAction: (request) => ipcRenderer.invoke('device-control-execute', request),
  confirmDeviceAction: (actionId, confirmed, method) => ipcRenderer.invoke('device-control-confirm', { actionId, confirmed, method }),
  getDeviceAuditLogs: (limit) => ipcRenderer.invoke('device-control-get-audit-logs', limit),
  undoDeviceAction: (auditEntryId) => ipcRenderer.invoke('device-control-undo', auditEntryId),
  panicDisableDeviceControl: (reason) => ipcRenderer.invoke('device-control-panic', reason),
  onDeviceControlUpdated: (callback) => {
    const handler = (event, config) => callback(config);
    ipcRenderer.on('device-control-updated', handler);
    return () => ipcRenderer.removeListener('device-control-updated', handler);
  },
  onDeviceActionConfirmationRequested: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('device-action-confirmation-requested', handler);
    return () => ipcRenderer.removeListener('device-action-confirmation-requested', handler);
  },
});

