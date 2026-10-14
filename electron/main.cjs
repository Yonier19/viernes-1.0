const { app, BrowserWindow, shell, session, ipcMain, safeStorage, Tray, Menu, nativeImage, screen, globalShortcut, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { WindowsNotificationReader } = require('./notificationReader.cjs');
const { DeviceControl } = require('./deviceControl.cjs');

// ==========================================
// 1. INSTANCIA ÚNICA (Single Instance Lock)
// ==========================================
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Electron] Otra instancia de Viernes ya está en ejecución. Saliendo...');
  app.quit();
  process.exit(0);
}

// Variables globales del ciclo de vida
let mainWindow = null;
let overlayWindow = null;
let wakeWordWindow = null; // Fase 3: Ventana oculta dedicada para detección de palabra clave
let compactOverlayBounds = { x: 0, y: 0, width: 88, height: 88 };
let tray = null;
let serverInstance = null;
let serverPort = 3000;
let isQuitting = false;
let notificationReader = null;
let deviceControl = null; // Fase 5: Módulo de control del dispositivo
let isMicMuted = false;
let overlayVisible = false;
let activeTtsSender = null;

// Fase 3: Estado de atajo global y configuración de Wake Word
let globalShortcutStatus = { registered: false, shortcut: 'CommandOrControl+Alt+V', error: null };
let wakeWordSettings = {
  enabled: true,
  phrase: 'viernes',
  sensitivity: 0.65,
  micDeviceId: '',
  bargeIn: false,
};

// Estado del servidor interno y watchdog de recuperación
let isServerBooting = false;
let serverRestartAttempts = 0;
let serverHealthInterval = null;

// ==========================================
// 5. MÁQUINA DE ESTADOS COMPARTIDA
// Estados: IDLE, WAKE_DETECTED, LISTENING, PROCESSING, SPEAKING, PAUSED, ERROR
// ==========================================
const VALID_STATES = ['IDLE', 'WAKE_DETECTED', 'LISTENING', 'PROCESSING', 'SPEAKING', 'PAUSED', 'ERROR'];
let assistantState = 'IDLE';

// Directorio UserData de persistencia segura
const userDataDir = app.getPath('userData');
process.env.VIERNES_USER_DATA = userDataDir;

// Inicialización de DeviceControl (Fase 5)
deviceControl = new DeviceControl(userDataDir);

if (app.isPackaged) {
  process.env.NODE_ENV = 'production';
  process.env.VIERNES_PACKAGED = '1';
  const staticCandidates = [
    path.join(app.getAppPath(), 'dist'),
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar', 'dist') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'dist') : null,
    path.join(__dirname, '../dist'),
  ].filter(Boolean);
  process.env.VIERNES_STATIC_PATH = staticCandidates.find(p => fs.existsSync(path.join(p, 'index.html'))) || staticCandidates[0];
} else {
  process.env.VIERNES_STATIC_PATH = path.join(__dirname, '../dist');
}

// ==========================================
// PERSISTENCIA DE AJUSTES EN viernes_store.json
// ==========================================
const storePath = path.join(userDataDir, 'viernes_store.json');
const logPath = path.join(userDataDir, 'connection.log');

function readStoredSettings() {
  try {
    if (fs.existsSync(storePath)) {
      const data = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
      return data.settings || {};
    }
  } catch (err) {
    console.warn('[Electron] Error leyendo viernes_store.json:', err.message);
  }
  return {};
}

function updateStoredSettings(partialSettings) {
  try {
    let data = { memories: [], routines: [], settings: {} };
    if (fs.existsSync(storePath)) {
      try {
        data = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
      } catch {}
    }
    data.settings = { ...data.settings, ...partialSettings };
    data.updatedAt = Date.now();
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.warn('[Electron] Error actualizando viernes_store.json:', err.message);
    return false;
  }
}

// ==========================================
// 6. REGISTRO EN connection.log (CLAVE OFUSCADA)
// ==========================================
function maskKey(key) {
  if (!key || typeof key !== 'string') return 'none';
  const trimmed = key.trim();
  if (trimmed.length <= 4) return '****';
  return '...' + trimmed.slice(-4);
}

function logLifeCycleEvent(event, details = {}) {
  try {
    const timestamp = new Date().toISOString();
    // Obtener clave ofuscada si existe para corroborar
    let masked = 'none';
    const credsPath = path.join(userDataDir, 'viernes_credentials.json');
    if (fs.existsSync(credsPath)) {
      try {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
        if (creds.apiKey) masked = maskKey(creds.apiKey);
      } catch {}
    }

    const logEntry = `[${timestamp}] [LIFECYCLE] event=${event} state=${assistantState} serverPort=${serverPort} apiKey=${masked} details=${JSON.stringify(details)}\n`;
    fs.appendFileSync(logPath, logEntry, 'utf-8');
  } catch (err) {
    console.warn('[Electron] Error escribiendo en connection.log:', err.message);
  }
}

// ==========================================
// 4. ICONOS DINÁMICOS DEL TRAY Y VENTANA POR ESTADO
// ==========================================
function getAppIconPath() {
  const candidates = [
    process.platform === 'win32' && process.resourcesPath ? path.join(process.resourcesPath, 'build/icon.ico') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'build/icon.png') : null,
    process.platform === 'win32' ? path.join(app.getAppPath(), 'build/icon.ico') : null,
    path.join(app.getAppPath(), 'build/icon.png'),
    process.platform === 'win32' ? path.join(__dirname, '../build/icon.ico') : null,
    path.join(__dirname, '../build/icon.png'),
  ].filter(Boolean);

  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  return path.join(__dirname, '../build/icon.png');
}

function getTrayIconPathForState(state) {
  let iconName = 'tray-active.png';
  if (state === 'PAUSED') {
    iconName = 'tray-paused.png';
  } else if (state === 'ERROR') {
    iconName = 'tray-error.png';
  } else {
    iconName = 'tray-active.png';
  }

  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'build', iconName) : null,
    path.join(app.getAppPath(), 'build', iconName),
    path.join(__dirname, '../build', iconName),
    getAppIconPath(),
  ].filter(Boolean);

  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  return getAppIconPath();
}

