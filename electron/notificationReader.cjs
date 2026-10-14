const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('sql.js');

class WindowsNotificationReader {
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || 30000; // Paso 1.4: 30s - 60s para mínimo I/O en reposo
    this.onNotification = options.onNotification || (() => {});
    this.timer = null;
    this.seenIds = new Set();
    this.history = [];
    this.maxHistory = 100;
    this.isEnabled = false;
    this.isSuspended = false;

    const locateWasmFile = (file) => {
      const candidates = [
        process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', file) : null,
        path.join(__dirname, '../node_modules/sql.js/dist', file),
        path.join(process.cwd(), 'node_modules/sql.js/dist', file),
      ].filter(Boolean);

      for (const c of candidates) {
        if (fs.existsSync(c)) {
          return c;
        }
      }
      return file;
    };

    try {
      this.sqlPromise = initSqlJs({ locateFile: locateWasmFile });
    } catch {
      this.sqlPromise = initSqlJs();
    }
    this.allowedApps = [];
    this.blockedApps = [];

    // Locate Windows Notification database
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    this.dbPath = path.join(localAppData, 'Microsoft', 'Windows', 'Notifications', 'wpndatabase.db');

    // Limpiar restos de bases temporales al arrancar
    this.cleanOrphanTempFiles();
  }

  cleanOrphanTempFiles() {
    try {
      const tmp = os.tmpdir();
      const files = fs.readdirSync(tmp);
      for (const file of files) {
        if (file.startsWith('wpndatabase_viernes_') || file.startsWith('temp_notifs_')) {
          try {
            fs.unlinkSync(path.join(tmp, file));
          } catch {}
        }
      }
    } catch {}
  }

  suspend() {
    this.isSuspended = true;
    console.log('[NotificationReader] Sondeo suspendido (Pantalla bloqueada o reposo).');
  }

  resume() {
    this.isSuspended = false;
    console.log('[NotificationReader] Sondeo reanudado.');
  }

  setIntervalMs(newMs) {
    this.intervalMs = Math.max(10000, newMs);
    if (this.isEnabled && this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => this.poll(), this.intervalMs);
    }
  }

  // Parse Toast XML Payload
  parsePayloadXml(xmlString) {
    if (!xmlString || typeof xmlString !== 'string') {
      return { title: 'Notificación de Windows', text: '' };
    }

    let title = '';
    let text = '';

    // Regex to extract <text> tags from Toast XML
    const textMatches = [...xmlString.matchAll(/<text(?:\s+[^>]*)?>([\s\S]*?)<\/text>/gi)];
    if (textMatches.length > 0) {
      title = this.cleanXmlEntities(textMatches[0][1]);
      if (textMatches.length > 1) {
        text = textMatches.slice(1).map(m => this.cleanXmlEntities(m[1])).join(' ');
      }
    } else {
      text = this.cleanXmlEntities(xmlString.replace(/<[^>]+>/g, ' ').trim());
    }

    return {
      title: title || 'Notificación del Sistema',
      text: text || '',
    };
  }

  cleanXmlEntities(str) {
    if (!str) return '';
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();
  }

  // Extract clean app name from package string or handler
  cleanAppName(rawName) {
    if (!rawName) return 'Windows';
    const lower = rawName.toLowerCase();
    if (lower.includes('whatsapp')) return 'WhatsApp';
    if (lower.includes('outlook') || lower.includes('mail')) return 'Correo / Outlook';
    if (lower.includes('chrome')) return 'Google Chrome';
    if (lower.includes('edge')) return 'Microsoft Edge';
    if (lower.includes('telegram')) return 'Telegram';
    if (lower.includes('discord')) return 'Discord';
    if (lower.includes('spotify')) return 'Spotify';
    if (lower.includes('slack')) return 'Slack';
    if (lower.includes('teams')) return 'Microsoft Teams';
    if (lower.includes('calendar')) return 'Calendario';

    // Fallback: extract last segment of package
    const parts = rawName.split('.');
    return parts[parts.length - 1].replace(/App|Application|Client/gi, '') || rawName;
  }

  async readDatabase() {
    if (process.platform !== 'win32' || !fs.existsSync(this.dbPath)) {
      if (!this.hasReportedMissing) {
        this.hasReportedMissing = true;
        if (process.platform === 'win32') {
          console.log(`[NotificationReader] Archivo wpndatabase.db no detectado en: ${this.dbPath}. Se desactiva la lectura de notificaciones sin alterar el resto de la aplicación.`);
        } else {
          console.log('[NotificationReader] Entorno de desarrollo no-Windows; lector de wpndatabase en espera pasiva.');
        }
      }
      return [];
    }

    // Copy to temporary file in read-only mode to prevent database locks (Paso 1.4: temp_notifs_*.db)
    const tempDbPath = path.join(os.tmpdir(), `temp_notifs_${Date.now()}_${Math.floor(Math.random() * 1000)}.db`);
    try {
      fs.copyFileSync(this.dbPath, tempDbPath);
      const fileBuffer = fs.readFileSync(tempDbPath);
      const SQL = await this.sqlPromise;
      const db = new SQL.Database(fileBuffer);

      // Check existing tables
      const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND (name='Notification' OR name='NotificationHandler');");
      if (!tableCheck || tableCheck.length === 0) {
        db.close();
        try { fs.unlinkSync(tempDbPath); } catch {}
        return [];
      }

      // Query notifications joining with App name if available
      let query = `
        SELECT 
          n.PrimaryId,
          n.Type,
          n.Payload,
          n.ArrivalTime,
          COALESCE(h.PrimaryId, 'Windows') as AppSource
        FROM Notification n
        LEFT JOIN NotificationHandler h ON n.HandlerId = h.RecordId
        ORDER BY n.PrimaryId DESC
        LIMIT 40;
      `;

      let queryResults;
      try {
        queryResults = db.exec(query);
      } catch {
        // Fallback to simpler query if schema varies across Windows 10/11 updates
        query = "SELECT PrimaryId, Type, Payload, ArrivalTime, '' as AppSource FROM Notification ORDER BY PrimaryId DESC LIMIT 40;";
        queryResults = db.exec(query);
      }

      db.close();
      try { fs.unlinkSync(tempDbPath); } catch {}

      if (!queryResults || queryResults.length === 0 || !queryResults[0].values) {
        return [];
      }

      const columns = queryResults[0].columns;
      const values = queryResults[0].values;
      const idIdx = columns.indexOf('PrimaryId');
      const payloadIdx = columns.indexOf('Payload');
      const timeIdx = columns.indexOf('ArrivalTime');
      const appIdx = columns.indexOf('AppSource');

      const notifications = [];

      for (const row of values) {
        const id = String(row[idIdx]);
        const payloadRaw = row[payloadIdx];
        const payload = typeof payloadRaw === 'string'
          ? payloadRaw
          : payloadRaw instanceof Uint8Array
          ? Buffer.from(payloadRaw).toString('utf-8')
          : '';
        const appSource = row[appIdx] || '';
        const arrivalTime = row[timeIdx] || Date.now();

        const { title, text } = this.parsePayloadXml(payload);
        const appName = this.cleanAppName(appSource || title);

        notifications.push({
          id,
          app: appName,
          title,
          text,
          timestamp: typeof arrivalTime === 'number' && arrivalTime > 1000000000 ? arrivalTime : Date.now(),
        });
      }

      return notifications;
    } catch (err) {
      try { if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath); } catch {}
      console.warn('[NotificationReader] Aviso al leer wpndatabase:', err.message);
      return [];
    }
  }

  async poll() {
    if (!this.isEnabled || this.isSuspended) return;
    try {
      const list = await this.readDatabase();
      const newItems = [];

      for (const item of list) {
        if (!this.seenIds.has(item.id)) {
          this.seenIds.add(item.id);

          // Check allowed or blocked filters
          if (this.blockedApps.length > 0 && this.blockedApps.includes(item.app.toLowerCase())) {
            continue;
          }
          if (this.allowedApps.length > 0 && !this.allowedApps.includes(item.app.toLowerCase())) {
            continue;
          }

          newItems.push(item);
          this.history.unshift(item);
          if (this.history.length > this.maxHistory) {
            this.history.pop();
          }
        }
      }

      if (newItems.length > 0) {
        for (const item of newItems) {
          this.onNotification(item);
        }
      }
    } catch (e) {
      console.warn('[NotificationReader] Error en ciclo de sondeo:', e);
    }
  }

  start() {
    this.isEnabled = true;
    if (this.timer) clearInterval(this.timer);
    
    // First run to mark existing as seen so we only notify NEW arrivals
    this.readDatabase().then((existing) => {
      for (const item of existing) {
        this.seenIds.add(item.id);
        this.history.push(item);
      }
      console.log(`[NotificationReader] Inicializado. ${this.seenIds.size} notificaciones previas indexadas.`);
      this.timer = setInterval(() => this.poll(), this.intervalMs);
    });
  }

  stop() {
    this.isEnabled = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setFilters(options = {}) {
    if (Array.isArray(options.allowedApps)) {
      this.allowedApps = options.allowedApps.map(a => a.toLowerCase());
    }
    if (Array.isArray(options.blockedApps)) {
      this.blockedApps = options.blockedApps.map(a => a.toLowerCase());
    }
  }

  getHistory() {
    return this.history;
  }

  clearHistory() {
    this.history = [];
  }
}

module.exports = { WindowsNotificationReader };
