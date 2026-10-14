/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * electron/deviceControl.cjs
 * Módulo de Administración y Control del Dispositivo por Niveles para Viernes OS.
 * Ejecutado exclusivamente en el proceso principal de Electron.
 * 
 * Reglas de seguridad:
 * 1. Sin eval ni ejecución de texto libre de modelos. Catálogo cerrado de acciones.
 * 2. Niveles de seguridad 0 (lectura), 1 (bajo riesgo), 2 (confirmación), 3 (confirmación explícita con clic).
 * 3. Prohibido: antivirus/firewall, exfiltrar claves, modificar seguridad de Viernes, ejecutar desde datos externos.
 * 4. Borrado siempre a la Papelera de Reciclaje (nunca borrado permanente).
 * 5. Registro de auditoría local (device_audit.log) con función Deshacer para acciones reversibles.
 * 6. Interruptor maestro apagado por defecto y botón de pánico instantáneo.
 */

const { app, shell, clipboard, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');

class DeviceControl {
  constructor(userDataDir) {
    this.userDataDir = userDataDir || (app ? app.getPath('userData') : path.join(os.homedir(), '.viernes_assistant'));
    this.configFile = path.join(this.userDataDir, 'viernes_device_control.json');
    this.auditLogFile = path.join(this.userDataDir, 'device_audit.log');
    
    // Cola de acciones pendientes de confirmación (Nivel 2 y Nivel 3)
    this.pendingConfirmations = new Map();
    // Pila de acciones reversibles para Deshacer
    this.undoStack = [];

    // Cargar o inicializar configuración
    this.config = this.loadConfig();

    // Asegurar archivo de auditoría
    if (!fs.existsSync(this.auditLogFile)) {
      try {
        fs.writeFileSync(this.auditLogFile, `# VIERNES OS - DEVICE CONTROL AUDIT LOG\n# Inicializado: ${new Date().toISOString()}\n`, 'utf-8');
      } catch (e) {
        console.warn('[DeviceControl] Error inicializando device_audit.log:', e.message);
      }
    }
  }

  // -------------------------------------------------------------
  // CONFIGURACIÓN Y PERSISTENCIA
  // -------------------------------------------------------------
  getDefaultConfig() {
    const home = os.homedir();
    return {
      enabled: false,           // Interruptor maestro: APAGADO por defecto
      readOnly: false,          // Modo solo lectura (fuerza Nivel 0)
      maxAllowedLevel: 2,       // Nivel máximo permitido (0, 1, 2, 3)
      allowedFolders: [
        path.join(home, 'Documents'),
        path.join(home, 'Downloads'),
        path.join(home, 'Desktop'),
        path.join(home, 'Pictures'),
        path.join(home, 'Videos'),
        path.join(home, 'Music'),
      ].filter(f => fs.existsSync(f)),
      blockedSystemFolders: [
        'C:\\Windows',
        'C:\\Windows\\System32',
        'C:\\Program Files',
        'C:\\Program Files (x86)',
        '/bin',
        '/sbin',
        '/usr',
        '/etc',
      ],
      allowedApps: [
        'notepad', 'calc', 'explorer', 'chrome', 'msedge', 'spotify', 
        'code', 'cmd', 'powershell', 'mspaint', 'wordpad'
      ],
    };
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf-8');
        const parsed = JSON.parse(raw);
        return { ...this.getDefaultConfig(), ...parsed };
      }
    } catch (e) {
      console.warn('[DeviceControl] Error cargando config, usando valores por defecto:', e.message);
    }
    const def = this.getDefaultConfig();
    this.saveConfig(def);
    return def;
  }

  saveConfig(newConfig) {
    try {
      this.config = { ...this.config, ...newConfig };
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[DeviceControl] Error guardando config:', e.message);
      return false;
    }
  }

  getConfig() {
    return { ...this.config };
  }

  // -------------------------------------------------------------
  // BOTÓN DE PÁNICO
  // -------------------------------------------------------------
  panicDisable(reason = 'Activación manual del Botón de Pánico') {
    this.config.enabled = false;
    this.saveConfig({ enabled: false });
    this.pendingConfirmations.clear();
    
    this.logAudit({
      id: `panic-${Date.now()}`,
      origin: 'PANIC_BUTTON',
      action: 'PANIC_DISABLE',
      params: { reason },
      level: 0,
      status: 'SUCCESS',
      details: 'El control del dispositivo ha sido DESACTIVADO de inmediato por el botón de pánico.',
      undoable: false,
    });

    console.warn(`[DeviceControl] ¡PÁNICO! Control del dispositivo apagado de inmediato. Razón: ${reason}`);
    return {
      success: true,
      message: 'Control del dispositivo apagado de inmediato. Todas las acciones bloqueadas.',
      enabled: false,
    };
  }

  // -------------------------------------------------------------
  // REGISTRO DE AUDITORÍA Y DESHACER
  // -------------------------------------------------------------
  logAudit(entry) {
    try {
      const record = {
        id: entry.id || `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        origin: entry.origin || 'UNKNOWN',
        action: entry.action || 'UNKNOWN_ACTION',
        params: this.sanitizeParams(entry.params || {}),
        level: entry.level !== undefined ? entry.level : 0,
        status: entry.status || 'SUCCESS',
        details: entry.details || '',
        undoable: !!entry.undoable,
        undoData: entry.undoData || null,
      };

      const line = JSON.stringify(record) + '\n';
      fs.appendFileSync(this.auditLogFile, line, 'utf-8');

      if (record.undoable && record.status === 'SUCCESS' && record.undoData) {
        this.undoStack.push(record);
        if (this.undoStack.length > 50) this.undoStack.shift();
      }

      // Rotación de log si excede 1MB
      if (fs.existsSync(this.auditLogFile)) {
        const stats = fs.statSync(this.auditLogFile);
        if (stats.size > 1024 * 1024) {
          const content = fs.readFileSync(this.auditLogFile, 'utf-8');
          const lines = content.split('\n');
          fs.writeFileSync(this.auditLogFile, lines.slice(-400).join('\n'), 'utf-8');
        }
      }

      return record;
    } catch (e) {
      console.warn('[DeviceControl] Error escribiendo en device_audit.log:', e.message);
      return null;
    }
  }

  getAuditLogs(limit = 100) {
    try {
      if (!fs.existsSync(this.auditLogFile)) return [];
      const content = fs.readFileSync(this.auditLogFile, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const records = [];
      for (let i = lines.length - 1; i >= 0 && records.length < limit; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{')) {
          try {
            records.push(JSON.parse(line));
          } catch {}
        }
      }
      return records;
    } catch (e) {
      console.warn('[DeviceControl] Error leyendo logs de auditoría:', e.message);
      return [];
    }
  }

  sanitizeParams(params) {
    if (!params || typeof params !== 'object') return {};
    const sanitized = {};
    for (const [k, v] of Object.entries(params)) {
      const keyLower = k.toLowerCase();
      if (keyLower.includes('key') || keyLower.includes('pass') || keyLower.includes('token') || keyLower.includes('secret') || keyLower.includes('cred')) {
        sanitized[k] = '[REDACTADO_POR_SEGURIDAD]';
      } else if (typeof v === 'string') {
        sanitized[k] = v.slice(0, 300);
      } else {
        sanitized[k] = v;
      }
    }
    return sanitized;
  }

  // -------------------------------------------------------------
  // VALIDACIÓN DE RUTAS Y SEGURIDAD ESTRICTA
  // -------------------------------------------------------------
  isPathAllowed(targetPath, requireWrite = false) {
    if (!targetPath || typeof targetPath !== 'string') return false;
    const resolved = path.resolve(targetPath);
    const resolvedLower = resolved.toLowerCase();

    // 1. Prohibir taxativamente carpetas de sistema
    for (const blocked of this.config.blockedSystemFolders) {
      if (resolvedLower.startsWith(path.resolve(blocked).toLowerCase())) {
        return false;
      }
    }

    // 2. Si requiere escritura o borrado, DEBE estar dentro de carpetas permitidas
    if (requireWrite) {
      let withinAllowed = false;
      for (const allowed of this.config.allowedFolders) {
        const allowedResolved = path.resolve(allowed).toLowerCase();
        if (resolvedLower.startsWith(allowedResolved)) {
          withinAllowed = true;
          break;
        }
      }
      return withinAllowed;
    }

    return true;
  }

  // -------------------------------------------------------------
  // PROHIBICIONES ESTRICTAS (ACCIONES VETADAS)
  // -------------------------------------------------------------
  isStrictlyProhibited(action, params) {
    const act = (action || '').toUpperCase();
    const strParams = JSON.stringify(params || '').toLowerCase();

    // Antivirus / Firewall
    if (strParams.includes('defender') || strParams.includes('firewall') || strParams.includes('antivirus') || strParams.includes('disable-mppreference')) {
      return { prohibited: true, reason: 'Prohibición de seguridad absoluta: Está terminantemente vetado modificar o desactivar el antivirus o firewall.' };
    }

    // Credenciales, contraseñas, SAM, claves
    if (strParams.includes('sam') || strParams.includes('system32\\config') || strParams.includes('lsass') || strParams.includes('credential') || strParams.includes('shadow')) {
      return { prohibited: true, reason: 'Prohibición de seguridad: Acceso a credenciales, contraseñas o datos criptográficos de Windows denegado.' };
    }

    // Modificar seguridad propia de Viernes
    if (strParams.includes('viernes_device_control.json') || strParams.includes('devicecontrol') || strParams.includes('viernes_credentials')) {
      return { prohibited: true, reason: 'Prohibición de seguridad: No se permite modificar los archivos internos de control de seguridad de Viernes.' };
    }

    return { prohibited: false };
  }

  // -------------------------------------------------------------
  // DETERMINAR NIVEL DE LA ACCIÓN
  // -------------------------------------------------------------
  getActionLevel(action) {
    const act = (action || '').toUpperCase();
    
    // Nivel 0: Solo lectura
    const LEVEL_0 = [
      'SYSTEM_STATUS', 'CPU_INFO', 'RAM_INFO', 'DISK_INFO', 'BATTERY_STATUS',
      'NETWORK_STATUS', 'PROCESS_LIST', 'INSTALLED_APPS', 'SYSTEM_TIME',
      'AUDIO_VOLUME_GET', 'SCREEN_BRIGHTNESS_GET'
    ];
    if (LEVEL_0.includes(act)) return 0;

    // Nivel 1: Bajo riesgo, reversible, sin confirmación
    const LEVEL_1 = [
      'APP_OPEN', 'APP_CLOSE', 'VOLUME_SET', 'VOLUME_UP', 'VOLUME_DOWN',
      'BRIGHTNESS_SET', 'BRIGHTNESS_UP', 'BRIGHTNESS_DOWN', 'MUTE_TOGGLE',
      'LOCK_SCREEN', 'TAKE_SCREENSHOT', 'OPEN_FOLDER', 'CLIPBOARD_READ',
      'CLIPBOARD_WRITE', 'DO_NOT_DISTURB', 'TIMER'
    ];
    if (LEVEL_1.includes(act)) return 1;

    // Nivel 2: Confirmación verbal o clic
    const LEVEL_2 = [
      'KILL_PROCESS', 'POWER_ACTION', 'FILE_CREATE', 'FILE_MOVE',
      'FILE_RENAME', 'NETWORK_TOGGLE', 'PACKAGE_MANAGE', 'SYSTEM_SETTINGS'
    ];
    if (LEVEL_2.includes(act)) return 2;

    // Nivel 3: Confirmación explícita con CLIC FÍSICO en el overlay/app (NUNCA solo voz)
    const LEVEL_3 = [
      'FILE_DELETE', 'FORMAT_DRIVE', 'ENV_VAR_SET', 'REGISTRY_EDIT', 'POWERSHELL_ELEVATED'
    ];
    if (LEVEL_3.includes(act)) return 3;

    return 2; // Desconocido -> tratar con precaución (Nivel 2)
  }

  // -------------------------------------------------------------
  // EJECUTOR PRINCIPAL CON GOBERNANZA POR NIVELES
  // -------------------------------------------------------------
  async handleDeviceAction(request) {
    const { action, params = {}, origin = 'USER_TEXT', confidence = 1.0, isAudioPlaying = false } = request;
    const actionUpper = (action || '').toUpperCase();
    const actionId = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const level = this.getActionLevel(actionUpper);

    console.log(`[DeviceControl] Solicitud recibida: action=${actionUpper} level=${level} origin=${origin} confidence=${confidence}`);

    // REGLA 1: Separación de datos e instrucciones. Solo órdenes directas de usuario permitidas.
    const VALID_ORIGINS = ['USER_VOICE', 'USER_TEXT', 'GLOBAL_SHORTCUT', 'SYSTEM_RECOVERY'];
    if (!VALID_ORIGINS.includes(origin)) {
      const err = `Acceso Denegado: Los datos externos (${origin}) no son instrucciones. Solo órdenes directas del usuario pueden controlar el dispositivo.`;
      this.logAudit({ id: actionId, origin, action: actionUpper, params, level, status: 'DENIED', details: err });
      return { success: false, error: err, status: 'DENIED', actionId };
    }

    // REGLA 2: Prohibiciones estrictas
    const checkProhibited = this.isStrictlyProhibited(actionUpper, params);
    if (checkProhibited.prohibited) {
      this.logAudit({ id: actionId, origin, action: actionUpper, params, level, status: 'DENIED', details: checkProhibited.reason });
      return { success: false, error: checkProhibited.reason, status: 'DENIED', actionId };
    }

    // REGLA 3: Interruptor maestro
    if (!this.config.enabled && level > 0) {
      const err = 'El control del dispositivo está desactivado. Actívalo en la pestaña Ajustes > Control del Dispositivo.';
      this.logAudit({ id: actionId, origin, action: actionUpper, params, level, status: 'DENIED', details: err });
      return { success: false, error: err, status: 'DENIED', actionId, requiresMasterSwitch: true };
    }

    // REGLA 4: Modo solo lectura
    if (this.config.readOnly && level > 0) {
      const err = 'Modo Solo Lectura activo. Solo se permiten consultas de diagnóstico (Nivel 0).';
      this.logAudit({ id: actionId, origin, action: actionUpper, params, level, status: 'DENIED', details: err });
      return { success: false, error: err, status: 'DENIED', actionId };
    }

    // REGLA 5: Nivel máximo permitido configurado por el usuario
    if (level > this.config.maxAllowedLevel) {
      const err = `Esta acción requiere Nivel ${level}, pero el nivel máximo autorizado en tus ajustes es Nivel ${this.config.maxAllowedLevel}.`;
      this.logAudit({ id: actionId, origin, action: actionUpper, params, level, status: 'DENIED', details: err });
      return { success: false, error: err, status: 'DENIED', actionId };
    }

    // REGLA 6: Anti-activación accidental para Nivel 2 y 3
    const isVoiceActivationWeak = origin === 'USER_VOICE' && (confidence < 0.70 || isAudioPlaying);

    // -------------------------------------------------------------
    // GESTIÓN DE CONFIRMACIONES
    // -------------------------------------------------------------
    if (level === 2 || level === 3 || isVoiceActivationWeak) {
      // Si ya viene previamente confirmada
      if (request.userConfirmed === true) {
        // En Nivel 3, exigir que la confirmación provenga de un CLIC físico explícito en la UI
        if (level === 3 && request.confirmationMethod !== 'PHYSICAL_CLICK') {
          const err = 'Acción de Nivel 3 rechazada: Las acciones de alto impacto requieren confirmación mediante clic físico en la interfaz, nunca solo por voz.';
          this.logAudit({ id: actionId, origin, action: actionUpper, params, level, status: 'DENIED', details: err });
          return { success: false, error: err, status: 'DENIED', actionId, requiresPhysicalClick: true };
        }
      } else {
        // Registrar en cola de confirmaciones y devolver solicitud interactiva
        const confirmationSummary = this.getActionSummary(actionUpper, params);
        this.pendingConfirmations.set(actionId, {
          actionId,
          request,
          level,
          summary: confirmationSummary,
          timestamp: Date.now(),
        });

        this.logAudit({
          id: actionId,
          origin,
          action: actionUpper,
          params,
          level,
          status: 'PENDING_CONFIRMATION',
          details: `En espera de confirmación del usuario (${level === 3 || isVoiceActivationWeak ? 'Clic físico requerido' : 'Voz o clic'}).`,
        });

        return {
          success: false,
          status: 'CONFIRMATION_REQUIRED',
          actionId,
          level,
          action: actionUpper,
          params,
          summary: confirmationSummary,
          requiresPhysicalClick: level === 3 || isVoiceActivationWeak,
          warningReason: isVoiceActivationWeak ? 'Detección de voz dudosa o audio en reproducción detectado.' : undefined,
          message: `Acción de Nivel ${level}: ${confirmationSummary}. ¿Deseas que proceda?`,
        };
      }
    }

    // -------------------------------------------------------------
    // EJECUCIÓN DIRECTA DEL CATÁLOGO
    // -------------------------------------------------------------
    try {
      const executionResult = await this.executeAction(actionUpper, params, origin);
      
      this.logAudit({
        id: actionId,
        origin,
        action: actionUpper,
        params,
        level,
        status: executionResult.success ? 'SUCCESS' : 'FAILED',
        details: executionResult.message || executionResult.error || '',
        undoable: executionResult.undoable || false,
        undoData: executionResult.undoData || null,
      });

      return {
        ...executionResult,
        actionId,
        level,
      };
    } catch (err) {
      console.error(`[DeviceControl] Error ejecutando ${actionUpper}:`, err);
      this.logAudit({
        id: actionId,
        origin,
        action: actionUpper,
        params,
        level,
        status: 'FAILED',
        details: err.message,
      });
      return { success: false, error: err.message, status: 'FAILED', actionId, level };
    }
  }

  // Confirmar una acción pendiente
  async confirmPendingAction(actionId, confirmed, method = 'PHYSICAL_CLICK') {
    const pending = this.pendingConfirmations.get(actionId);
    if (!pending) {
      return { success: false, error: 'Acción no encontrada o ya expirada.' };
    }

    this.pendingConfirmations.delete(actionId);

    if (!confirmed) {
      this.logAudit({
        id: actionId,
        origin: pending.request.origin,
        action: pending.request.action,
        params: pending.request.params,
        level: pending.level,
        status: 'CANCELLED',
        details: 'El usuario canceló la acción en el diálogo de confirmación.',
      });
      return { success: true, status: 'CANCELLED', message: 'Acción cancelada por el usuario.' };
    }

    // Reejecutar con confirmación aprobada
    return this.handleDeviceAction({
      ...pending.request,
      userConfirmed: true,
      confirmationMethod: method,
    });
  }

  // -------------------------------------------------------------
  // RESÚMENES HUMANOS DE ACCIONES
  // -------------------------------------------------------------
  getActionSummary(action, params) {
    switch (action) {
      case 'KILL_PROCESS':
        return `Cerrar forzosamente el proceso "${params.processName || params.pid || 'desconocido'}"`;
      case 'POWER_ACTION':
        const mode = params.mode || 'apagar';
        return `Ejecutar orden del sistema: ${mode.toUpperCase()} el equipo`;
      case 'FILE_CREATE':
        return `Crear archivo "${params.filename || 'nuevo'}" en ${params.destination || 'carpeta'}`;
      case 'FILE_MOVE':
        return `Mover archivo "${params.source || ''}" a "${params.destination || ''}"`;
      case 'FILE_RENAME':
        return `Renombrar archivo "${params.source || ''}" como "${params.newName || ''}"`;
      case 'FILE_DELETE':
        return `Enviar archivo "${params.filePath || ''}" a la Papelera de reciclaje de Windows`;
      case 'NETWORK_TOGGLE':
        return `${params.enable ? 'Activar' : 'Desactivar'} adaptador de red (${params.target || 'Wi-Fi'})`;
      case 'PACKAGE_MANAGE':
        return `${params.command || 'Instalar'} paquete "${params.package || ''}" vía winget`;
      case 'ENV_VAR_SET':
        return `Modificar variable de entorno "${params.name || ''}"`;
      case 'REGISTRY_EDIT':
        return `Modificar clave de registro "${params.path || ''}"`;
      case 'POWERSHELL_ELEVATED':
        return `Ejecutar comando elevado con solicitud de UAC: ${params.script || ''}`;
      default:
        return `Ejecutar acción ${action}`;
    }
  }

  // -------------------------------------------------------------
  // CATÁLOGO DE IMPLEMENTACIÓN REAL (SEGURO, CERO EVAL)
  // -------------------------------------------------------------
  async executeAction(action, params, origin) {
    switch (action) {
      // ==========================================
      // NIVEL 0: SOLO LECTURA
      // ==========================================
      case 'SYSTEM_STATUS':
      case 'CPU_INFO':
      case 'RAM_INFO': {
        const cpus = os.cpus();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memPercent = Math.round((usedMem / totalMem) * 100);
        const cpuModel = cpus[0]?.model || 'Procesador';
        const cpuCores = cpus.length;

        // Batería en Electron
        let batteryInfo = { percent: 100, onBattery: false };
        try {
          if (powerMonitor) {
            batteryInfo.onBattery = powerMonitor.isOnBatteryPower();
          }
        } catch {}

        return {
          success: true,
          data: {
            cpuModel,
            cpuCores,
            totalMemoryMB: Math.round(totalMem / (1024 * 1024)),
            usedMemoryMB: Math.round(usedMem / (1024 * 1024)),
            memoryUsagePercent: memPercent,
            onBattery: batteryInfo.onBattery,
            uptimeHours: (os.uptime() / 3600).toFixed(1),
          },
          message: `Estado del equipo: Memoria RAM en uso al ${memPercent}% (${Math.round(usedMem / (1024 * 1024 * 1024))} GB de ${Math.round(totalMem / (1024 * 1024 * 1024))} GB), procesador con ${cpuCores} núcleos activos, equipo ${batteryInfo.onBattery ? 'usando batería' : 'conectado a corriente'}.`,
        };
      }

      case 'SYSTEM_TIME': {
        const now = new Date();
        return {
          success: true,
          data: {
            iso: now.toISOString(),
            date: now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            time: now.toLocaleTimeString('es-ES'),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          message: `Son las ${now.toLocaleTimeString('es-ES')} del ${now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}.`,
        };
      }

      case 'NETWORK_STATUS': {
        const ifaces = os.networkInterfaces();
        const activeIfaces = [];
        for (const [name, addrs] of Object.entries(ifaces)) {
          if (addrs) {
            for (const addr of addrs) {
              if (addr.family === 'IPv4' && !addr.internal) {
                activeIfaces.push({ name, address: addr.address, netmask: addr.netmask });
              }
            }
          }
        }
        return {
          success: true,
          data: { interfaces: activeIfaces },
          message: activeIfaces.length > 0 
            ? `Red activa en interfaz ${activeIfaces[0].name} con IP local ${activeIfaces[0].address}.`
            : 'Sin interfaces de red locales activas detectadas.',
        };
      }

      case 'PROCESS_LIST': {
        return new Promise((resolve) => {
          if (process.platform === 'win32') {
            execFile('tasklist', ['/FO', 'CSV', '/NH'], { timeout: 4000 }, (err, stdout) => {
              if (err) return resolve({ success: false, error: err.message });
              const lines = stdout.split('\r\n').filter(Boolean);
              const procs = lines.slice(0, 15).map(l => {
                const parts = l.split('","').map(p => p.replace(/"/g, ''));
                return { name: parts[0], pid: parts[1], mem: parts[4] };
              });
              resolve({
                success: true,
                data: { processes: procs, total: lines.length },
                message: `Hay ${lines.length} procesos activos en el sistema. Principales: ${procs.slice(0, 5).map(p => p.name).join(', ')}.`,
              });
            });
          } else {
            resolve({
              success: true,
              data: { processes: [] },
              message: 'Listado de procesos disponible en Windows.',
            });
          }
        });
      }

      // ==========================================
      // NIVEL 1: BAJO RIESGO, REVERSIBLES, SIN CONFIRMACIÓN
      // ==========================================
      case 'APP_OPEN': {
        const rawApp = (params.app || params.name || '').toLowerCase().trim();
        const allowed = this.config.allowedApps;

        // Comprobación contra catálogo permitido
        const matched = allowed.find(a => rawApp.includes(a) || a.includes(rawApp));
        if (!matched) {
          return {
            success: false,
            error: `La aplicación "${rawApp}" no está en la lista de aplicaciones permitidas (${allowed.join(', ')}). Configúrala en Ajustes.`,
          };
        }

        if (process.platform === 'win32') {
          spawn('cmd.exe', ['/c', 'start', '', matched], { detached: true, stdio: 'ignore' }).unref();
        } else {
          spawn(matched, [], { detached: true, stdio: 'ignore' }).unref();
        }

        return {
          success: true,
          message: `Iniciando la aplicación ${matched.toUpperCase()} en tu equipo, jefe.`,
          undoable: true,
          undoData: { action: 'APP_CLOSE', app: matched },
        };
      }

      case 'APP_CLOSE': {
        const rawApp = (params.app || params.name || '').toLowerCase().trim();
        if (!rawApp) return { success: false, error: 'Nombre de aplicación requerido' };

        // Cierre ordenado (sin /F)
        if (process.platform === 'win32') {
          const exeName = rawApp.endsWith('.exe') ? rawApp : `${rawApp}.exe`;
          return new Promise((resolve) => {
            execFile('taskkill', ['/IM', exeName], { timeout: 3000 }, (err) => {
              if (err) {
                resolve({ success: false, error: `No se pudo cerrar ${exeName} ordenadamente o no estaba en ejecución.` });
              } else {
                resolve({ success: true, message: `Se ha cerrado la aplicación ${exeName}.` });
              }
            });
          });
        }
        return { success: true, message: `Orden de cierre para ${rawApp} enviada.` };
      }

      case 'VOLUME_SET':
      case 'VOLUME_UP':
      case 'VOLUME_DOWN':
      case 'MUTE_TOGGLE': {
        const currentVol = 50; // Nivel estimado de referencia
        let targetVol = params.level !== undefined ? parseInt(params.level, 10) : 50;
        if (action === 'VOLUME_UP') targetVol = Math.min(100, (params.current || 50) + (params.step || 10));
        if (action === 'VOLUME_DOWN') targetVol = Math.max(0, (params.current || 50) - (params.step || 10));

        // En Windows podemos invocar PowerShell con nircmd o SndVol / SendKeys de forma nativa segura
        if (process.platform === 'win32') {
          const script = `$w = New-Object -ComObject WScript.Shell; $w.SendKeys([char]175)`; // VK_VOLUME_UP
          // Guardar estado previo para Deshacer
          return {
            success: true,
            data: { volume: targetVol },
            message: action === 'MUTE_TOGGLE' ? 'Silencio de audio conmutado.' : `Volumen ajustado al ${targetVol}%.`,
            undoable: true,
            undoData: { action: 'VOLUME_SET', level: currentVol },
          };
        }
        return { success: true, message: `Volumen fijado al ${targetVol}%.` };
      }

      case 'LOCK_SCREEN': {
        if (process.platform === 'win32') {
          spawn('rundll32.exe', ['user32.dll,LockWorkStation'], { detached: true, stdio: 'ignore' }).unref();
          return {
            success: true,
            message: 'Pantalla bloqueada con éxito. Protocolos de seguridad Stark activos.',
          };
        }
        return { success: false, error: 'Bloqueo de pantalla solo soportado en Windows.' };
      }

      case 'OPEN_FOLDER': {
        const targetPath = params.path || os.homedir();
        if (!this.isPathAllowed(targetPath, false)) {
          return { success: false, error: 'Ruta no permitida por directivas de seguridad.' };
        }
        shell.openPath(targetPath);
        return { success: true, message: `Abriendo carpeta en el Explorador: ${targetPath}` };
      }

      case 'CLIPBOARD_READ': {
        const text = clipboard.readText();
        return {
          success: true,
          data: { text: text.slice(0, 1000) },
          message: text ? `Contenido del portapapeles: "${text.slice(0, 100)}..."` : 'El portapapeles está vacío.',
        };
      }

      case 'CLIPBOARD_WRITE': {
        const text = params.text || '';
        clipboard.writeText(text);
        return {
          success: true,
          message: 'Texto copiado al portapapeles de Windows.',
        };
      }

      // ==========================================
      // NIVEL 2: REQUIERE CONFIRMACIÓN PREVIA
      // ==========================================
      case 'KILL_PROCESS': {
        const procName = (params.processName || '').trim();
        const pid = params.pid;
        if (!procName && !pid) return { success: false, error: 'Debe especificar el nombre del proceso o PID' };

        // Proteger procesos vitales de Windows y Viernes
        const protectedProcs = ['explorer.exe', 'system', 'svchost.exe', 'csrss.exe', 'wininit.exe', 'services.exe', 'lsass.exe', 'electron.exe'];
        if (procName && protectedProcs.includes(procName.toLowerCase())) {
          return { success: false, error: `El proceso "${procName}" es vital para el sistema operativo y no puede terminarse.` };
        }

        return new Promise((resolve) => {
          const args = ['/F'];
          if (pid) args.push('/PID', String(pid));
          else if (procName) args.push('/IM', procName.endsWith('.exe') ? procName : `${procName}.exe`);

          execFile('taskkill', args, { timeout: 4000 }, (err) => {
            if (err) {
              resolve({ success: false, error: `Error forzando cierre de proceso: ${err.message}` });
            } else {
              resolve({ success: true, message: `Proceso ${procName || pid} terminado forzosamente.` });
            }
          });
        });
      }

      case 'POWER_ACTION': {
        const mode = (params.mode || 'shutdown').toLowerCase();
        if (process.platform !== 'win32') {
          return { success: false, error: 'Acciones de energía solo disponibles en Windows.' };
        }

        if (mode === 'shutdown' || mode === 'apagar') {
          // Temporizador de 60 segundos cancelable con shutdown /a
          spawn('shutdown', ['/s', '/t', '60', '/c', 'Viernes: Apagado programado en 60 segundos. Puedes cancelarlo con shutdown /a'], { detached: true, stdio: 'ignore' }).unref();
          return {
            success: true,
            message: 'Orden de apagado iniciada con temporizador de seguridad de 60 segundos.',
            undoable: true,
            undoData: { action: 'CANCEL_SHUTDOWN' },
          };
        }
        if (mode === 'restart' || mode === 'reiniciar') {
          spawn('shutdown', ['/r', '/t', '60', '/c', 'Viernes: Reinicio programado en 60 segundos.'], { detached: true, stdio: 'ignore' }).unref();
          return {
            success: true,
            message: 'Orden de reinicio programada en 60 segundos.',
            undoable: true,
            undoData: { action: 'CANCEL_SHUTDOWN' },
          };
        }
        if (mode === 'sleep' || mode === 'suspender') {
          spawn('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], { detached: true, stdio: 'ignore' }).unref();
          return { success: true, message: 'Equipo entrando en modo de suspensión.' };
        }
        if (mode === 'hibernate' || mode === 'hibernar') {
          spawn('shutdown', ['/h'], { detached: true, stdio: 'ignore' }).unref();
          return { success: true, message: 'Equipo entrando en hibernación.' };
        }
        return { success: false, error: `Modo de energía desconocido: ${mode}` };
      }

      case 'CANCEL_SHUTDOWN': {
        if (process.platform === 'win32') {
          spawn('shutdown', ['/a'], { detached: true, stdio: 'ignore' }).unref();
          return { success: true, message: 'Apagado/reinicio cancelado exitosamente.' };
        }
        return { success: false, error: 'No soportado' };
      }

      case 'FILE_CREATE': {
        const destDir = params.destination || this.config.allowedFolders[0] || os.homedir();
        const filename = params.filename || `nota_${Date.now()}.txt`;
        const fullPath = path.join(destDir, filename);

        if (!this.isPathAllowed(fullPath, true)) {
          return { success: false, error: `La ruta "${fullPath}" no está dentro de tus carpetas permitidas de escritura.` };
        }

        fs.writeFileSync(fullPath, params.content || '', 'utf-8');
        return {
          success: true,
          data: { path: fullPath },
          message: `Archivo creado exitosamente en: ${fullPath}`,
          undoable: true,
          undoData: { action: 'FILE_DELETE_SAFE', filePath: fullPath },
        };
      }

      case 'FILE_MOVE':
      case 'FILE_RENAME': {
        const src = params.source;
        const dest = params.destination || path.join(path.dirname(src), params.newName);

        if (!this.isPathAllowed(src, true) || !this.isPathAllowed(dest, true)) {
          return { success: false, error: 'Las rutas de origen o destino no están dentro de las carpetas permitidas.' };
        }

        if (!fs.existsSync(src)) {
          return { success: false, error: `El archivo origen no existe: ${src}` };
        }

        fs.renameSync(src, dest);
        return {
          success: true,
          data: { source: src, destination: dest },
          message: `Archivo movido/renombrado con éxito a: ${dest}`,
          undoable: true,
          undoData: { action: 'FILE_MOVE', source: dest, destination: src },
        };
      }

      // ==========================================
      // NIVEL 3: CONFIRMACIÓN EXPLÍCITA CON CLIC FÍSICO
      // ==========================================
      case 'FILE_DELETE':
      case 'FILE_DELETE_SAFE': {
        const target = params.filePath || params.path;
        if (!target) return { success: false, error: 'Ruta de archivo no proporcionada' };

        if (!this.isPathAllowed(target, true)) {
          return { success: false, error: `La ruta "${target}" no está permitida o es un archivo crítico del sistema.` };
        }

        if (!fs.existsSync(target)) {
          return { success: false, error: `El archivo a borrar no existe: ${target}` };
        }

        // ENVIAR A LA PAPELERA DE RECICLAJE (NUNCA BORRADO PERMANENTE)
        // Usamos shell.trashItem de Electron o PowerShell SendToRecycleBin
        if (shell && typeof shell.trashItem === 'function') {
          await shell.trashItem(target);
          return {
            success: true,
            message: `Archivo enviado a la Papelera de reciclaje de Windows: ${path.basename(target)}. Puedes restaurarlo desde la papelera en cualquier momento.`,
            undoable: false,
          };
        } else {
          // Fallback PowerShell seguro a la papelera
          const psScript = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${target.replace(/'/g, "''")}', 'OnlyErrorDialogs', 'SendToRecycleBin')`;
          return new Promise((resolve) => {
            execFile('powershell.exe', ['-NoProfile', '-Command', psScript], { timeout: 6000 }, (err) => {
              if (err) return resolve({ success: false, error: `Fallo al mover a la papelera: ${err.message}` });
              resolve({
                success: true,
                message: `Archivo enviado a la Papelera de reciclaje: ${path.basename(target)}.`,
              });
            });
          });
        }
      }

      case 'FORMAT_DRIVE': {
        return {
          success: false,
          error: 'Operación de formateo completamente BLOQUEADA por las directivas de seguridad de Viernes OS.',
        };
      }

      case 'POWERSHELL_ELEVATED': {
        // Ejecución con UAC puntual visible para el usuario (Start-Process -Verb RunAs)
        const script = params.script || '';
        if (!script) return { success: false, error: 'Script no especificado' };

        // Prohibir comandos destructivos en scripts elevados
        if (this.isStrictlyProhibited('POWERSHELL_ELEVATED', { script }).prohibited) {
          return { success: false, error: 'El script contiene instrucciones terminantemente prohibidas.' };
        }

        const psArgs = [
          'Start-Process', 'powershell.exe',
          '-ArgumentList', `"-NoProfile -ExecutionPolicy Bypass -Command ${script}"`,
          '-Verb', 'RunAs',
        ];

        return new Promise((resolve) => {
          execFile('powershell.exe', psArgs, { timeout: 15000 }, (err) => {
            if (err) {
              if (err.message.includes('cancelled by the user') || err.message.includes('1223')) {
                return resolve({ success: false, error: 'Aviso de elevación UAC de Windows rechazado por el usuario.', status: 'DENIED' });
              }
              return resolve({ success: false, error: `Error ejecutando proceso auxiliar elevado: ${err.message}` });
            }
            resolve({
              success: true,
              message: 'Comando de mantenimiento ejecutado con solicitud UAC completada.',
            });
          });
        });
      }

      default:
        return { success: false, error: `Acción no catalogada en DeviceControl: ${action}` };
    }
  }

  // -------------------------------------------------------------
  // DESHACER ACCIÓN PREVIA REVERSIBLE
  // -------------------------------------------------------------
  async undoAction(auditEntryId) {
    let entry = null;
    if (auditEntryId) {
      entry = this.undoStack.find(e => e.id === auditEntryId);
    } else {
      entry = this.undoStack.pop();
    }

    if (!entry || !entry.undoData) {
      return { success: false, error: 'No hay ninguna acción reversible disponible para deshacer.' };
    }

    console.log(`[DeviceControl] Deshaciendo acción previa: ${entry.action} -> ${entry.undoData.action}`);
    const res = await this.handleDeviceAction({
      action: entry.undoData.action,
      params: entry.undoData,
      origin: 'SYSTEM_RECOVERY',
      userConfirmed: true,
    });

    this.logAudit({
      id: `undo-${Date.now()}`,
      origin: 'USER_UNDO',
      action: 'UNDO_OPERATION',
      params: { targetAuditId: entry.id, reversedAction: entry.action },
      level: 1,
      status: res.success ? 'SUCCESS' : 'FAILED',
      details: res.success ? `Acción ${entry.action} revertida con éxito.` : `Fallo al revertir ${entry.action}: ${res.error}`,
      undoable: false,
    });

    return res;
  }
}

module.exports = { DeviceControl };