function updateTrayAppearance() {
  if (!tray) return;

  try {
    const iconPath = getTrayIconPathForState(assistantState);
    if (fs.existsSync(iconPath)) {
      tray.setImage(nativeImage.createFromPath(iconPath));
    }

    const stateLabels = {
      IDLE: 'En Espera (Listo)',
      WAKE_DETECTED: '¡Palabra Clave Detectada!',
      LISTENING: 'Escuchando Voz...',
      PROCESSING: 'Procesando Respuesta...',
      SPEAKING: 'Hablando...',
      PAUSED: 'Escucha Pausada',
      ERROR: 'Atención: Verificando Conexión',
    };

    const statusText = stateLabels[assistantState] || assistantState;
    tray.setToolTip(`Viernes (FRIDAY) - ${statusText}`);

    // Reconstruir el menú para actualizar opciones dinámicas
    buildTrayContextMenu();
  } catch (err) {
    console.warn('[Electron] Error actualizando apariencia de la bandeja:', err.message);
  }
}

function setAssistantState(newState, reason = '') {
  if (!VALID_STATES.includes(newState)) {
    console.warn(`[Electron] Estado no válido ignorado: ${newState}`);
    return;
  }

  const previousState = assistantState;
  assistantState = newState;

  console.log(`[Electron State Machine] Transición: ${previousState} -> ${assistantState} (${reason || 'sin razón especificada'})`);
  logLifeCycleEvent('STATE_CHANGE', { from: previousState, to: assistantState, reason });

  updateTrayAppearance();

  // Notificar al renderer de la ventana principal si está viva
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('assistant-state-changed', {
      state: assistantState,
      previousState,
      reason,
      timestamp: Date.now(),
    });
  }

  // Notificar también al overlay flotante
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('assistant-state-changed', {
      state: assistantState,
      previousState,
      reason,
      timestamp: Date.now(),
    });
  }

  // Notificar a la ventana en segundo plano de Wake Word (Fase 3: Anti-eco)
  if (wakeWordWindow && !wakeWordWindow.isDestroyed()) {
    wakeWordWindow.webContents.send('assistant-state-changed', {
      state: assistantState,
      previousState,
      reason,
      timestamp: Date.now(),
    });

    if (assistantState === 'SPEAKING' && !wakeWordSettings.bargeIn) {
      wakeWordWindow.webContents.send('wake-word-state-change', {
        active: false,
        reason: 'Anti-eco: Viernes hablando',
      });
    } else if (previousState === 'SPEAKING' && assistantState === 'IDLE') {
      setTimeout(() => {
        if (assistantState === 'IDLE' && wakeWordWindow && !wakeWordWindow.isDestroyed()) {
          wakeWordWindow.webContents.send('wake-word-state-change', {
            active: true,
            reason: 'Reanudación tras decaimiento de eco acústico',
          });
        }
      }, 350);
    }
  }
}

// ==========================================
// 6. RECUPERACIÓN AUTOMÁTICA DEL SERVIDOR EXPRESS
// ==========================================
function waitForServer(port, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    function check() {
      const req = http.get(`http://127.0.0.1:${port}/api/assistant/health`, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          retry();
        }
      });

      req.on('error', () => {
        retry();
      });

      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    }

    function retry() {
      if (Date.now() - startTime > timeoutMs) {
        return reject(new Error('Tiempo de espera agotado al conectar con el servidor interno de Viernes.'));
      }
      setTimeout(check, 200);
    }

    check();
  });
}

async function bootServer() {
  if (isServerBooting) return;
  isServerBooting = true;

  const isPackaged = app.isPackaged;
  const candidateServerPaths = [
    isPackaged ? path.join(app.getAppPath(), 'dist-server/server.cjs') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar', 'dist-server/server.cjs') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'dist-server/server.cjs') : null,
    path.join(__dirname, '../dist-server/server.cjs'),
  ].filter(Boolean);

  const serverPath = candidateServerPaths.find((p) => fs.existsSync(p)) || candidateServerPaths[0];

  try {
    let serverModule;
    if (serverPath && fs.existsSync(serverPath)) {
      serverModule = require(serverPath);
    } else {
      console.log('[Electron] Requeriendo server.ts directamente en desarrollo...');
      serverModule = await import('../server.ts');
    }

    if (serverModule && typeof serverModule.startServer === 'function') {
      const { server, port } = await serverModule.startServer(serverPort || 3000);
      serverInstance = server;
      serverPort = port;

      // Escuchar eventos de caída del servidor
      if (serverInstance && typeof serverInstance.on === 'function') {
        serverInstance.on('error', (err) => {
          console.error('[Electron] Error emitido por servidor interno:', err);
          handleServerFailure(err);
        });
        serverInstance.on('close', () => {
          if (!isQuitting) {
            console.warn('[Electron] El servidor Express se cerró inesperadamente.');
            handleServerFailure(new Error('Servidor cerrado inesperadamente'));
          }
        });
      }
    } else {
      serverPort = 3000;
    }

    await waitForServer(serverPort);
    console.log(`[Electron] Servidor Express respondiendo operativamente en puerto ${serverPort}.`);

    // Restablecer contador de reintentos tras éxito
    serverRestartAttempts = 0;
    if (assistantState === 'ERROR') {
      setAssistantState('IDLE', 'Servidor Express recuperado exitosamente');
    }
    logLifeCycleEvent('SERVER_ONLINE', { port: serverPort });
  } catch (err) {
    console.warn('[Electron] Fallo iniciando servidor Express:', err.message);
    handleServerFailure(err);
  } finally {
    isServerBooting = false;
  }
}

function handleServerFailure(err) {
  if (isQuitting) return;

  setAssistantState('ERROR', `Fallo de servidor: ${err.message}`);
  serverRestartAttempts++;

  // Retroceso exponencial: 1s, 2s, 4s, 8s, 16s... hasta un tope de 30s
  const backoffMs = Math.min(1000 * Math.pow(2, serverRestartAttempts - 1), 30000);
  logLifeCycleEvent('SERVER_FAILURE', {
    error: err.message,
    attempt: serverRestartAttempts,
    nextRetryMs: backoffMs,
  });

  console.warn(`[Electron Watchdog] Reintentando arranque de servidor en ${backoffMs}ms (Intento #${serverRestartAttempts})...`);
  setTimeout(() => {
    if (!isQuitting) {
      bootServer();
    }
  }, backoffMs);
}

// Watchdog de salud periódica cada 12 segundos
function startServerHealthWatchdog() {
  if (serverHealthInterval) clearInterval(serverHealthInterval);
  serverHealthInterval = setInterval(() => {
    if (isQuitting || isServerBooting) return;

    const req = http.get(`http://127.0.0.1:${serverPort}/api/assistant/health`, (res) => {
      if (res.statusCode === 200) {
        if (assistantState === 'ERROR' && serverRestartAttempts > 0) {
          serverRestartAttempts = 0;
          setAssistantState('IDLE', 'Watchdog detectó servidor online');
        }
      } else {
        handleServerFailure(new Error(`Código de salud inesperado: ${res.statusCode}`));
      }
    });

    req.on('error', (err) => {
      handleServerFailure(err);
    });

    req.setTimeout(2500, () => {
      req.destroy();
      handleServerFailure(new Error('Timeout de salud del servidor (> 2.5s)'));
    });
  }, 12000);
}

// ==========================================
// 7. VENTANA PRINCIPAL CON CARGA PEREZOSA (LAZY LOAD) Y DESCARGA TRAS 5 MIN
// ==========================================
let mainWindowUnloadTimer = null;
let currentPowerProfile = 'balanced';

function getProfileConfig(profile) {
  switch (profile) {
    case 'eco':
      return {
        profile: 'eco',
        notificationIntervalMs: 60000,
        idleTimeoutSeconds: 60,
        mainWindowUnloadTimeoutMs: 3 * 60 * 1000, // 3 min
        orbFpsIdle: 0,
      };
    case 'performance':
      return {
        profile: 'performance',
        notificationIntervalMs: 15000,
        idleTimeoutSeconds: 600,
        mainWindowUnloadTimeoutMs: 15 * 60 * 1000, // 15 min
        orbFpsIdle: 60,
      };
    case 'balanced':
    default:
      return {
        profile: 'balanced',
        notificationIntervalMs: 30000,
        idleTimeoutSeconds: 120,
        mainWindowUnloadTimeoutMs: 5 * 60 * 1000, // 5 min
        orbFpsIdle: 1,
      };
  }
}

function applyPowerProfile(profileName, isTemporaryBattery = false) {
  currentPowerProfile = profileName || 'balanced';
  const cfg = getProfileConfig(currentPowerProfile);
  console.log(`[Electron Energy] Perfil "${cfg.profile}" activo (Notifs: ${cfg.notificationIntervalMs / 1000}s, Unload: ${cfg.mainWindowUnloadTimeoutMs / 60000}m, IdleFps: ${cfg.orbFpsIdle})`);

  if (notificationReader) {
    notificationReader.setIntervalMs(cfg.notificationIntervalMs);
  }

  [overlayWindow, mainWindow].forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('power-profile-changed', {
        profile: cfg.profile,
        orbFpsIdle: cfg.orbFpsIdle,
        isTemporaryBattery,
      });
    }
  });
}

function scheduleMainWindowUnload() {
  cancelMainWindowUnload();
  const cfg = getProfileConfig(currentPowerProfile);
  mainWindowUnloadTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.log(`[Electron Memory Optimizer] Destruyendo ventana principal tras ${cfg.mainWindowUnloadTimeoutMs / 60000} min oculta para liberar ~140MB RAM.`);
      logLifeCycleEvent('MAIN_WINDOW_UNLOADED_IDLE', { freedEstimateMb: 140 });
      try {
        mainWindow.destroy();
      } catch {}
      mainWindow = null;
    }
  }, cfg.mainWindowUnloadTimeoutMs);
}

function cancelMainWindowUnload() {
  if (mainWindowUnloadTimer) {
    clearTimeout(mainWindowUnloadTimer);
    mainWindowUnloadTimer = null;
  }
}

function createWindow() {
  cancelMainWindowUnload();
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const iconPath = getAppIconPath();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'Viernes (FRIDAY)',
    backgroundColor: '#05070d',
    autoHideMenuBar: true,
    show: false,
    icon: iconPath && fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
    },
  });

  // Permisos multimedia para micrófono y notificaciones
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'notifications', 'mediaKeySystem'];
    if (allowed.includes(permission)) {
      return callback(true);
    }
    if (details && (details.mediaTypes?.includes('audio') || details.mediaType === 'audio')) {
      return callback(true);
    }
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'notifications', 'mediaKeySystem'];
    if (allowed.includes(permission)) return true;
    if (details && (details.mediaTypes?.includes('audio') || details.mediaType === 'audio')) {
      return true;
    }
    return false;
  });

  if (typeof session.defaultSession.setDevicePermissionHandler === 'function') {
    session.defaultSession.setDevicePermissionHandler((details) => {
      if (details.deviceType === 'microphone' || details.deviceType === 'audioCapture') {
        return true;
      }
      return false;
    });
  }

  // Enrutamiento de enlaces externos al navegador del sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      if (!url.includes(`localhost:${serverPort}`) && !url.includes(`127.0.0.1:${serverPort}`)) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.includes(`localhost:${serverPort}`) && !url.includes(`127.0.0.1:${serverPort}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // ==========================================
  // 3. CERRAR LA VENTANA SOLO LA OCULTA Y PROGRAMA DESCARGA (Fase 4: Paso 1.2)
  // ==========================================
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      logLifeCycleEvent('WINDOW_HIDE_ON_CLOSE');
      scheduleMainWindowUnload();
    }
  });

  mainWindow.on('hide', () => {
    scheduleMainWindowUnload();
  });

  mainWindow.on('show', () => {
    cancelMainWindowUnload();
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  mainWindow.once('ready-to-show', () => {
    cancelMainWindowUnload();
    mainWindow.show();
    mainWindow.focus();
    logLifeCycleEvent('WINDOW_SHOWN');
  });

  return mainWindow;
}

function openMainWindow() {
  cancelMainWindowUnload();
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
}

// ==========================================
// FASE 2: OVERLAY FLOTANTE RESIDENTE (BrowserWindow)
// ==========================================
function validateOverlayPosition(savedX, savedY, width = 88, height = 88) {
  try {
    const displays = screen.getAllDisplays();
    if (!displays || displays.length === 0) {
      return { x: 100, y: 100 };
    }

    const isValid = displays.some((d) => {
      const { x, y, width: dw, height: dh } = d.workArea;
      return (
        savedX >= x - 20 &&
        savedX + width <= x + dw + 20 &&
        savedY >= y - 20 &&
        savedY + height <= y + dh + 20
      );
    });

    if (isValid) {
      return { x: savedX, y: savedY };
    }

    // El monitor fue desconectado o las coordenadas quedaron fuera de rango
    const primary = screen.getPrimaryDisplay();
    const { x, y, width: pw, height: ph } = primary.workArea;
    return {
      x: x + pw - width - 24,
      y: y + ph - height - 24,
    };
  } catch (err) {
    console.warn('[Electron] Error validando coordenadas de monitor:', err.message);
    return { x: 100, y: 100 };
  }
}

function getOverlayCornerPosition(corner = 'bottom-right', displayId = null, width = 88, height = 88) {
  try {
    const displays = screen.getAllDisplays();
    let target = null;
    if (displayId) {
      target = displays.find((d) => d.id === displayId);
    }
    if (!target) {
      target = screen.getPrimaryDisplay();
    }
    const { x, y, width: dw, height: dh } = target.workArea;
    const margin = 24;

    switch (corner) {
      case 'top-left':
        return { x: x + margin, y: y + margin };
      case 'top-right':
        return { x: x + dw - width - margin, y: y + margin };
      case 'bottom-left':
        return { x: x + margin, y: y + dh - height - margin };
      case 'bottom-right':
      default:
        return { x: x + dw - width - margin, y: y + dh - height - margin };
    }
  } catch {
    return { x: 100, y: 100 };
  }
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.showInactive();
    overlayVisible = true;
    updateTrayAppearance();
    return overlayWindow;
  }

  const stored = readStoredSettings();
  let initialPos;

  if (
    stored.overlayPosition &&
    typeof stored.overlayPosition.x === 'number' &&
    typeof stored.overlayPosition.y === 'number'
  ) {
    initialPos = validateOverlayPosition(stored.overlayPosition.x, stored.overlayPosition.y, 88, 88);
  } else {
    initialPos = getOverlayCornerPosition(stored.overlayCorner || 'bottom-right', stored.overlayDisplayId, 88, 88);
  }

  compactOverlayBounds = { x: initialPos.x, y: initialPos.y, width: 88, height: 88 };

  overlayWindow = new BrowserWindow({
    x: initialPos.x,
    y: initialPos.y,
    width: 88,
    height: 88,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
    },
  });

  // Requisitos específicos de Fase 2
  // Nota de plataforma: en Windows, 'screen-saver' sitúa la ventana sobre fullscreen; 'visibleOnFullScreen' solo aplica a macOS.
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  if (typeof overlayWindow.setVisibleOnAllWorkspaces === 'function') {
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  // Click-through inicial para pasar clics a través de la transparencia
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.loadURL(`http://127.0.0.1:${serverPort}/overlay.html`);

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.showInactive();
    overlayVisible = true;
    updateTrayAppearance();
    logLifeCycleEvent('OVERLAY_SHOWN_INACTIVE', { x: initialPos.x, y: initialPos.y });
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    overlayVisible = false;
    updateTrayAppearance();
  });

  return overlayWindow;
}

function toggleOverlayVisibility() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
    overlayVisible = true;
  } else {
    if (overlayWindow.isVisible()) {
      overlayWindow.hide();
      overlayVisible = false;
    } else {
      overlayWindow.showInactive();
      overlayVisible = true;
    }
  }
  updateStoredSettings({ overlayEnabled: overlayVisible });
  updateTrayAppearance();
  logLifeCycleEvent('OVERLAY_VISIBILITY_TOGGLED', { visible: overlayVisible });
  return overlayVisible;
}

// 7. Atajo global (Ctrl+Alt+V) para simular activación y capturar comando de voz
function triggerVoiceActivationFromShortcut() {
  logLifeCycleEvent('GLOBAL_SHORTCUT_TRIGGERED');
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  } else if (!overlayWindow.isVisible()) {
    overlayWindow.showInactive();
    overlayVisible = true;
    updateTrayAppearance();
  }

  setAssistantState('LISTENING', 'Atajo global de teclado (Ctrl+Alt+V)');
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay-trigger-listening', { source: 'globalShortcut' });
  }
}

// ==========================================
// FASE 3: VENTANA OCULTA DEDICADA DE WAKE WORD (show:false, backgroundThrottling:false)
// ==========================================
function createWakeWordWindow() {
  if (wakeWordWindow && !wakeWordWindow.isDestroyed()) {
    return wakeWordWindow;
  }

  wakeWordWindow = new BrowserWindow({
    width: 200,
    height: 200,
    show: false,
    focusable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false, // CRÍTICO: Impide que Chromium suspenda el AudioContext o AudioWorklet en reposo
    },
  });

  wakeWordWindow.loadURL(`http://127.0.0.1:${serverPort}/wake-word.html`);

  wakeWordWindow.once('ready-to-show', () => {
    console.log('[Electron Wake Word] Ventana oculta de escucha continua en segundo plano inicializada.');
    logLifeCycleEvent('WAKE_WORD_WINDOW_READY');
  });

  wakeWordWindow.on('closed', () => {
    wakeWordWindow = null;
  });

  return wakeWordWindow;
}

// Control del sistema de energía y suspensión (Fase 3 y 4: powerMonitor)
function setupPowerMonitor() {
  try {
    powerMonitor.on('lock-screen', () => {
      console.log('[PowerMonitor] Pantalla bloqueada. Pausando detector de voz y sondeo de notificaciones...');
      logLifeCycleEvent('SCREEN_LOCKED');
      setAssistantState('PAUSED', 'Pantalla de Windows bloqueada');
      if (notificationReader) notificationReader.suspend();
    });

    powerMonitor.on('unlock-screen', () => {
      console.log('[PowerMonitor] Pantalla desbloqueada. Reanudando escucha...');
      logLifeCycleEvent('SCREEN_UNLOCKED');
      if (assistantState === 'PAUSED') {
        setAssistantState('IDLE', 'Pantalla de Windows desbloqueada');
      }
      if (notificationReader) notificationReader.resume();
    });

    powerMonitor.on('suspend', () => {
      console.log('[PowerMonitor] Sistema en suspensión. Pausando detector...');
      logLifeCycleEvent('SYSTEM_SUSPEND');
      setAssistantState('PAUSED', 'Sistema suspendido');
      if (notificationReader) notificationReader.suspend();
    });

    powerMonitor.on('resume', () => {
      console.log('[PowerMonitor] Sistema reanudado de suspensión. Restableciendo estado...');
      logLifeCycleEvent('SYSTEM_RESUME');
      if (assistantState === 'PAUSED') {
        setAssistantState('IDLE', 'Sistema reanudado');
      }
      if (notificationReader) notificationReader.resume();
    });

    // Optimización automática de batería (Paso 1.3: isOnBatteryPower)
    powerMonitor.on('on-battery', () => {
      console.log('[PowerMonitor] Equipo con BATERÍA. Activando perfil de ahorro energético...');
      logLifeCycleEvent('ON_BATTERY_POWER');
      applyPowerProfile('eco', true);
    });

    powerMonitor.on('on-ac', () => {
      console.log('[PowerMonitor] Equipo con ALIMENTACIÓN DE RED (AC). Restaurando perfil regular...');
      logLifeCycleEvent('ON_AC_POWER');
      const stored = readStoredSettings();
      applyPowerProfile(stored.powerProfile || 'balanced', false);
    });
  } catch (err) {
    console.warn('[PowerMonitor] No se pudo inicializar powerMonitor:', err.message);
  }
}

function registerGlobalShortcuts(customShortcut) {
  try {
    const stored = readStoredSettings();
    const shortcut = customShortcut || stored.globalShortcutCombo || 'CommandOrControl+Alt+V';

    if (globalShortcutStatus.shortcut) {
      try {
        globalShortcut.unregister(globalShortcutStatus.shortcut);
      } catch {}
    }

    const registered = globalShortcut.register(shortcut, () => {
      console.log(`[Electron Global Shortcut] ${shortcut} pulsado. Activando flujo de voz...`);
      triggerVoiceActivationFromShortcut();
    });

    if (registered) {
      globalShortcutStatus = { registered: true, shortcut, error: null };
      console.log(`[Electron] Atajo global registrado exitosamente: ${shortcut}`);
    } else {
      globalShortcutStatus = {
        registered: false,
        shortcut,
        error: `El atajo "${shortcut}" no pudo registrarse (posiblemente ocupado por otro programa de Windows).`,
      };
      console.warn(`[Electron] ${globalShortcutStatus.error}`);
    }
    return globalShortcutStatus;
  } catch (err) {
    globalShortcutStatus = {
      registered: false,
      shortcut: customShortcut || 'CommandOrControl+Alt+V',
      error: err.message,
    };
    console.warn('[Electron] Error registrando globalShortcut:', err.message);
    return globalShortcutStatus;
  }
}

// ==========================================
// 4. BANDEJA DEL SISTEMA (TRAY) CON MENÚ COMPLETO
// ==========================================
function togglePauseListening() {
  if (assistantState === 'PAUSED') {
    setAssistantState('IDLE', 'Reanudada escucha desde la bandeja');
    if (wakeWordWindow && !wakeWordWindow.isDestroyed()) {
      wakeWordWindow.webContents.send('wake-word-state-change', { active: true, reason: 'Reanudada desde bandeja' });
    }
  } else {
    setAssistantState('PAUSED', 'Pausada escucha desde la bandeja');
    if (wakeWordWindow && !wakeWordWindow.isDestroyed()) {
      wakeWordWindow.webContents.send('wake-word-state-change', { active: false, reason: 'Pausada desde bandeja' });
    }
  }
}

function toggleMuteMic(muted) {
  isMicMuted = typeof muted === 'boolean' ? muted : !isMicMuted;
  console.log(`[Electron Tray] Micrófono silenciado: ${isMicMuted}`);
  [mainWindow, overlayWindow, wakeWordWindow].forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('microphone-mute-changed', isMicMuted);
    }
  });
  updateTrayAppearance();
}

function buildTrayContextMenu() {
  if (!tray) return;

  const isPaused = assistantState === 'PAUSED';

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir Viernes',
      click: () => openMainWindow(),
    },
    {
      label: isPaused ? '▶ Reanudar Escucha' : '⏸ Pausar Escucha',
      click: () => togglePauseListening(),
    },
    {
      label: overlayVisible ? 'Ocultar Overlay Flotante' : 'Mostrar Overlay Flotante',
      click: () => toggleOverlayVisibility(),
    },
    {
      label: 'Silenciar Micrófono',
      type: 'checkbox',
      checked: isMicMuted,
      click: (item) => toggleMuteMic(item.checked),
    },
    { type: 'separator' },
    {
      label: `Control del Dispositivo: ${deviceControl && deviceControl.getConfig().enabled ? 'ACTIVO' : 'DESACTIVADO'}`,
      enabled: false,
    },
    {
      label: '🚨 BOTÓN DE PÁNICO: Desactivar Todo el Control',
      click: () => {
        if (deviceControl) {
          deviceControl.panicDisable('Pulsado desde la bandeja del sistema');
          [mainWindow, overlayWindow].forEach((win) => {
            if (win && !win.isDestroyed()) {
              win.webContents.send('device-control-updated', deviceControl.getConfig());
            }
          });
          updateTrayAppearance();
        }
      },
    },
    { type: 'separator' },
    {
      label: `Estado: ${assistantState}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Salir de Viernes',
      click: () => {
        isQuitting = true;
        logLifeCycleEvent('APP_QUIT_REQUESTED');
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray() {
  const iconPath = getTrayIconPathForState(assistantState);

  try {
    let img = nativeImage.createFromPath(iconPath);
    if (img.isEmpty()) {
      img = nativeImage.createFromPath(getAppIconPath());
    }
    tray = new Tray(img);
    buildTrayContextMenu();
    tray.setToolTip('Viernes (FRIDAY) - Asistente en Segundo Plano');

    tray.on('double-click', () => {
      openMainWindow();
    });
  } catch (err) {
    console.warn('[Electron] No se pudo inicializar la bandeja del sistema:', err.message);
  }
}

// ==========================================
// LECTOR DE NOTIFICACIONES DE WINDOWS (Paso 1.4: 30s-60s y suspensión por inactividad)
// ==========================================
function initNotificationReader() {
  const cfg = getProfileConfig(currentPowerProfile);
  notificationReader = new WindowsNotificationReader({
    intervalMs: cfg.notificationIntervalMs,
    onNotification: (notif) => {
      // Si el usuario está inactivo > idleTimeoutSeconds, no despertar interfaces
      try {
        const idleSec = powerMonitor.getSystemIdleTime();
        if (idleSec > cfg.idleTimeoutSeconds) {
          return;
        }
      } catch {}

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('notification-received', notif);
      }
    },
  });
  notificationReader.start();
}

// ==========================================
// 1. MANEJADOR DE SEGUNDA INSTANCIA
// ==========================================
app.on('second-instance', (event, commandLine, workingDirectory) => {
  console.log('[Electron] Intento de segunda instancia detectado. Enfocando ventana existente...');
  openMainWindow();
});

// ==========================================
// CONTROLADORES IPC (Puente Seguro Preload)
// ==========================================
ipcMain.handle('open-external', (event, url) => {
  if (url) shell.openExternal(url);
});

ipcMain.handle('open-main-window', () => {
  openMainWindow();
  return true;
});

ipcMain.handle('minimize-main-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
  return true;
});

ipcMain.handle('get-user-data-path', () => {
  return userDataDir;
});

ipcMain.handle('launch-edge-app', (event, port) => {
  const targetPort = port || serverPort;
  const targetUrl = `http://localhost:${targetPort}`;
  if (process.platform === 'win32') {
    spawn('msedge', [`--app=${targetUrl}`], { detached: true, stdio: 'ignore' }).unref();
  } else {
    shell.openExternal(targetUrl);
  }
});

// 2. Autoinicio con app.setLoginItemSettings
ipcMain.handle('get-auto-start', () => {
  const loginSettings = app.getLoginItemSettings({ args: ['--hidden'] });
  const stored = readStoredSettings();
  return {
    openAtLogin: loginSettings.openAtLogin || !!stored.startWithWindows,
    startHidden: stored.startHidden !== undefined ? !!stored.startHidden : true,
  };
});

ipcMain.handle('set-auto-start', (event, config) => {
  const openAtLogin = typeof config === 'boolean' ? config : !!config?.openAtLogin;
  const startHidden = typeof config === 'object' && config.startHidden !== undefined ? !!config.startHidden : true;

  const launchArgs = startHidden ? ['--hidden'] : [];

  app.setLoginItemSettings({
    openAtLogin,
    args: launchArgs,
    path: process.execPath,
  });

  updateStoredSettings({
    startWithWindows: openAtLogin,
    startHidden,
  });

  logLifeCycleEvent('AUTO_START_CONFIG_CHANGED', { openAtLogin, startHidden });
  return { openAtLogin, startHidden };
});

// 5. Máquina de estados IPC
ipcMain.handle('assistant-get-state', () => {
  return {
    state: assistantState,
    isMicMuted,
    overlayVisible,
    timestamp: Date.now(),
  };
});

ipcMain.handle('assistant-set-state', (event, newState, reason) => {
  setAssistantState(newState, reason || 'Invocado por UI/Renderer');
  return { success: true, state: assistantState };
});

// Micrófono y Overlay (Fase 2 hook)
ipcMain.handle('get-microphone-muted', () => isMicMuted);
ipcMain.handle('set-microphone-muted', (event, muted) => {
  toggleMuteMic(muted);
  return isMicMuted;
});

ipcMain.handle('toggle-overlay', () => {
  return toggleOverlayVisibility();
});

// Click-through: ignorar eventos de ratón en zonas transparentes
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(ignore, options);
  }
});

// Expansión / Contracción del overlay según modo
ipcMain.handle('set-overlay-expanded', (event, expanded) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const [x, y] = overlayWindow.getPosition();
  const display = screen.getDisplayNearestPoint({ x, y }) || screen.getPrimaryDisplay();
  const { x: dx, y: dy, width: dw, height: dh } = display.workArea;

  if (expanded) {
    compactOverlayBounds = { x, y, width: 88, height: 88 };
    const targetW = 380;
    const targetH = 500;

    let targetX = x;
    let targetY = y;

    // Si el orbe está cerca del borde inferior, expandir hacia arriba
    if (y + targetH > dy + dh) {
      targetY = Math.max(dy + 12, dy + dh - targetH - 16);
    }
    // Si el orbe está cerca del borde derecho, expandir hacia la izquierda
    if (x + targetW > dx + dw) {
      targetX = Math.max(dx + 12, dx + dw - targetW - 16);
    }

    overlayWindow.setBounds({ x: targetX, y: targetY, width: targetW, height: targetH });
    overlayWindow.setIgnoreMouseEvents(false);
  } else {
    let targetX = compactOverlayBounds.x;
    let targetY = compactOverlayBounds.y;
    if (targetX + 88 > dx + dw) targetX = dx + dw - 98;
    if (targetY + 88 > dy + dh) targetY = dy + dh - 98;
    overlayWindow.setBounds({ x: targetX, y: targetY, width: 88, height: 88 });
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.setFocusable(false); // Paso 0.a: Garantizar que pierde foco y no bloquea al contraerse
  }
});

// Movimiento y persistencia de posición tras arrastre
ipcMain.handle('overlay-move-by', (event, { dx, dy }) => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const [currentX, currentY] = overlayWindow.getPosition();
  overlayWindow.setPosition(currentX + dx, currentY + dy);
});

ipcMain.handle('overlay-save-position', () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return null;
  const [x, y] = overlayWindow.getPosition();
  updateStoredSettings({
    overlayPosition: { x, y },
  });
  compactOverlayBounds = { ...compactOverlayBounds, x, y };
  logLifeCycleEvent('OVERLAY_POSITION_SAVED', { x, y });
  return { x, y };
});

ipcMain.handle('get-displays', () => {
  try {
    const primary = screen.getPrimaryDisplay();
    return screen.getAllDisplays().map((d) => ({
      id: d.id,
      bounds: d.bounds,
      workArea: d.workArea,
      isPrimary: d.id === primary.id,
      scaleFactor: d.scaleFactor,
    }));
  } catch {
    return [];
  }
});

ipcMain.handle('set-overlay-corner', (event, { corner, displayId }) => {
  const newPos = getOverlayCornerPosition(corner, displayId, 88, 88);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setPosition(newPos.x, newPos.y);
    compactOverlayBounds = { x: newPos.x, y: newPos.y, width: 88, height: 88 };
  }
  updateStoredSettings({
    overlayCorner: corner,
    overlayDisplayId: displayId,
    overlayPosition: newPos,
  });
  return newPos;
});

ipcMain.handle('trigger-global-shortcut-activation', () => {
  triggerVoiceActivationFromShortcut();
  return true;
});

// Paso 0.a: Foco dinámico en overlay para permitir escribir en input sin robar foco al estar en reposo
ipcMain.handle('set-overlay-focusable', (event, focusable) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setFocusable(!!focusable);
    if (focusable) {
      overlayWindow.focus();
    }
  }
  return true;
});

// Paso 0.b: Estado y configuración dinámica del atajo global
ipcMain.handle('get-global-shortcut-status', () => {
  return globalShortcutStatus;
});

ipcMain.handle('set-global-shortcut', (event, shortcut) => {
  const status = registerGlobalShortcuts(shortcut);
  if (status.registered) {
    updateStoredSettings({ globalShortcutCombo: shortcut });
  }
  return status;
});

// Fase 3: Ajustes y eventos de Wake Word
ipcMain.handle('get-wake-word-settings', () => {
  const stored = readStoredSettings();
  wakeWordSettings = {
    enabled: stored.wakeWordEnabled !== undefined ? stored.wakeWordEnabled : true,
    phrase: stored.wakeWordPhrase || 'viernes',
    sensitivity: typeof stored.wakeWordSensitivity === 'number' ? stored.wakeWordSensitivity : 0.65,
    micDeviceId: stored.selectedMicDeviceId || '',
    bargeIn: !!stored.bargeInEnabled,
  };
  return wakeWordSettings;
});

ipcMain.handle('set-wake-word-settings', (event, newSettings) => {
  wakeWordSettings = { ...wakeWordSettings, ...newSettings };
  updateStoredSettings({
    wakeWordEnabled: wakeWordSettings.enabled,
    wakeWordPhrase: wakeWordSettings.phrase,
    wakeWordSensitivity: wakeWordSettings.sensitivity,
    selectedMicDeviceId: wakeWordSettings.micDeviceId,
    bargeInEnabled: wakeWordSettings.bargeIn,
  });
  if (wakeWordWindow && !wakeWordWindow.isDestroyed()) {
    wakeWordWindow.webContents.send('wake-word-state-change', {
      settings: wakeWordSettings,
      active: wakeWordSettings.enabled && assistantState !== 'PAUSED' && !isMicMuted,
    });
  }
  return true;
});

ipcMain.handle('notify-wake-word-detected', (event, payload) => {
  console.log(`[Electron Wake Word] Detección confirmada: ${payload?.phrase || 'viernes'} (confianza: ${payload?.confidence || 1})`);
  logLifeCycleEvent('WAKE_WORD_DETECTED', payload);

  // Barge-in: Si Viernes estaba hablando y el usuario dice la palabra de activación, interrumpir TTS
  if (assistantState === 'SPEAKING') {
    console.log('[Electron Wake Word] Interrupción de voz (Barge-in): deteniendo TTS en curso...');
    [mainWindow, overlayWindow].forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('tts-stop');
      }
    });
  }

  setAssistantState('WAKE_DETECTED', `Palabra clave detectada (${payload?.phrase || 'viernes'})`);

  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  } else if (!overlayWindow.isVisible()) {
    overlayWindow.showInactive();
    overlayVisible = true;
    updateTrayAppearance();
  }

  // Notificar a overlay para iniciar captura de comando (Etapa 2)
  setTimeout(() => {
    setAssistantState('LISTENING', 'Escuchando comando de voz tras wake word');
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay-trigger-listening', { source: 'wakeWord', payload });
    }
  }, 120);

  return true;
});

// Paso 0.d: Bloqueo de TTS único para evitar que ambas ventanas hablen simultáneamente
ipcMain.handle('notify-tts-started', (event) => {
  activeTtsSender = event.sender;
  setAssistantState('SPEAKING', 'Respuesta por voz activa');
  [mainWindow, overlayWindow].forEach((win) => {
    if (win && !win.isDestroyed() && win.webContents !== event.sender) {
      win.webContents.send('tts-stop');
    }
  });
  return true;
});

ipcMain.handle('notify-tts-ended', (event) => {
  if (activeTtsSender === event.sender) {
    activeTtsSender = null;
  }
  if (assistantState === 'SPEAKING') {
    setAssistantState('IDLE', 'Lectura de voz finalizada');
  }
  return true;
});

// Paso 0.d: Sincronización de historial de chat entre la ventana principal y el overlay
ipcMain.handle('sync-chat-message', (event, message) => {
  [mainWindow, overlayWindow].forEach((win) => {
    if (win && !win.isDestroyed() && win.webContents !== event.sender) {
      win.webContents.send('sync-chat-message', message);
    }
  });
  return true;
});

// Lector de notificaciones
ipcMain.handle('get-recent-notifications', () => {
  return notificationReader ? notificationReader.getHistory() : [];
});

ipcMain.handle('set-notification-reader-config', (event, config) => {
  if (!notificationReader) return false;
  if (config.enabled !== undefined) {
    if (config.enabled) notificationReader.start();
    else notificationReader.stop();
  }
  if (config.allowedApps || config.blockedApps) {
    notificationReader.setFilters({
      allowedApps: config.allowedApps,
      blockedApps: config.blockedApps,
    });
  }
  return true;
});

// Cifrado con safeStorage
ipcMain.handle('encrypt-string', (event, text) => {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(text).toString('base64');
  }
  return Buffer.from(text).toString('base64');
});

ipcMain.handle('decrypt-string', (event, encryptedBase64) => {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(encryptedBase64, 'base64'));
    } catch {
      return Buffer.from(encryptedBase64, 'base64').toString('utf-8');
    }
  }
  return Buffer.from(encryptedBase64, 'base64').toString('utf-8');
});

// Proxy
ipcMain.handle('get-system-proxy', async (event, testUrl = 'https://generativelanguage.googleapis.com') => {
  try {
    const resolved = await session.defaultSession.resolveProxy(testUrl);
    return resolved || 'DIRECT';
  } catch {
    return 'DIRECT';
  }
});

ipcMain.handle('set-network-proxy', async (event, proxyUrl) => {
  try {
    if (proxyUrl && proxyUrl.trim()) {
      const cleanProxy = proxyUrl.trim();
      await session.defaultSession.setProxy({ proxyRules: cleanProxy });
      process.env.HTTPS_PROXY = cleanProxy;
      process.env.HTTP_PROXY = cleanProxy;
      console.log(`[Electron] Proxy de red configurado: ${cleanProxy}`);
    } else {
      await session.defaultSession.setProxy({ mode: 'system' });
      delete process.env.HTTPS_PROXY;
      delete process.env.HTTP_PROXY;
      console.log('[Electron] Proxy de red restablecido a modo del sistema (Direct/System).');
    }
    return { success: true };
  } catch (err) {
    console.warn('[Electron] Error configurando proxy:', err.message);
    return { success: false, error: err.message };
  }
});

// Perfiles de Energía & Optimización (Fase 4: Paso 1.6)
ipcMain.handle('get-power-profile', () => {
  const stored = readStoredSettings();
  return stored.powerProfile || currentPowerProfile || 'balanced';
});

ipcMain.handle('set-power-profile', (event, profile) => {
  if (['eco', 'balanced', 'performance'].includes(profile)) {
    updateStoredSettings({ powerProfile: profile });
    applyPowerProfile(profile, false);
    return true;
  }
  return false;
});

ipcMain.handle('get-system-power-status', () => {
  try {
    return {
      onBattery: powerMonitor.isOnBatteryPower(),
      idleTimeSeconds: powerMonitor.getSystemIdleTime(),
    };
  } catch {
    return { onBattery: false, idleTimeSeconds: 0 };
  }
});

// ==========================================
// CONTROL Y ADMINISTRACIÓN DEL DISPOSITIVO (Fase 5)
// ==========================================
ipcMain.handle('device-control-get-config', () => {
  return deviceControl ? deviceControl.getConfig() : null;
});

ipcMain.handle('device-control-set-config', (event, newConfig) => {
  if (!deviceControl) return { success: false, error: 'DeviceControl no inicializado' };
  const success = deviceControl.saveConfig(newConfig);
  const updated = deviceControl.getConfig();
  [mainWindow, overlayWindow].forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('device-control-updated', updated);
    }
  });
  updateTrayAppearance();
  return { success, config: updated };
});

ipcMain.handle('device-control-execute', async (event, request) => {
  if (!deviceControl) return { success: false, error: 'DeviceControl no disponible' };
  return await deviceControl.handleDeviceAction(request);
});

ipcMain.handle('device-control-confirm', async (event, { actionId, confirmed, method }) => {
  if (!deviceControl) return { success: false, error: 'DeviceControl no disponible' };
  return await deviceControl.confirmPendingAction(actionId, confirmed, method);
});

ipcMain.handle('device-control-get-audit-logs', (event, limit) => {
  if (!deviceControl) return [];
  return deviceControl.getAuditLogs(limit || 100);
});

ipcMain.handle('device-control-undo', async (event, auditEntryId) => {
  if (!deviceControl) return { success: false, error: 'DeviceControl no disponible' };
  return await deviceControl.undoAction(auditEntryId);
});

ipcMain.handle('device-control-panic', (event, reason) => {
  if (!deviceControl) return { success: false };
  const res = deviceControl.panicDisable(reason || 'Pulsado desde la interfaz');
  [mainWindow, overlayWindow].forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('device-control-updated', deviceControl.getConfig());
    }
  });
  updateTrayAppearance();
  return res;
});

// ==========================================
// CICLO DE VIDA DE ELECTRON
// ==========================================
app.whenReady().then(async () => {
  try {
    // 1. Cargar proxy si existía guardado
    const credsPath = path.join(userDataDir, 'viernes_credentials.json');
    if (fs.existsSync(credsPath)) {
      try {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
        if (creds.proxy && creds.proxy.trim()) {
          const proxy = creds.proxy.trim();
          await session.defaultSession.setProxy({ proxyRules: proxy });
          process.env.HTTPS_PROXY = proxy;
          process.env.HTTP_PROXY = proxy;
        }
      } catch {}
    }

    // 2. Iniciar servidor Express
    await bootServer();
    startServerHealthWatchdog();

    // 3. Crear bandeja del sistema
    createTray();

    // 4. Iniciar lector de notificaciones
    initNotificationReader();

    // 5. Registrar atajos globales (Fase 2 y 3)
    registerGlobalShortcuts();

    // 5b. Monitor de energía de Windows y perfil (Fase 3 y 4)
    const storedSettings = readStoredSettings();
    applyPowerProfile(storedSettings.powerProfile || 'balanced');
    setupPowerMonitor();

    // 6. Iniciar overlay flotante si está habilitado (por defecto habilitado)
    if (storedSettings.overlayEnabled !== false) {
      console.log('[Electron] Inicializando Overlay Flotante permanente...');
      createOverlayWindow();
    }

    // 6b. Iniciar ventana oculta de escucha de Wake Word (Fase 3)
    if (storedSettings.wakeWordEnabled !== false) {
      console.log('[Electron] Inicializando ventana oculta de Wake Word continua...');
      createWakeWordWindow();
    }

    // 7. Evaluar si arranca en segundo plano (Lazy load)
    const hasHiddenArg = process.argv.includes('--hidden');
    const wasOpenedAsHidden = app.getLoginItemSettings().wasOpenedAsHidden;
    const shouldStartHidden = hasHiddenArg || wasOpenedAsHidden || storedSettings.startHidden === true;

    logLifeCycleEvent('APP_READY', {
      hasHiddenArg,
      wasOpenedAsHidden,
      startHiddenSetting: storedSettings.startHidden,
      shouldStartHidden,
      overlayEnabled: storedSettings.overlayEnabled !== false,
    });

    if (shouldStartHidden) {
      console.log('[Electron] Viernes arrancó en segundo plano silencioso (--hidden). Ventana principal en espera.');
      setAssistantState('IDLE', 'Inicio en segundo plano silencioso');
    } else {
      console.log('[Electron] Viernes arrancó en modo interactivo. Mostrando ventana principal...');
      openMainWindow();
      setAssistantState('IDLE', 'Ventana principal inicializada');
    }
  } catch (err) {
    console.error('[Electron] Error crítico durante la inicialización:', err);
    logLifeCycleEvent('BOOT_ERROR', { error: err.message });
  }

  app.on('activate', () => {
    openMainWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  logLifeCycleEvent('APP_BEFORE_QUIT');
});

app.on('window-all-closed', () => {
  // En Windows/Linux mantenemos el asistente vivo en segundo plano en el Tray
  if (isQuitting) {
    app.quit();
  }
});

app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
    console.log('[Electron] Atajos globales liberados.');
  } catch {}

  if (serverHealthInterval) {
    clearInterval(serverHealthInterval);
  }
  if (notificationReader) {
    notificationReader.stop();
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try {
      overlayWindow.destroy();
    } catch {}
  }
  if (wakeWordWindow && !wakeWordWindow.isDestroyed()) {
    try {
      wakeWordWindow.destroy();
    } catch {}
  }
  if (serverInstance && typeof serverInstance.close === 'function') {
    try {
      serverInstance.close();
      console.log('[Electron] Servidor Express cerrado ordenadamente.');
    } catch {}
  }
});
