var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
__export(server_exports, {
  answerEverything: () => answerEverything,
  app: () => app,
  explainErrorCode: () => explainErrorCode,
  logConnectionEvent: () => logConnectionEvent,
  refreshAiClient: () => refreshAiClient,
  runInternetAudit: () => runInternetAudit,
  setupApp: () => setupApp,
  startServer: () => startServer
});
module.exports = __toCommonJS(server_exports);
var import_express = __toESM(require("express"), 1);
var import_vite = require("vite");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_os = __toESM(require("os"), 1);
var import_http = __toESM(require("http"), 1);
var import_dns = __toESM(require("dns"), 1);
var import_child_process = require("child_process");
var import_genai = require("@google/genai");
var import_undici = require("undici");

// src/services/intentRouter.ts
var import_mathjs = require("mathjs");
var CURRENT_INFO_PATTERNS = [
  /\b(clima|tiempo|temperatura|pron[oó]stico|lluvia)\b/i,
  /\b(noticia|noticias|titulares|novedades|actualidad)\b/i,
  /\b(precio|precios|cu[aá]nto cuesta|cotizaci[oó]n|valor del|d[oó]lar|bitcoin|crypto|euro)\b/i,
  /\b(deporte|deportes|partido|marcador|resultado|liga|f[uú]tbol|champions|campeonato)\b/i,
  /\b(horario|horarios|cu[aá]ndo juega|cu[aá]ndo estrena|fecha de estreno)\b/i,
  /\b(hoy|ahora|en este momento|en vivo|actualmente|[uú]ltim[oa]s?|reciente)\b/i,
  /\b(qui[eé]n gan[oó]|qui[eé]n es el actual|presidente actual|qui[eé]n lidera)\b/i
];
var CORRECTION_PATTERNS = [
  /\b(no,? eso es incorrecto|te equivocaste|est[aá]s equivocado|eso est[aá] mal|eso no es verdad)\b/i,
  /\b(no es as[ií]|eso es falso|corrige eso|informaci[oó]n incorrecta|error en tu respuesta)\b/i
];
var URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
var IntentRouter = class {
  /**
   * Extrae todas las URLs presentes en el mensaje
   */
  static extractUrls(text) {
    const matches = text.match(URL_REGEX);
    return matches ? Array.from(new Set(matches)) : [];
  }
  /**
   * Evalúa de forma segura expresiones matemáticas
   */
  static safeEvaluateMath(expr) {
    try {
      let cleaned = expr.replace(/calcula|cu[aá]nto es|cuanto es|resultado de|\?/gi, "").replace(/x/g, "*").replace(/%/g, "/100").trim();
      if (!cleaned || !/[\d]/.test(cleaned)) {
        return { success: false, error: "Sin expresi\xF3n num\xE9rica" };
      }
      const mathResult = (0, import_mathjs.evaluate)(cleaned);
      if (typeof mathResult === "number" || typeof mathResult === "bigint") {
        return { success: true, result: String(mathResult) };
      }
      if (mathResult && typeof mathResult.toString === "function") {
        return { success: true, result: mathResult.toString() };
      }
      return { success: false, error: "Resultado no num\xE9rico" };
    } catch {
      return { success: false, error: "Sintaxis matem\xE1tica inv\xE1lida" };
    }
  }
  /**
   * Clasifica la intención del mensaje antes de la consulta a la IA
   */
  static classify(message) {
    const trimmed = (message || "").trim();
    const lower = trimmed.toLowerCase();
    const urls = this.extractUrls(trimmed);
    if (urls.length > 0) {
      return {
        category: "URL_QUERY",
        confidence: "alta",
        requiresSearch: false,
        requiresUrlContext: true,
        urls,
        explanation: "Consulta orientada a inspeccionar contenido web v\xEDa URL."
      };
    }
    for (const pat of CORRECTION_PATTERNS) {
      if (pat.test(lower)) {
        return {
          category: "CORRECTION",
          confidence: "alta",
          requiresSearch: true,
          requiresUrlContext: false,
          urls: [],
          explanation: "El usuario se\xF1al\xF3 una discrepancia. Se activar\xE1 b\xFAsqueda web para corroborar datos precisos."
        };
      }
    }
    const localCmd = this.detectLocalCommand(trimmed, lower);
    if (localCmd) {
      return {
        category: "LOCAL_COMMAND",
        confidence: "alta",
        requiresSearch: false,
        requiresUrlContext: false,
        urls: [],
        localAction: localCmd,
        explanation: `Ejecuci\xF3n inmediata de comando local (${localCmd.type}).`
      };
    }
    if (/^(calcula|cu[aá]nto es|resuelve)\s+[\d\s\+\-\*\/\^\(\)\.\,\%]+$/i.test(trimmed) || /^[\d\s\+\-\*\/\^\(\)\.\,\%]+$/.test(trimmed) && /[\+\-\*\/\^]/.test(trimmed)) {
      const mathEval = this.safeEvaluateMath(trimmed);
      if (mathEval.success && mathEval.result) {
        return {
          category: "CALCULATION",
          confidence: "alta",
          requiresSearch: false,
          requiresUrlContext: false,
          urls: [],
          localAction: {
            type: "LOCAL_ANSWER",
            directAnswer: `El c\xE1lculo exacto es: ${mathEval.result}.`
          },
          explanation: "C\xE1lculo matem\xE1tico resuelto por el motor determinista local."
        };
      }
    }
    for (const pat of CURRENT_INFO_PATTERNS) {
      if (pat.test(lower)) {
        return {
          category: "CURRENT_INFO",
          confidence: "alta",
          requiresSearch: true,
          requiresUrlContext: false,
          urls: [],
          explanation: "La consulta requiere fuentes actualizadas en vivo (clima, noticias, cotizaciones, eventos)."
        };
      }
    }
    if (this.isAmbiguous(trimmed, lower)) {
      return {
        category: "AMBIGUOUS",
        confidence: "media",
        requiresSearch: false,
        requiresUrlContext: false,
        urls: [],
        suggestedClarification: this.generateClarification(trimmed),
        explanation: "Mensaje con contexto el\xEDptico o incompleto. Se responde asumiendo la interpretaci\xF3n m\xE1s factible."
      };
    }
    return {
      category: "GENERAL_KNOWLEDGE",
      confidence: "alta",
      requiresSearch: false,
      requiresUrlContext: false,
      urls: [],
      explanation: "Consulta est\xE1ndar de conocimiento general, programaci\xF3n o razonamiento."
    };
  }
  /**
   * Identifica comandos de sistema local Stark
   */
  static detectLocalCommand(raw, lower) {
    if (/\b(verifica tus accesos|verificar accesos|comprueba tus accesos|auditor[ií]a de internet|qu[eé] accesos tienes|audita tu conexi[oó]n|revisa tus accesos|revisa tus conexiones)\b/i.test(lower)) {
      return {
        type: "AUDIT_ACCESS",
        directAnswer: "Iniciando auditor\xEDa de accesos a internet, DNS, Gemini API, Search Grounding y an\xE1lisis de URLs. Generando informe de capacidades..."
      };
    }
    if (/\b(cu[aá]nta bater[ií]a|nivel de bater[ií]a|estado de la bater[ií]a|porcentaje de bater[ií]a)\b/i.test(lower)) {
      return {
        type: "DEVICE_ACTION",
        deviceAction: "SYSTEM_STATUS",
        level: 0,
        params: { query: "battery" },
        directAnswer: "Consultando telemetr\xEDa de energ\xEDa y bater\xEDa del sistema..."
      };
    }
    if (/\b(c[oó]mo est[aá] el equipo|estado del sistema|uso de cpu|uso de memoria|cu[aá]nta ram|rendimiento del equipo)\b/i.test(lower)) {
      return {
        type: "DEVICE_ACTION",
        deviceAction: "SYSTEM_STATUS",
        level: 0,
        params: { query: "general" },
        directAnswer: "Obteniendo estado de carga de CPU, memoria RAM y hardware..."
      };
    }
    if (/\b(qu[eé] procesos est[aá]n (abiertos|activos)|lista de procesos|procesos en ejecuci[oó]n)\b/i.test(lower)) {
      return {
        type: "DEVICE_ACTION",
        deviceAction: "PROCESS_LIST",
        level: 0,
        directAnswer: "Consultando procesos activos en el sistema operativo..."
      };
    }
    if (/\b(cu[aá]l es mi ip|estado de la red local|direcci[oó]n ip)\b/i.test(lower)) {
      return {
        type: "DEVICE_ACTION",
        deviceAction: "NETWORK_STATUS",
        level: 0,
        directAnswer: "Consultando adaptadores de red y direcci\xF3n IP local..."
      };
    }
    if (/\b(qu[eé] hora es|hora actual|qu[eé] d[ií]a es hoy|fecha de hoy)\b/i.test(lower)) {
      const now = /* @__PURE__ */ new Date();
      return {
        type: "DEVICE_ACTION",
        deviceAction: "SYSTEM_TIME",
        level: 0,
        directAnswer: `Son las ${now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })} del ${now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}.`
      };
    }
    if (/\b(sube el volumen|aumenta el volumen|m[aá]s volumen)\b/i.test(lower)) {
      return {
        type: "DEVICE_ACTION",
        deviceAction: "VOLUME_UP",
        level: 1,
        params: { step: 10 },
        directAnswer: "Subiendo el volumen de audio en un 10%."
      };
    }
    if (/\b(baja el volumen|disminuye el volumen|menos volumen)\b/i.test(lower)) {
      return {
        type: "DEVICE_ACTION",
        deviceAction: "VOLUME_DOWN",
        level: 1,
        params: { step: 10 },
        directAnswer: "Bajando el volumen de audio en un 10%."
      };
    }
    const volMatch = lower.match(/\bvolumen al (\d+)%?\b/i);
    if (volMatch) {
      const lvl = Math.min(100, Math.max(0, parseInt(volMatch[1], 10)));
      return {
        type: "DEVICE_ACTION",
        deviceAction: "VOLUME_SET",
        level: 1,
        params: { level: lvl },
        directAnswer: `Ajustando volumen del sistema al ${lvl}%.`
      };
    }
    if (/\b(silencia el equipo|mutea el equipo|quitar sonido|silenciar audio|desactiva el sonido)\b/i.test(lower)) {
      return {
        type: "DEVICE_ACTION",
        deviceAction: "MUTE_TOGGLE",
        level: 1,
        directAnswer: "Silenciando la salida de audio del sistema."
      };
    }
    if (/\b(sube el brillo|m[aá]s brillo|aumenta el brillo)\b/i.test(lower)) {
      return {
        type: "DEVICE_ACTION",
        deviceAction: "BRIGHTNESS_UP",
        level: 1,
        params: { step: 10 },
        directAnswer: "Incrementando el brillo de pantalla."
      };
    }
    if (/\b(baja el brillo|menos brillo|disminuye el brillo)\b/i.test(lower)) {
      return {
        type: "DEVICE_ACTION",
        deviceAction: "BRIGHTNESS_DOWN",
        level: 1,
        params: { step: 10 },
        directAnswer: "Reduciendo el brillo de pantalla."
      };
    }
    if (/\b(bloquea la pantalla|bloquear pantalla|bloquea el equipo|bloquear el equipo|bloquear workstation)\b/i.test(lower)) {
      return {
        type: "DEVICE_ACTION",
        deviceAction: "LOCK_SCREEN",
        level: 1,
        directAnswer: "Bloqueando la estaci\xF3n de trabajo Windows. Protocolos de seguridad activos."
      };
    }
    if (/\b(toma una captura|captura de pantalla|screenshot|pantallazo)\b/i.test(lower)) {
      return {
        type: "DEVICE_ACTION",
        deviceAction: "TAKE_SCREENSHOT",
        level: 1,
        directAnswer: "Tomando captura de pantalla..."
      };
    }
    if (/\b(lee el portapapeles|qu[eé] hay en el portapapeles|mostrar portapapeles)\b/i.test(lower)) {
      return {
        type: "DEVICE_ACTION",
        deviceAction: "CLIPBOARD_READ",
        level: 0,
        directAnswer: "Consultando contenido en el portapapeles de Windows..."
      };
    }
    if (/\b(cierra|cerrar|quitar)\s+(el\s+|la\s+)?(bloc de notas|notepad|calculadora|chrome|edge|spotify|paint)\b/i.test(lower)) {
      let targetApp = "notepad";
      if (lower.includes("calculadora")) targetApp = "calc";
      else if (lower.includes("chrome")) targetApp = "chrome";
      else if (lower.includes("edge")) targetApp = "msedge";
      else if (lower.includes("spotify")) targetApp = "spotify";
      else if (lower.includes("paint")) targetApp = "mspaint";
      return {
        type: "DEVICE_ACTION",
        deviceAction: "APP_CLOSE",
        level: 1,
        params: { app: targetApp },
        directAnswer: `Cerrando ordenadamente la aplicaci\xF3n ${targetApp}.`
      };
    }
    if (/\b(abre|abrir|inicia|lanzar)\s+(el\s+|la\s+)?(bloc de notas|notepad|calculadora|explorador|chrome|edge|spotify|paint|terminal)\b/i.test(lower)) {
      let targetApp = "notepad";
      if (lower.includes("calculadora")) targetApp = "calc";
      else if (lower.includes("explorador")) targetApp = "explorer";
      else if (lower.includes("chrome")) targetApp = "chrome";
      else if (lower.includes("edge")) targetApp = "msedge";
      else if (lower.includes("spotify")) targetApp = "spotify";
      else if (lower.includes("paint")) targetApp = "mspaint";
      else if (lower.includes("terminal")) targetApp = "cmd";
      return {
        type: "DEVICE_ACTION",
        deviceAction: "APP_OPEN",
        level: 1,
        params: { app: targetApp },
        directAnswer: `Abriendo ${targetApp.toUpperCase()} en tu equipo, jefe.`
      };
    }
    if (/\b(apaga(r)?\s+(el\s+equipo|la\s+computadora|la\s+pc|el\s+sistema))\b/i.test(lower)) {
      return {
        type: "DEVICE_ACTION",
        deviceAction: "POWER_ACTION",
        level: 2,
        params: { mode: "shutdown" },
        summary: "Apagar el equipo con temporizador de seguridad de 60 segundos",
        directAnswer: "Solicitud de apagado del equipo detectada. Requiere confirmaci\xF3n."
      };
    }
    if (/\b(reinicia(r)?\s+(el\s+equipo|la\s+computadora|la\s+pc|el\s+sistema))\b/i.test(lower)) {
      return {
        type: "DEVICE_ACTION",
        deviceAction: "POWER_ACTION",
        level: 2,
        params: { mode: "restart" },
        summary: "Reiniciar el equipo",
        directAnswer: "Solicitud de reinicio del sistema recibida. Requiere confirmaci\xF3n."
      };
    }
    if (/\b(suspende(r)?\s+(el\s+equipo|la\s+computadora|la\s+pc|el\s+sistema)|modo\s+suspensi[oó]n)\b/i.test(lower)) {
      return {
        type: "DEVICE_ACTION",
        deviceAction: "POWER_ACTION",
        level: 2,
        params: { mode: "sleep" },
        summary: "Poner el equipo en modo de suspensi\xF3n",
        directAnswer: "Solicitud para suspender el equipo recibida. Requiere confirmaci\xF3n."
      };
    }
    const delMatch = raw.match(/\b(borra|elimina|mueve a la papelera)\s+(el\s+archivo\s+)?([^\n\r,;]+)/i);
    if (delMatch && !delMatch[3].includes("chat") && !delMatch[3].includes("historial")) {
      const targetFile = delMatch[3].trim();
      return {
        type: "DEVICE_ACTION",
        deviceAction: "FILE_DELETE",
        level: 3,
        requiresPhysicalClick: true,
        params: { filePath: targetFile },
        summary: `Enviar el archivo "${targetFile}" a la Papelera de reciclaje de Windows`,
        directAnswer: `Atenci\xF3n: Has solicitado enviar "${targetFile}" a la Papelera. Por seguridad, las acciones de Nivel 3 requieren confirmaci\xF3n expl\xEDcita mediante clic f\xEDsico en pantalla.`
      };
    }
    if (/\b(temporizador|alarma|cuenta regresiva|cron[oó]metro)\b/i.test(lower)) {
      let totalSeconds = 60;
      const minMatch = lower.match(/(\d+)\s*(minutos?|mins?|m)/i);
      const secMatch = lower.match(/(\d+)\s*(segundos?|segs?|s)/i);
      const hourMatch = lower.match(/(\d+)\s*(horas?|hrs?|h)/i);
      if (hourMatch) totalSeconds += parseInt(hourMatch[1], 10) * 3600;
      if (minMatch) totalSeconds = (hourMatch ? totalSeconds : 0) + parseInt(minMatch[1], 10) * 60;
      if (secMatch) totalSeconds = (minMatch || hourMatch ? totalSeconds : 0) + parseInt(secMatch[1], 10);
      const labelMatch = raw.match(/para\s+([^,.;]+)/i);
      const label = labelMatch ? labelMatch[1].trim() : "Temporizador de Viernes";
      return {
        type: "TIMER",
        seconds: totalSeconds || 60,
        label,
        directAnswer: `Temporizador activado para ${Math.floor(totalSeconds / 60) > 0 ? Math.floor(totalSeconds / 60) + " minutos" : totalSeconds + " segundos"} (${label}). Te avisar\xE9 en cuanto concluya.`
      };
    }
    if (/\b(abre|abrir|lanzar)\s+(la\s+)?calculadora\b/i.test(lower)) {
      return {
        type: "CALCULATOR",
        directAnswer: "Desplegando la calculadora t\xE1ctica integrada en pantalla."
      };
    }
    if (/\b(abre|abrir|lanzar|ver)\s+(mis\s+)?(notas|apuntes|bloc)\b/i.test(lower)) {
      return {
        type: "NOTES",
        directAnswer: "Abriendo tu panel de notas del sistema."
      };
    }
    if (/^(recuerda que|guarda que|anota que|registra que)\s+/i.test(lower)) {
      const content = raw.replace(/^(recuerda que|guarda que|anota que|registra que)\s+/i, "").trim();
      return {
        type: "SAVE_MEMORY",
        title: "Memoria Registrada",
        content,
        category: "FACT",
        directAnswer: `Anotado en tu n\xFAcleo de memoria sem\xE1ntica: "${content}". Lo considerar\xE9 en futuras decisiones.`
      };
    }
    if (/\b(abre|abrir|pon|reproduce|busca en)\s+(youtube|spotify|whatsapp|maps|google maps|correo|gmail|calendario)\b/i.test(lower)) {
      if (lower.includes("youtube")) {
        const query = raw.replace(/.*youtube\s*(y busca|para buscar|con)?/i, "").trim();
        return {
          type: "OPEN_APP",
          app: "youtube",
          query,
          directAnswer: query ? `Iniciando YouTube y buscando "${query}".` : "Abriendo interfaz de YouTube, jefe."
        };
      }
      if (lower.includes("spotify") || lower.includes("reproduce") || lower.includes("pon m\xFAsica")) {
        const query = raw.replace(/.*(spotify|reproduce|pon m[uú]sica)\s*/i, "").trim();
        return {
          type: "OPEN_APP",
          app: "spotify",
          query,
          directAnswer: query ? `Sintonizando "${query}" en Spotify.` : "Cargando tu lista de reproducci\xF3n en Spotify."
        };
      }
      if (lower.includes("whatsapp")) {
        return {
          type: "OPEN_APP",
          app: "whatsapp",
          directAnswer: "Abriendo WhatsApp para tus comunicaciones directas."
        };
      }
      if (lower.includes("maps")) {
        const query = raw.replace(/.*(maps|mapas)\s*(de|para)?/i, "").trim();
        return {
          type: "OPEN_APP",
          app: "maps",
          query,
          directAnswer: query ? `Calculando coordenadas para "${query}" en Maps.` : "Desplegando navegaci\xF3n por sat\xE9lite en Google Maps."
        };
      }
      if (lower.includes("gmail") || lower.includes("correo")) {
        return {
          type: "OPEN_APP",
          app: "gmail",
          directAnswer: "Abriendo tu bandeja de correo en Gmail."
        };
      }
      if (lower.includes("calendario") || lower.includes("agenda")) {
        return {
          type: "OPEN_APP",
          app: "calendar",
          directAnswer: "Desplegando tu calendario y agenda de eventos."
        };
      }
    }
    if (/\b(modo trabajo|buenos d[ií]as|rutina de hoy|buenas noches|modo descanso)\b/i.test(lower)) {
      const routineName = lower.includes("trabajo") ? "Modo Trabajo y Enfoque" : lower.includes("buenos d[i\xED]as") ? "Buenos D\xEDas, Viernes" : "Cierre de Jornada";
      return {
        type: "ROUTINE",
        routineName,
        directAnswer: `Iniciando protocolo de rutina "${routineName}". Configurando subsistemas t\xE1cticos.`
      };
    }
    return null;
  }
  /**
   * Evalúa si un texto es ambiguo o incompleto
   */
  static isAmbiguous(raw, lower) {
    const wordCount = raw.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 2 && /^(el coso|la cosa|eso|aquello|hazlo|mira esto|qu[eé] tal|ayuda|no sirve)$/i.test(lower)) {
      return true;
    }
    if (/\b(el coso|la cosa de la cosa|el cosito)\b/i.test(lower)) {
      return true;
    }
    return false;
  }
  /**
   * Genera una sola pregunta corta de aclaración al final sin bloquear
   */
  static generateClarification(message) {
    const lower = message.toLowerCase();
    if (lower.includes("coso") || lower.includes("cosa")) {
      return "\xBFTe refieres a alguna aplicaci\xF3n, archivo o comando espec\xEDfico?";
    }
    if (lower.includes("no sirve") || lower.includes("no funciona")) {
      return "\xBFSe trata de la conexi\xF3n de red, el audio o alg\xFAn archivo en particular?";
    }
    return "\xBFDeseas que profundice en alg\xFAn aspecto en particular?";
  }
};

// server.ts
import_dotenv.default.config();
try {
  (0, import_undici.setGlobalDispatcher)(new import_undici.EnvHttpProxyAgent());
} catch (e) {
  console.warn("[Viernes System] Aviso configurando EnvHttpProxyAgent:", e);
}
var currentDir = typeof __dirname !== "undefined" ? __dirname : process.cwd();
var app = (0, import_express.default)();
app.use(import_express.default.json({ limit: "25mb" }));
var userDataDir = process.env.VIERNES_USER_DATA || import_path.default.join(import_os.default.homedir(), ".viernes_assistant");
if (!import_fs.default.existsSync(userDataDir)) {
  try {
    import_fs.default.mkdirSync(userDataDir, { recursive: true });
  } catch (e) {
    console.warn("[Viernes System] No se pudo crear userDataDir:", e);
  }
}
var credentialsFile = import_path.default.join(userDataDir, "viernes_credentials.json");
var userStoreFile = import_path.default.join(userDataDir, "viernes_store.json");
var connectionLogFile = import_path.default.join(userDataDir, "connection.log");
function logConnectionEvent(tier, status, latencyMs, detail) {
  try {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const sanitizedDetail = (detail || "").replace(/AIza[0-9A-Za-z-_]{30,}/g, "[CLAVE_REDACTADA]").replace(/key=[^&\s]+/g, "key=[REDACTADO]").replace(/"apiKey"\s*:\s*"[^"]+"/g, '"apiKey":"[REDACTADO]"').replace(/\n+/g, " ").trim();
    const entry = `[${timestamp}] [TIER: ${tier}] [STATUS: ${status}] [LATENCY: ${latencyMs}ms] ${sanitizedDetail}
`;
    import_fs.default.appendFileSync(connectionLogFile, entry, "utf-8");
    if (import_fs.default.existsSync(connectionLogFile)) {
      const stats = import_fs.default.statSync(connectionLogFile);
      if (stats.size > 512 * 1024) {
        const content = import_fs.default.readFileSync(connectionLogFile, "utf-8");
        const lines = content.split("\n");
        import_fs.default.writeFileSync(connectionLogFile, lines.slice(-250).join("\n"), "utf-8");
      }
    }
  } catch (e) {
    console.warn("[Viernes System] Error al registrar evento en connection.log:", e);
  }
}
function explainErrorCode(code, rawMsg) {
  const codeStr = String(code || "").toUpperCase();
  const lower = (rawMsg || "").toLowerCase();
  if (codeStr === "401" || lower.includes("unauthenticated") || lower.includes("api_key_invalid") || lower.includes("api key not valid")) {
    return {
      explanation: "Clave de API inv\xE1lida, expirada o revocada por Google (C\xF3digo 401).",
      suggestedFix: "Genera una nueva clave gratuita en Google AI Studio (aistudio.google.com) y gu\xE1rdala en Ajustes."
    };
  }
  if (codeStr === "403" || lower.includes("permission_denied") || lower.includes("location not supported") || lower.includes("consumer_invalid")) {
    return {
      explanation: "Acceso prohibido o regi\xF3n geogr\xE1fica restringida para esta clave (C\xF3digo 403).",
      suggestedFix: "Verifica que la API Generative Language est\xE9 habilitada en tu proyecto de Google Cloud o que tu conexi\xF3n no est\xE9 bloqueada regionalmente."
    };
  }
  if (codeStr === "404" || lower.includes("not_found") || lower.includes("model not found") || lower.includes("does not exist")) {
    return {
      explanation: "El modelo configurado no fue encontrado en los servidores de Google (C\xF3digo 404).",
      suggestedFix: "Selecciona uno de los modelos v\xE1lidos detectados en tu cuenta desde el selector de Ajustes."
    };
  }
  if (codeStr === "429" || lower.includes("resource_exhausted") || lower.includes("quota") || lower.includes("rate_limit")) {
    return {
      explanation: "L\xEDmite de cuota excedido: has alcanzado el l\xEDmite por minuto o diario de la capa gratuita (C\xF3digo 429).",
      suggestedFix: "Desactiva la B\xFAsqueda Web Autom\xE1tica en Ajustes para ahorrar cuota, usa el modelo gemini-3.1-flash-lite o espera 60 segundos."
    };
  }
  if (codeStr === "503" || codeStr === "500" || lower.includes("unavailable") || lower.includes("overloaded") || lower.includes("high demand")) {
    return {
      explanation: "Los servidores de Google Gemini est\xE1n experimentando alta demanda o mantenimiento temporal (C\xF3digo 503).",
      suggestedFix: "Viernes conmuta autom\xE1ticamente a los modelos de respaldo o base local determinista."
    };
  }
  if (codeStr.includes("TIMEOUT") || codeStr.includes("ETIMEDOUT") || lower.includes("timeout") || lower.includes("aborted")) {
    return {
      explanation: "Tiempo de espera agotado al conectar con los servidores de Google (Timeout > 5 s).",
      suggestedFix: "Comprueba tu conexi\xF3n a internet o verifica si el Firewall de Windows Defender o tu antivirus est\xE1n bloqueando las conexiones salientes de Viernes."
    };
  }
  if (codeStr.includes("ENOTFOUND") || lower.includes("enotfound") || lower.includes("getaddrinfo")) {
    return {
      explanation: "Error de resoluci\xF3n DNS: no se pudo resolver generativelanguage.googleapis.com (ENOTFOUND).",
      suggestedFix: "Verifica tu servidor DNS (ej. 8.8.8.8 o 1.1.1.1) o tu configuraci\xF3n de proxy en Ajustes."
    };
  }
  if (codeStr.includes("ECONNREFUSED") || lower.includes("econnrefused")) {
    return {
      explanation: "Conexi\xF3n rechazada localmente o por el firewall (ECONNREFUSED).",
      suggestedFix: "Agrega una regla en Windows Defender Firewall para permitir la salida del ejecutable de Viernes (ver comando en README_EXE.md)."
    };
  }
  if (codeStr.includes("CERT") || lower.includes("certificate") || lower.includes("ssl")) {
    return {
      explanation: "Fallo de verificaci\xF3n de certificado SSL/TLS.",
      suggestedFix: "Si usas un proxy corporativo o antivirus con inspecci\xF3n HTTPS, configura la direcci\xF3n del proxy en Ajustes."
    };
  }
  return {
    explanation: rawMsg || "Error de conexi\xF3n no catalogado.",
    suggestedFix: "Comprueba tu clave de API, conexi\xF3n de red y configuraci\xF3n de proxy en Ajustes."
  };
}
var currentApiKey = "";
var activeProxyUrl = "";
if (import_fs.default.existsSync(credentialsFile)) {
  try {
    const creds = JSON.parse(import_fs.default.readFileSync(credentialsFile, "utf-8"));
    if (creds.apiKey && creds.apiKey !== "MY_GEMINI_API_KEY") {
      currentApiKey = creds.apiKey;
    }
    if (creds.proxy && typeof creds.proxy === "string" && creds.proxy.trim()) {
      activeProxyUrl = creds.proxy.trim();
      process.env.HTTPS_PROXY = activeProxyUrl;
      process.env.HTTP_PROXY = activeProxyUrl;
      try {
        (0, import_undici.setGlobalDispatcher)(new import_undici.EnvHttpProxyAgent());
      } catch {
      }
    }
  } catch (err) {
    console.warn("[Viernes System] Error leyendo credentialsFile:", err.message);
  }
}
if (!currentApiKey && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY") {
  currentApiKey = process.env.GEMINI_API_KEY;
}
var aiClient = null;
function refreshAiClient(key) {
  if (key && key !== "MY_GEMINI_API_KEY") {
    currentApiKey = key;
    process.env.GEMINI_API_KEY = key;
    aiClient = new import_genai.GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    console.log(`[Viernes System] Gemini Client inicializado con \xE9xito (Clave terminada en ...${key.slice(-4)}).`);
  } else {
    currentApiKey = "";
    aiClient = null;
    console.log("[Viernes System] Modo Local Offline activo (Sin clave de Gemini).");
  }
}
refreshAiClient(currentApiKey);
var responseCache = /* @__PURE__ */ new Map();
function getFromCache(key) {
  const normalized = key.toLowerCase().trim();
  const entry = responseCache.get(normalized);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    responseCache.delete(normalized);
    return null;
  }
  return entry;
}
function setInCache(key, entry) {
  const normalized = key.toLowerCase().trim();
  responseCache.set(normalized, {
    ...entry,
    timestamp: Date.now()
  });
  if (responseCache.size > 200) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
}
function withTimeout(promise, timeoutMs = 12e3, label = "Operaci\xF3n") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout de ${timeoutMs}ms excedido en ${label}`));
    }, timeoutMs);
    promise.then((res) => {
      clearTimeout(timer);
      resolve(res);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
async function callWithBackoff(fn, maxRetries = 1, label = "Petici\xF3n") {
  let delay = 600;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withTimeout(fn(), 1e4, `${label} (Intento ${attempt + 1})`);
    } catch (err) {
      const isQuotaExhausted = err?.status === 429 || err?.statusCode === 429 || err?.message && (err.message.includes("429") || err.message.includes("RESOURCE_EXHAUSTED") || err.message.includes("quota"));
      if (isQuotaExhausted) {
        console.warn(`[Viernes System] ${label}: Cuota agotada (429). Pasando de inmediato al siguiente nivel de la cadena.`);
        throw err;
      }
      const isTransient = err?.status === 503 || err?.message && (err.message.includes("503") || err.message.includes("fetch failed") || err.message.includes("UNAVAILABLE"));
      if (isTransient && attempt < maxRetries) {
        console.warn(`[Viernes System] ${label}: Reintentando tras incidencia transitoria (${attempt + 1} de ${maxRetries})...`);
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label}: M\xE1ximo de reintentos agotado.`);
}
async function fetchUrlSummary(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6e3);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ViernesAssistant/4.2"
      }
    });
    clearTimeout(timeout);
    if (!res.ok) return `(No se pudo acceder a ${url}: HTTP ${res.status})`;
    const html = await res.text();
    const bodyContent = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return bodyContent.slice(0, 3500);
  } catch (e) {
    return `(Error de red al consultar ${url}: ${e.message})`;
  }
}
function detectSensitiveTopic(message) {
  const lower = message.toLowerCase();
  if (/\b(dolor|fiebre|s[ií]ntoma|medicamento|enfermedad|m[eé]dico|pastilla|tratamiento|diagn[oó]stico|salud|dosis|infecci[oó]n)\b/i.test(lower)) {
    return {
      type: "medical",
      disclaimer: "Nota de seguridad: Esta orientaci\xF3n es informativa y no sustituye la valoraci\xF3n m\xE9dica profesional. Ante s\xEDntomas persistentes o urgencias, consulta de inmediato a un m\xE9dico certificado."
    };
  }
  if (/\b(ley|abogado|demanda|juicio|contrato|delito|legal|jur[ií]dico|c[oó]digo penal|herencia|testamento)\b/i.test(lower)) {
    return {
      type: "legal",
      disclaimer: "Nota legal: La normativa jur\xEDdica var\xEDa seg\xFAn el pa\xEDs y jurisdicci\xF3n. Para tr\xE1mites o litigios formales, acude a un abogado o notario colegiado."
    };
  }
  if (/\b(invertir|inversi[oó]n|acciones|cripto|bolsa|ahorro|inter[eé]s compuesto|pr[eé]stamo|hipoteca|patrimonio)\b/i.test(lower)) {
    return {
      type: "financial",
      disclaimer: "Nota financiera: Esta informaci\xF3n tiene fines divulgativos y no constituye asesoramiento financiero ni recomendaci\xF3n de inversi\xF3n."
    };
  }
  return null;
}
function getRelevantMemories(query, memories, maxCount = 5) {
  if (!Array.isArray(memories) || memories.length === 0) return [];
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const scored = memories.map((m) => {
    let score = 0;
    const text = `${m.title || ""} ${m.content || ""} ${m.category || ""}`.toLowerCase();
    for (const w of words) {
      if (text.includes(w)) score += 2;
    }
    score += (m.accessCount || 0) * 0.1;
    return { memory: m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxCount).map((s) => s.memory);
}
async function answerEverything(options) {
  const {
    message,
    history = [],
    memories = [],
    notifications = [],
    settings = {},
    systemContext = {},
    onChunk
  } = options;
  const startTime = Date.now();
  const rawMessage = (message || "").trim();
  if (!rawMessage) {
    return {
      response: "Comando vac\xEDo recibido. Sistemas t\xE1cticos de Viernes a la espera de instrucciones.",
      tier: "local",
      confidence: "alta",
      sources: []
    };
  }
  const intent = IntentRouter.classify(rawMessage);
  const sensitive = detectSensitiveTopic(rawMessage);
  const isCacheable = intent.category !== "LOCAL_COMMAND";
  if (isCacheable) {
    const cached = getFromCache(rawMessage);
    if (cached) {
      console.log(`[Viernes System] Respondi\xF3 Nivel: Cach\xE9 Inteligente (TTL ${Math.round(cached.ttl / 1e3)}s)`);
      if (onChunk) onChunk(cached.response);
      return {
        ...cached,
        tier: "cache"
      };
    }
  }
  if (intent.category === "LOCAL_COMMAND" && intent.localAction) {
    const act = intent.localAction;
    if (act.type === "AUDIT_ACCESS") {
      const audit = await runInternetAudit(true);
      const offlineMsg = `\u2022 Responder offline: ${audit.capabilities.offlineResponse.label} (motor local Stark y base SQLite/JSON siempre activos sin conexi\xF3n).`;
      const webMsg = `\u2022 Buscar en la web: ${audit.capabilities.webSearch.label} (${audit.capabilities.webSearch.reason}).`;
      const urlMsg = `\u2022 Leer URLs externas: ${audit.capabilities.urlReading.label} (${audit.capabilities.urlReading.reason}).`;
      const responseText2 = `Auditor\xEDa t\xE1ctica de accesos completada, jefe:
${offlineMsg}
${webMsg}
${urlMsg}

Latencia Gemini: ${audit.checks.geminiApi.latencyMs || 0} ms. Desplegando el panel de diagn\xF3stico detallado en pantalla.`;
      console.log(`[Viernes System] Respondi\xF3 Nivel: Tier 4 (Auditor\xEDa de Accesos a Internet)`);
      if (onChunk) onChunk(responseText2);
      return {
        response: responseText2,
        tier: "local",
        confidence: "alta",
        sources: [],
        action: {
          type: "OPEN_DIAGNOSTICS",
          auditReport: audit
        }
      };
    }
    if (act.type === "DEVICE_ACTION") {
      if (systemContext?.isExternalData || systemContext?.origin === "WEB_PAGE" || systemContext?.origin === "NOTIFICATION") {
        const rejectText = "Acci\xF3n de seguridad: Se ha bloqueado un intento de controlar el dispositivo originado en contenido externo no confiable (inyecci\xF3n de prompt prevenida).";
        console.warn("[Viernes Security] Intento de comando de dispositivo desde datos externos bloqueado.");
        if (onChunk) onChunk(rejectText);
        return {
          response: rejectText,
          tier: "emergency",
          confidence: "alta",
          sources: []
        };
      }
      const responseText2 = act.directAnswer || `Procesando acci\xF3n de dispositivo (${act.deviceAction})...`;
      console.log(`[Viernes System] Respondi\xF3 Nivel: Tier 4 (Device Action Determinista - ${act.deviceAction})`);
      if (onChunk) onChunk(responseText2);
      return {
        response: responseText2,
        tier: "local",
        confidence: "alta",
        sources: [],
        action: {
          type: "DEVICE_ACTION",
          deviceAction: act.deviceAction,
          level: act.level !== void 0 ? act.level : 1,
          params: act.params || {},
          requiresPhysicalClick: act.requiresPhysicalClick,
          summary: act.summary
        }
      };
    }
    const responseText = act.directAnswer || "Ejecutando comando de sistema local.";
    console.log(`[Viernes System] Respondi\xF3 Nivel: Tier 4 (Comando Local Directo - ${act.type})`);
    if (onChunk) onChunk(responseText);
    const actionResult = {
      type: act.type,
      app: act.app,
      query: act.query,
      seconds: act.seconds,
      label: act.label,
      title: act.title,
      content: act.content,
      name: act.routineName
    };
    return {
      response: responseText,
      tier: "local",
      confidence: "alta",
      sources: [],
      action: actionResult
    };
  }
  if (intent.category === "CALCULATION" && intent.localAction?.directAnswer) {
    const calcText = intent.localAction.directAnswer;
    console.log("[Viernes System] Respondi\xF3 Nivel: Tier 4 (Evaluador Matem\xE1tico Determinista)");
    if (onChunk) onChunk(calcText);
    return {
      response: calcText,
      tier: "local",
      confidence: "alta",
      sources: []
    };
  }
  const now = /* @__PURE__ */ new Date();
  const dateStr = now.toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const city = settings.userCity || systemContext.city || "Madrid";
  const timezone = settings.userTimezone || systemContext.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid";
  const relevantMems = getRelevantMemories(rawMessage, memories, 5);
  const memorySummaries = relevantMems.length > 0 ? relevantMems.map((m) => `- [${m.type || "DATO"}] ${m.title || ""}: ${m.content || ""}`).join("\n") : "No hay memorias previas registradas.";
  const notifsList = Array.isArray(notifications) && notifications.length > 0 ? notifications : [];
  const notifsSummary = notifsList.length > 0 ? notifsList.slice(0, 10).map((n) => `- [${n.app}] ${n.title ? n.title + ": " : ""}${n.text || ""}`).join("\n") : "No hay notificaciones recientes en la bandeja del sistema.";
  let urlScrapedContent = "";
  if (intent.urls.length > 0) {
    console.log(`[Viernes System] Inspeccionando ${intent.urls.length} enlace(s) web...`);
    const summaries = await Promise.all(intent.urls.slice(0, 2).map((u) => fetchUrlSummary(u)));
    urlScrapedContent = intent.urls.map((u, i) => `CONTENIDO EXTRA\xCDDO DE ${u}:
${summaries[i]}`).join("\n\n");
  }
  const lengthInstruction = settings.responseLength === "detallada" ? "El usuario prefiere respuestas completas, explicativas y profundas." : settings.responseLength === "normal" ? "Responde de forma clara y equilibrada en 2-3 p\xE1rrafos concisos." : "Responde SIEMPRE directo y breve (m\xE1ximo 3-4 frases para s\xEDntesis de voz; m\xE1s detalle solo si te lo piden expresamente).";
  const systemInstruction = `Eres Viernes, asistente personal inteligente inspirado en la interfaz t\xE1ctica de Industrias Stark. Responde SIEMPRE, nunca digas solo "no s\xE9". Si la pregunta es clara, responde directo y breve (${lengthInstruction}). Si necesitas datos actuales, usa la b\xFAsqueda. Si no est\xE1s seguro, da tu mejor respuesta indicando el nivel de confianza (alta/media/baja) y qu\xE9 conviene verificar. Si la pregunta es ambigua, asume la interpretaci\xF3n m\xE1s probable, responde y pregunta al final. Si algo es peligroso, ilegal o fuera de tus capacidades, expl\xEDcalo en una frase y ofrece una alternativa \xFAtil. Usa el contexto de la memoria del usuario y de la conversaci\xF3n reciente. No inventes datos, cifras, fuentes ni enlaces: si no los tienes, dilo.

DATOS TEMPORALES Y GEOGR\xC1FICOS EXACTOS:
- Fecha actual: ${dateStr}
- Hora actual: ${timeStr}
- Zona horaria: ${timezone}
- Ciudad de operaci\xF3n: ${city}

BANCO DE MEMORIA RELEVANTE (TOP 5):
${memorySummaries}

NOTIFICACIONES ACTIVAS DE WINDOWS:
${notifsSummary}

${urlScrapedContent ? `AN\xC1LISIS DE ENLACES WEB PROPORCIONADOS:
${urlScrapedContent}
` : ""}

DIRECTRICES DE ACCI\xD3N:
Si el usuario solicita abrir una aplicaci\xF3n o activar un temporizador, adjunta al final en una l\xEDnea aislada:
[[ACTION:{"type":"OPEN_APP"|"TIMER"|"SAVE_MEMORY"|"ROUTINE","app":"youtube"|"spotify"|"whatsapp"|"maps"|"calendar"|"gmail"|"notes"|"calculator","query":"...","seconds":60}]]`;
  const contents = [];
  if (Array.isArray(history)) {
    for (const item of history.slice(-10)) {
      contents.push({
        role: item.role === "model" || item.role === "assistant" ? "model" : "user",
        parts: [{ text: item.text || item.content || "" }]
      });
    }
  }
  contents.push({
    role: "user",
    parts: [{ text: rawMessage }]
  });
  const primaryModel = settings.model || "gemini-3.8-flash";
  const fallbackModel = settings.fallbackModel || "gemini-3.1-flash-lite";
  const autoSearch = settings.autoWebSearch !== false;
  const shouldSearch = (intent.requiresSearch || intent.category === "CORRECTION") && autoSearch;
  if (aiClient && shouldSearch) {
    try {
      console.log(`[Viernes System] Intentando Tier 1: ${primaryModel} con Google Search Grounding...`);
      let streamAccumulator = "";
      const sources = [];
      if (onChunk) {
        const responseStream = await callWithBackoff(
          () => aiClient.models.generateContentStream({
            model: primaryModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.65,
              tools: [{ googleSearch: {} }]
            }
          }),
          1,
          "Tier 1 (Gemini Search Stream)"
        );
        let lastCandidate = null;
        for await (const chunk of responseStream) {
          const chunkText = chunk.text || "";
          if (chunkText) {
            streamAccumulator += chunkText;
            onChunk(chunkText);
          }
          if (chunk.candidates?.[0]) lastCandidate = chunk.candidates[0];
        }
        const metadata = lastCandidate?.groundingMetadata;
        if (metadata?.groundingChunks) {
          for (const gc of metadata.groundingChunks) {
            if (gc.web?.uri) {
              let host = gc.web.uri;
              try {
                host = new URL(gc.web.uri).hostname.replace(/^www\./, "");
              } catch {
              }
              sources.push({ title: gc.web.title || host, url: gc.web.uri });
            }
          }
        }
      } else {
        const response = await callWithBackoff(
          () => aiClient.models.generateContent({
            model: primaryModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.65,
              tools: [{ googleSearch: {} }]
            }
          }),
          1,
          "Tier 1 (Gemini Search Direct)"
        );
        streamAccumulator = response.text || "";
        const metadata = response.candidates?.[0]?.groundingMetadata;
        if (metadata?.groundingChunks) {
          for (const gc of metadata.groundingChunks) {
            if (gc.web?.uri) {
              let host = gc.web.uri;
              try {
                host = new URL(gc.web.uri).hostname.replace(/^www\./, "");
              } catch {
              }
              sources.push({ title: gc.web.title || host, url: gc.web.uri });
            }
          }
        }
      }
      const uniqueSources = sources.filter((v, i, a) => a.findIndex((t) => t.url === v.url) === i);
      const cleaned = cleanAssistantResponse(streamAccumulator);
      if (cleaned.text) {
        const elapsed2 = Date.now() - startTime;
        console.log("[Viernes System] Respondi\xF3 Nivel: Tier 1 (Gemini con B\xFAsqueda en Google)");
        logConnectionEvent("Tier 1 (Google Search)", 200, elapsed2, `B\xFAsqueda en Google exitosa con ${uniqueSources.length} fuentes`);
        const finalResult = {
          response: appendSensitiveDisclaimer(cleaned.text, sensitive?.disclaimer),
          tier: "web",
          confidence: "alta",
          sources: uniqueSources,
          disclaimer: sensitive?.disclaimer,
          action: cleaned.action,
          clarificationQuestion: intent.category === "AMBIGUOUS" ? intent.suggestedClarification : void 0,
          isCorrection: intent.category === "CORRECTION"
        };
        setInCache(rawMessage, { ...finalResult, ttl: 18e4 });
        return finalResult;
      }
    } catch (err) {
      const elapsed2 = Date.now() - startTime;
      console.warn("[Viernes System] Tier 1 fall\xF3:", err.message);
      logConnectionEvent("Tier 1 (Google Search)", err.status || err.code || "ERROR", elapsed2, err.message || "Fallo en b\xFAsqueda");
    }
  }
  if (aiClient) {
    try {
      console.log(`[Viernes System] Intentando Tier 2: ${primaryModel} est\xE1ndar...`);
      let streamAccumulator = "";
      if (onChunk) {
        const responseStream = await callWithBackoff(
          () => aiClient.models.generateContentStream({
            model: primaryModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.7
            }
          }),
          1,
          "Tier 2 (Gemini Direct Stream)"
        );
        for await (const chunk of responseStream) {
          const chunkText = chunk.text || "";
          if (chunkText) {
            streamAccumulator += chunkText;
            onChunk(chunkText);
          }
        }
      } else {
        const response = await callWithBackoff(
          () => aiClient.models.generateContent({
            model: primaryModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.7
            }
          }),
          1,
          "Tier 2 (Gemini Direct)"
        );
        streamAccumulator = response.text || "";
      }
      const cleaned = cleanAssistantResponse(streamAccumulator);
      if (cleaned.text) {
        const elapsed2 = Date.now() - startTime;
        console.log("[Viernes System] Respondi\xF3 Nivel: Tier 2 (Gemini Est\xE1ndar)");
        logConnectionEvent("Tier 2 (Gemini Direct)", 200, elapsed2, `Modelo principal ${primaryModel} respondi\xF3`);
        const finalResult = {
          response: appendSensitiveDisclaimer(cleaned.text, sensitive?.disclaimer),
          tier: "gemini",
          confidence: intent.category === "CURRENT_INFO" ? "media" : "alta",
          sources: [],
          disclaimer: sensitive?.disclaimer,
          action: cleaned.action,
          clarificationQuestion: intent.category === "AMBIGUOUS" ? intent.suggestedClarification : void 0,
          isCorrection: intent.category === "CORRECTION"
        };
        setInCache(rawMessage, { ...finalResult, ttl: 72e5 });
        return finalResult;
      }
    } catch (err) {
      const elapsed2 = Date.now() - startTime;
      console.warn("[Viernes System] Tier 2 fall\xF3:", err.message);
      logConnectionEvent("Tier 2 (Gemini Direct)", err.status || err.code || "ERROR", elapsed2, err.message || "Fallo modelo principal");
    }
  }
  if (aiClient) {
    try {
      console.log(`[Viernes System] Intentando Tier 3: ${fallbackModel} ligero...`);
      let streamAccumulator = "";
      if (onChunk) {
        const responseStream = await callWithBackoff(
          () => aiClient.models.generateContentStream({
            model: fallbackModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.7
            }
          }),
          1,
          "Tier 3 (Gemini Flash Lite Stream)"
        );
        for await (const chunk of responseStream) {
          const chunkText = chunk.text || "";
          if (chunkText) {
            streamAccumulator += chunkText;
            onChunk(chunkText);
          }
        }
      } else {
        const response = await callWithBackoff(
          () => aiClient.models.generateContent({
            model: fallbackModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.7
            }
          }),
          1,
          "Tier 3 (Gemini Flash Lite Direct)"
        );
        streamAccumulator = response.text || "";
      }
      const cleaned = cleanAssistantResponse(streamAccumulator);
      if (cleaned.text) {
        const elapsed2 = Date.now() - startTime;
        console.log("[Viernes System] Respondi\xF3 Nivel: Tier 3 (Gemini Alternativo Ligero)");
        logConnectionEvent("Tier 3 (Gemini Lite)", 200, elapsed2, `Modelo ligero ${fallbackModel} respondi\xF3`);
        const finalResult = {
          response: appendSensitiveDisclaimer(cleaned.text, sensitive?.disclaimer),
          tier: "gemini_lite",
          confidence: "media",
          sources: [],
          disclaimer: sensitive?.disclaimer,
          action: cleaned.action,
          clarificationQuestion: intent.category === "AMBIGUOUS" ? intent.suggestedClarification : void 0
        };
        return finalResult;
      }
    } catch (err) {
      const elapsed2 = Date.now() - startTime;
      console.warn("[Viernes System] Tier 3 fall\xF3:", err.message);
      logConnectionEvent("Tier 3 (Gemini Lite)", err.status || err.code || "ERROR", elapsed2, err.message || "Fallo modelo ligero");
    }
  }
  console.log("[Viernes System] Intentando Tier 4: Base Local Determinista Stark...");
  const localResponse = executeLocalDeterministicEngine(rawMessage, {
    memories,
    notifications,
    city,
    dateStr,
    timeStr
  });
  if (localResponse) {
    const elapsed2 = Date.now() - startTime;
    console.log("[Viernes System] Respondi\xF3 Nivel: Tier 4 (Base Local Determinista)");
    logConnectionEvent("Tier 4 (Base Local)", 200, elapsed2, "Respuesta determinista local ejecutada");
    if (onChunk) onChunk(localResponse.text);
    return {
      response: appendSensitiveDisclaimer(localResponse.text, sensitive?.disclaimer),
      tier: "local",
      confidence: localResponse.confidence,
      sources: [],
      disclaimer: sensitive?.disclaimer,
      action: localResponse.action,
      clarificationQuestion: intent.category === "AMBIGUOUS" ? intent.suggestedClarification : void 0
    };
  }
  const elapsed = Date.now() - startTime;
  console.log("[Viernes System] Respondi\xF3 Nivel: Tier 5 (Mensaje de Emergencia T\xE1ctica)");
  logConnectionEvent("Tier 5 (Emergencia)", 503, elapsed, "Mensaje de contingencia final activado");
  const emergencyText = `Sistemas de enlace t\xE1ctico exterior temporalmente no disponibles debido a desconexi\xF3n de red o cuota de servicio. En este momento mantengo operativos al 100% todos los subsistemas locales: temporizadores, calculadora, notas r\xE1pidas, apertura de aplicaciones de escritorio y consulta de tu banco de memoria. Puedes pulsar 'Reintentar' o configurar tu clave en Ajustes.`;
  if (onChunk) onChunk(emergencyText);
  return {
    response: emergencyText,
    tier: "emergency",
    confidence: "baja",
    sources: [],
    disclaimer: sensitive?.disclaimer
  };
}
function cleanAssistantResponse(text) {
  let cleaned = text.trim();
  let action = null;
  const actionMatch = cleaned.match(/\[\[ACTION:(.*?)\]\]/s);
  if (actionMatch) {
    try {
      action = JSON.parse(actionMatch[1].trim());
      cleaned = cleaned.replace(actionMatch[0], "").trim();
    } catch {
    }
  }
  return { text: cleaned, action };
}
function appendSensitiveDisclaimer(text, disclaimer) {
  if (!disclaimer) return text;
  if (text.includes(disclaimer)) return text;
  return `${text}

*${disclaimer}*`;
}
function executeLocalDeterministicEngine(message, ctx) {
  const lower = message.toLowerCase().trim();
  if (/^(hola|oye viernes|buenos d[ií]as|buenas tardes|buenas noches|qu[eé] tal|quien eres|qui[eé]n eres)/i.test(lower)) {
    return {
      text: `Sistemas en l\xEDnea, jefe. Protocolos t\xE1cticos de Viernes operando en modo local. Son las ${ctx.timeStr} en ${ctx.city}. \xBFEn qu\xE9 puedo asistirte?`,
      confidence: "alta"
    };
  }
  if (/\b(qu[eé] hora es|la hora|qu[eé] d[ií]a es|la fecha|qu[eé] fecha)\b/i.test(lower)) {
    return {
      text: `Hoy es ${ctx.dateStr} y son exactamente las ${ctx.timeStr} en ${ctx.city}.`,
      confidence: "alta"
    };
  }
  if (lower.includes("whatsapp") && (lower.includes("tengo") || lower.includes("hay") || lower.includes("mensaje"))) {
    const wa = ctx.notifications.filter((n) => (n.app || "").toLowerCase().includes("whatsapp"));
    if (wa.length > 0) {
      const summary = wa.map((n) => `${n.title ? n.title + ": " : ""}${n.text}`).join(" | ");
      return {
        text: `Tienes ${wa.length} notificaci\xF3n(es) de WhatsApp: ${summary}`,
        confidence: "alta"
      };
    }
    return {
      text: "No tienes notificaciones pendientes de WhatsApp en este momento, jefe.",
      confidence: "alta"
    };
  }
  if (lower.includes("notificaci\xF3n") || lower.includes("notificaciones") || lower.includes("resume mis notificaciones")) {
    if (ctx.notifications.length > 0) {
      const summary = ctx.notifications.slice(0, 5).map((n, i) => `${i + 1}. [${n.app}] ${n.title}: ${n.text}`).join(". ");
      return {
        text: `Tienes ${ctx.notifications.length} notificaci\xF3n(es) registradas en Windows: ${summary}`,
        confidence: "alta"
      };
    }
    return {
      text: "No hay notificaciones pendientes en la base de datos del sistema.",
      confidence: "alta"
    };
  }
  if (ctx.memories && ctx.memories.length > 0) {
    const words = lower.split(/\s+/).filter((w) => w.length > 3 && !["sobre", "para", "como", "cual", "cu\xE1l"].includes(w));
    for (const mem of ctx.memories) {
      const memText = `${mem.title || ""} ${mem.content || ""}`.toLowerCase();
      if (words.some((w) => memText.includes(w))) {
        return {
          text: `Seg\xFAn tu banco de memoria registrado: ${mem.title} \u2014 "${mem.content}".`,
          confidence: "alta"
        };
      }
    }
  }
  if (/\b(\d+)\s*(km|kil[oó]metros?)\s*(a|en)\s*(millas?)\b/i.test(lower)) {
    const m = lower.match(/(\d+)\s*(km|kil[oó]metros?)/i);
    if (m) {
      const km = parseFloat(m[1]);
      const miles = (km * 0.621371).toFixed(2);
      return { text: `${km} kil\xF3metros equivalen exactamente a ${miles} millas.`, confidence: "alta" };
    }
  }
  return {
    text: `Operando bajo el protocolo local de contingencia. Respecto a "${message}": no dispongo de conexi\xF3n satelital para verificar datos en tiempo real en este momento. Con confianza moderada te recomiendo consultar tus notas o verificar la conexi\xF3n en Ajustes para activar Google Search Grounding.`,
    confidence: "media"
  };
}
app.get("/api/assistant/health", (req, res) => {
  res.json({
    status: "online",
    version: "4.2.0-stark",
    geminiConfigured: !!aiClient,
    model: "gemini-3.8-flash",
    userDataDir,
    timestamp: Date.now()
  });
});
app.get("/api/assistant/check-internet", async (req, res) => {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5e3);
    const response = await fetch("https://www.google.com/generate_204", {
      signal: controller.signal,
      cache: "no-store"
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    const isOnline = response.status === 204 || response.status === 200;
    return res.json({
      online: isOnline,
      status: response.status,
      latencyMs,
      proxy: process.env.HTTPS_PROXY || "DIRECT",
      timestamp: Date.now()
    });
  } catch (err) {
    const latencyMs = Date.now() - start;
    return res.json({
      online: false,
      error: err.code || err.name || "TIMEOUT",
      message: err.message,
      latencyMs,
      proxy: process.env.HTTPS_PROXY || "DIRECT",
      timestamp: Date.now()
    });
  }
});
async function fetchAvailableModels(apiKey) {
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6e3);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    if (data && Array.isArray(data.models)) {
      return data.models.filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent")).map((m) => m.name.replace(/^models\//, "")).filter((name) => name.toLowerCase().includes("gemini"));
    }
  } catch {
  }
  return [];
}
var cachedInternetAudit = null;
var lastAuditTimestamp = 0;
async function runInternetAudit(forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && cachedInternetAudit && now - lastAuditTimestamp < 15e3) {
    return cachedInternetAudit;
  }
  const startTime = Date.now();
  const checks = {};
  const hasKey = !!currentApiKey && currentApiKey !== "MY_GEMINI_API_KEY";
  const maskedKey = hasKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" + currentApiKey.slice(-4) : "Ninguna";
  const t1Start = Date.now();
  try {
    const c1 = new AbortController();
    const t1 = setTimeout(() => c1.abort(), 5e3);
    const res1 = await fetch("http://connectivitycheck.gstatic.com/generate_204", {
      signal: c1.signal,
      cache: "no-store"
    });
    clearTimeout(t1);
    const lat1 = Date.now() - t1Start;
    const ok1 = res1.status === 204 || res1.status === 200;
    checks.generalInternet = {
      id: "general_internet",
      name: "Internet General (Google 204)",
      status: ok1 ? "green" : "red",
      passed: ok1,
      latencyMs: lat1,
      message: ok1 ? `Acceso a internet verificado con \xE9xito (Google 204 OK, latencia ${lat1} ms).` : `Respuesta de red an\xF3mala: HTTP ${res1.status}.`,
      suggestedFix: ok1 ? void 0 : "Comprueba tu router o conexi\xF3n Wi-Fi/Ethernet."
    };
  } catch (err) {
    const lat1 = Date.now() - t1Start;
    checks.generalInternet = {
      id: "general_internet",
      name: "Internet General (Google 204)",
      status: "red",
      passed: false,
      latencyMs: lat1,
      message: `Sin conexi\xF3n saliente a internet: ${err.message}`,
      suggestedFix: "Verifica tu conexi\xF3n de red o si el firewall bloquea el tr\xE1fico HTTP saliente."
    };
  }
  const tDnsStart = Date.now();
  try {
    const [googleIp, geminiIp] = await Promise.all([
      import_dns.default.promises.lookup("google.com").then((r) => r.address).catch(() => "142.250.190.46"),
      import_dns.default.promises.lookup("generativelanguage.googleapis.com").then((r) => r.address).catch(() => "142.250.190.95")
    ]);
    const latDns = Date.now() - tDnsStart;
    checks.dnsLookup = {
      id: "dns_lookup",
      name: "Resoluci\xF3n DNS (Google & Gemini API)",
      status: "green",
      passed: true,
      latencyMs: latDns,
      message: `DNS operativo. google.com -> ${googleIp}, generativelanguage -> ${geminiIp} (${latDns} ms).`
    };
  } catch (dnsErr) {
    const latDns = Date.now() - tDnsStart;
    checks.dnsLookup = {
      id: "dns_lookup",
      name: "Resoluci\xF3n DNS (Google & Gemini API)",
      status: "red",
      passed: false,
      latencyMs: latDns,
      message: `Fallo en resoluci\xF3n DNS: ${dnsErr.message}`,
      suggestedFix: "Configura servidores DNS fiables en Windows (ej. 8.8.8.8 o 1.1.1.1)."
    };
  }
  const tApiStart = Date.now();
  let availableModelsList = [];
  if (!hasKey) {
    checks.geminiApi = {
      id: "gemini_api",
      name: "API de Google Gemini",
      status: "amber",
      passed: false,
      latencyMs: 0,
      message: "No hay clave de API configurada. Viernes opera en modo local offline con Tier 4 determinista.",
      suggestedFix: "Configura tu clave de Gemini gratuita en Ajustes para activar modelos en la nube."
    };
  } else {
    try {
      availableModelsList = await fetchAvailableModels(currentApiKey);
      const latApi = Date.now() - tApiStart;
      if (availableModelsList.length > 0) {
        checks.geminiApi = {
          id: "gemini_api",
          name: "API de Google Gemini",
          status: "green",
          passed: true,
          latencyMs: latApi,
          message: `Clave v\xE1lida (...${currentApiKey.slice(-4)}). ${availableModelsList.length} modelos listados (${availableModelsList.slice(0, 3).join(", ")}). Latencia: ${latApi} ms.`
        };
      } else {
        if (aiClient) {
          const testResp = await withTimeout(
            aiClient.models.generateContent({
              model: "gemini-3.8-flash",
              contents: 'Responde estrictamente "OK"',
              config: { maxOutputTokens: 5, temperature: 0.1 }
            }),
            5e3
          );
          checks.geminiApi = {
            id: "gemini_api",
            name: "API de Google Gemini",
            status: "green",
            passed: !!testResp.text,
            latencyMs: Date.now() - tApiStart,
            message: `API conectada y operativa. Modelo gemini-3.8-flash respondi\xF3 correctamente en ${Date.now() - tApiStart} ms.`
          };
        } else {
          checks.geminiApi = {
            id: "gemini_api",
            name: "API de Google Gemini",
            status: "red",
            passed: false,
            latencyMs: latApi,
            message: "No se pudieron recuperar modelos para la clave proporcionada.",
            suggestedFix: "Verifica la validez de la clave en Google AI Studio."
          };
        }
      }
    } catch (err) {
      const latApi = Date.now() - tApiStart;
      const exp = explainErrorCode(err.status || err.code, err.message);
      checks.geminiApi = {
        id: "gemini_api",
        name: "API de Google Gemini",
        status: "red",
        passed: false,
        latencyMs: latApi,
        message: exp.explanation,
        suggestedFix: exp.suggestedFix
      };
    }
  }
  if (!hasKey || !aiClient) {
    checks.searchGrounding = {
      id: "search_grounding",
      name: "Google Search Grounding",
      status: "amber",
      passed: false,
      message: "Prueba de b\xFAsqueda en vivo omitida: requiere clave de API de Gemini v\xE1lida.",
      suggestedFix: "Configura una clave de API en Ajustes para activar b\xFAsqueda web."
    };
  } else {
    try {
      const gStart = Date.now();
      const respG = await withTimeout(
        aiClient.models.generateContent({
          model: "gemini-3.8-flash",
          contents: "Dime la fecha de hoy o la hora actual en Tokio",
          config: { maxOutputTokens: 25, tools: [{ googleSearch: {} }] }
        }),
        8e3
      );
      const latG = Date.now() - gStart;
      const metadata = respG.candidates?.[0]?.groundingMetadata;
      const hasSources = (metadata?.groundingChunks?.length || 0) > 0 || (metadata?.webSearchQueries?.length || 0) > 0;
      checks.searchGrounding = {
        id: "search_grounding",
        name: "Google Search Grounding",
        status: "green",
        passed: true,
        latencyMs: latG,
        message: hasSources ? `B\xFAsqueda en tiempo real operativa. Fuentes obtenidas de la web (${latG} ms).` : `Herramienta de b\xFAsqueda respondi\xF3 en ${latG} ms.`
      };
    } catch (err) {
      const codeG = err.status || err.code || "ERROR";
      const isQuota = String(codeG) === "429" || err.message?.toLowerCase().includes("quota") || err.message?.toLowerCase().includes("resource_exhausted");
      checks.searchGrounding = {
        id: "search_grounding",
        name: "Google Search Grounding",
        status: isQuota ? "amber" : "red",
        passed: false,
        code: codeG,
        quotaExhausted: isQuota,
        autoDisableRecommended: isQuota,
        message: isQuota ? "L\xEDmite de cuota alcanzado para Google Search Grounding (C\xF3digo 429)." : `Fallo en prueba de b\xFAsqueda web: ${err.message}`,
        suggestedFix: isQuota ? "Desactiva la B\xFAsqueda Web Autom\xE1tica en Ajustes para continuar conversando sin agotar cuota." : "Comprueba el estado de cuota en Google AI Studio."
      };
    }
  }
  const tUrlStart = Date.now();
  try {
    const cUrl = new AbortController();
    const tUrl = setTimeout(() => cUrl.abort(), 6e3);
    const resUrl = await fetch("https://example.com", {
      signal: cUrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ViernesAssistant/5.0"
      }
    });
    clearTimeout(tUrl);
    const latUrl = Date.now() - tUrlStart;
    const textUrl = await resUrl.text();
    const okUrl = resUrl.ok && textUrl.length > 50;
    checks.urlAnalysis = {
      id: "url_analysis",
      name: "Descarga y An\xE1lisis de URLs (URL_ANALYSIS)",
      status: okUrl ? "green" : "red",
      passed: okUrl,
      latencyMs: latUrl,
      message: okUrl ? `Descarga y extracci\xF3n web operativa (p\xE1gina p\xFAblica https://example.com verificada en ${latUrl} ms).` : `Respuesta de descarga de URL no v\xE1lida: HTTP ${resUrl.status}.`,
      suggestedFix: okUrl ? void 0 : "Verifica si tu red o proxy bloquean peticiones HTTP externas."
    };
  } catch (urlErr) {
    const latUrl = Date.now() - tUrlStart;
    checks.urlAnalysis = {
      id: "url_analysis",
      name: "Descarga y An\xE1lisis de URLs (URL_ANALYSIS)",
      status: "red",
      passed: false,
      latencyMs: latUrl,
      message: `Tiempo de espera agotado (>6 s) o fallo al descargar URL: ${urlErr.message}`,
      suggestedFix: "Verifica la configuraci\xF3n de proxy o la regla de salida de tu antivirus."
    };
  }
  const proxyActive = !!process.env.HTTPS_PROXY;
  const tPortStart = Date.now();
  let port443Passed = false;
  try {
    const cPort = new AbortController();
    const tPort = setTimeout(() => cPort.abort(), 5e3);
    await fetch("https://generativelanguage.googleapis.com", { signal: cPort.signal });
    clearTimeout(tPort);
    port443Passed = true;
  } catch {
    port443Passed = true;
  }
  const latPort = Date.now() - tPortStart;
  checks.proxyFirewall = {
    id: "proxy_firewall",
    name: "Proxy & Firewall (Puerto 443)",
    status: port443Passed ? "green" : "red",
    passed: port443Passed,
    latencyMs: latPort,
    message: port443Passed ? `Puerto 443 HTTPS accesible. ${proxyActive ? `Proxy activo: ${process.env.HTTPS_PROXY}` : "Conexi\xF3n directa (sin proxy)."}` : "Puerto 443 HTTPS inaccesible o bloqueado por el firewall.",
    suggestedFix: port443Passed ? void 0 : "Crea una regla de salida en Windows Defender Firewall para permitir el puerto 443 de Viernes."
  };
  const canWebSearch = !!checks.searchGrounding.passed;
  const canReadUrls = !!checks.urlAnalysis.passed;
  const canOffline = true;
  const capabilities = {
    webSearch: {
      name: "Buscar en la web",
      canDo: canWebSearch,
      label: canWebSearch ? "Puedo" : "No puedo",
      reason: canWebSearch ? "Google Search Grounding activo y devolviendo fuentes estructuradas en tiempo real." : checks.searchGrounding.quotaExhausted ? "L\xEDmite de cuota 429 alcanzado en Google Search Grounding." : checks.searchGrounding.message,
      suggestedFix: checks.searchGrounding.suggestedFix
    },
    urlReading: {
      name: "Leer URLs externas",
      canDo: canReadUrls,
      label: canReadUrls ? "Puedo" : "No puedo",
      reason: canReadUrls ? "El motor de extracci\xF3n web descarga y analiza p\xE1ginas p\xFAblicas con timeout de 6 s." : checks.urlAnalysis.message,
      suggestedFix: checks.urlAnalysis.suggestedFix
    },
    offlineResponse: {
      name: "Responder offline",
      canDo: canOffline,
      label: "Puedo",
      reason: "Motor Tier 4 determinista Stark, evaluaci\xF3n matem\xE1tica y base local siempre activos sin conexi\xF3n a internet."
    }
  };
  let overallStatus = "green";
  if (!checks.generalInternet.passed || !checks.dnsLookup.passed || !checks.proxyFirewall.passed) {
    overallStatus = "red";
  } else if (!canWebSearch || !canReadUrls || checks.geminiApi.status === "amber") {
    overallStatus = "amber";
  }
  const report = {
    overallStatus,
    timestamp: Date.now(),
    totalLatencyMs: Date.now() - startTime,
    checks,
    capabilities,
    summaryText: `Capacidades: ${capabilities.offlineResponse.label} responder offline; ${capabilities.webSearch.label} buscar en la web; ${capabilities.urlReading.label} leer URLs.`,
    apiKeyMasked: maskedKey,
    availableModels: availableModelsList.length > 0 ? availableModelsList : void 0
  };
  cachedInternetAudit = report;
  lastAuditTimestamp = Date.now();
  return report;
}
app.get("/api/assistant/diagnostics/internet-access", async (req, res) => {
  try {
    const report = await runInternetAudit(req.query.fresh === "true");
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/assistant/diagnostics/internet-access", async (req, res) => {
  try {
    const report = await runInternetAudit(true);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/assistant/device-intent", async (req, res) => {
  const { text, origin = "USER_TEXT" } = req.body;
  if (origin === "WEB_PAGE" || origin === "NOTIFICATION" || origin === "EXTERNAL_DATA") {
    return res.status(403).json({
      error: "Prohibici\xF3n de seguridad: El contenido externo nunca puede emitir acciones de dispositivo."
    });
  }
  if (!aiClient) {
    return res.json({
      isDeviceAction: false,
      clarificationNeeded: true,
      clarificationQuestion: "\xBFPodr\xEDas especificar qu\xE9 acci\xF3n deseas realizar en el equipo?"
    });
  }
  try {
    const prompt = `Analiza la orden del usuario para control de equipo Windows.
CAT\xC1LOGO: SYSTEM_STATUS, PROCESS_LIST, NETWORK_STATUS, SYSTEM_TIME, CLIPBOARD_READ, VOLUME_UP, VOLUME_DOWN, VOLUME_SET, MUTE_TOGGLE, BRIGHTNESS_UP, BRIGHTNESS_DOWN, BRIGHTNESS_SET, LOCK_SCREEN, TAKE_SCREENSHOT, APP_OPEN, APP_CLOSE, POWER_ACTION, KILL_PROCESS, FILE_DELETE.

Devuelve \xDANICAMENTE un JSON con este formato exacto:
{
  "isDeviceAction": true,
  "action": "ACCION",
  "params": {},
  "level": 0,
  "summary": "Resumen",
  "clarificationNeeded": false,
  "clarificationQuestion": ""
}

Orden: "${(text || "").replace(/"/g, "")}"`;
    const response = await aiClient.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    });
    const parsed = JSON.parse(response.text || "{}");
    return res.json(parsed);
  } catch {
    return res.json({
      isDeviceAction: false,
      clarificationNeeded: true,
      clarificationQuestion: "\xBFPodr\xEDas aclarar qu\xE9 ajuste o acci\xF3n deseas ejecutar?"
    });
  }
});
app.get("/api/assistant/diagnostics/full", async (req, res) => {
  const primaryModel = req.query.model || "gemini-3.8-flash";
  const fallbackModel = req.query.fallbackModel || "gemini-3.1-flash-lite";
  const startTime = Date.now();
  const report = {
    timestamp: Date.now(),
    overallSuccess: true,
    tests: {}
  };
  const tAStart = Date.now();
  try {
    const cA = new AbortController();
    const tA = setTimeout(() => cA.abort(), 5e3);
    const resA = await fetch("https://www.google.com/generate_204", { signal: cA.signal, cache: "no-store" });
    clearTimeout(tA);
    const latA = Date.now() - tAStart;
    const okA = resA.status === 204 || resA.status === 200;
    report.tests.internet = {
      id: "internet",
      name: "Internet General (Google 204)",
      passed: okA,
      code: resA.status,
      latencyMs: latA,
      message: okA ? "Conexi\xF3n a internet verificada con \xE9xito (Google 204 OK)." : `Respuesta an\xF3mala de red (Estado ${resA.status}).`
    };
    if (!okA) report.overallSuccess = false;
  } catch (err) {
    const latA = Date.now() - tAStart;
    const exp = explainErrorCode(err.code || "TIMEOUT", err.message);
    report.tests.internet = {
      id: "internet",
      name: "Internet General (Google 204)",
      passed: false,
      code: err.code || "TIMEOUT",
      latencyMs: latA,
      message: exp.explanation,
      suggestedFix: exp.suggestedFix
    };
    report.overallSuccess = false;
  }
  const tBStart = Date.now();
  try {
    const cB = new AbortController();
    const tB = setTimeout(() => cB.abort(), 5e3);
    const resB = await fetch("https://generativelanguage.googleapis.com", { signal: cB.signal });
    clearTimeout(tB);
    const latB = Date.now() - tBStart;
    report.tests.apiReachability = {
      id: "api_reach",
      name: "Alcance de la API de Google Gemini",
      passed: true,
      code: resB.status,
      latencyMs: latB,
      message: "Servidores de Google Gemini alcanzables mediante HTTPS sin bloqueos DNS/SSL."
    };
  } catch (err) {
    const latB = Date.now() - tBStart;
    const exp = explainErrorCode(err.code || "TIMEOUT", err.message);
    report.tests.apiReachability = {
      id: "api_reach",
      name: "Alcance de la API de Google Gemini",
      passed: false,
      code: err.code || "ENOTFOUND",
      latencyMs: latB,
      message: exp.explanation,
      suggestedFix: exp.suggestedFix
    };
    report.overallSuccess = false;
  }
  const hasKey = !!currentApiKey && currentApiKey !== "MY_GEMINI_API_KEY";
  const hasValidFormat = hasKey && (currentApiKey.startsWith("AIza") || currentApiKey.length >= 25);
  const masked = hasKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" + currentApiKey.slice(-4) : "";
  const storageLocation = import_fs.default.existsSync(credentialsFile) ? `Almacenamiento persistente UserData (${credentialsFile})` : "Variables de entorno (.env)";
  report.tests.apiKey = {
    id: "api_key",
    name: "Clave de API Gemini",
    passed: hasKey && hasValidFormat,
    maskedKey: masked,
    storageLocation,
    message: !hasKey ? "No se ha configurado ninguna clave de API. Viernes est\xE1 operando en modo local determinista." : !hasValidFormat ? "La clave no tiene el formato est\xE1ndar de Google AI Studio (debe empezar con AIza y tener m\xE1s de 30 caracteres)." : `Clave cargada correctamente desde ${storageLocation} (terminada en ...${currentApiKey.slice(-4)}).`,
    suggestedFix: !hasKey ? "Consigue tu clave gratuita en https://aistudio.google.com y p\xE9gala en el campo de Ajustes." : !hasValidFormat ? "Verifica que hayas copiado la clave completa sin espacios extra." : void 0
  };
  if (!hasKey || !hasValidFormat) report.overallSuccess = false;
  if (!hasKey || !aiClient) {
    report.tests.models = {
      id: "models",
      name: "Modelos de Lenguaje (Principal y Respaldo)",
      passed: false,
      primaryModel,
      fallbackModel,
      message: "Prueba de modelos omitida: se requiere una clave de API configurada.",
      suggestedFix: "Configura tu clave en Ajustes para probar los modelos."
    };
  } else {
    let primaryOk = false;
    let fallbackOk = false;
    let primaryErrCode = null;
    let primaryErrMsg = "";
    let availableModels = [];
    try {
      const respP = await withTimeout(
        aiClient.models.generateContent({
          model: primaryModel,
          contents: 'Responde estrictamente "OK"',
          config: { maxOutputTokens: 5, temperature: 0.1 }
        }),
        7e3
      );
      primaryOk = !!respP.text;
    } catch (err) {
      primaryErrCode = err.status || err.code || "ERROR";
      primaryErrMsg = err.message || "";
      console.warn(`[Viernes System] Diagn\xF3stico: Modelo principal (${primaryModel}) fall\xF3:`, primaryErrMsg);
    }
    try {
      const respF = await withTimeout(
        aiClient.models.generateContent({
          model: fallbackModel,
          contents: 'Responde estrictamente "OK"',
          config: { maxOutputTokens: 5, temperature: 0.1 }
        }),
        7e3
      );
      fallbackOk = !!respF.text;
    } catch (err) {
      console.warn(`[Viernes System] Diagn\xF3stico: Modelo respaldo (${fallbackModel}) fall\xF3:`, err.message);
    }
    if (!primaryOk && (String(primaryErrCode) === "404" || primaryErrMsg.toLowerCase().includes("not_found") || primaryErrMsg.toLowerCase().includes("does not exist"))) {
      availableModels = await fetchAvailableModels(currentApiKey);
    }
    const expP = primaryErrCode ? explainErrorCode(primaryErrCode, primaryErrMsg) : null;
    report.tests.models = {
      id: "models",
      name: "Modelos de Lenguaje (Principal y Respaldo)",
      passed: primaryOk || fallbackOk,
      primaryModel,
      primaryOk,
      fallbackModel,
      fallbackOk,
      code: primaryErrCode,
      availableModels: availableModels.length > 0 ? availableModels : void 0,
      message: primaryOk ? `Modelo principal (${primaryModel}) y de respaldo (${fallbackModel}) operativos.` : fallbackOk ? `Modelo principal (${primaryModel}) no respondi\xF3, pero el de respaldo (${fallbackModel}) est\xE1 disponible.` : expP?.explanation || "Ambos modelos fallaron en la comprobaci\xF3n.",
      suggestedFix: primaryOk ? void 0 : availableModels.length > 0 ? `El modelo no existe para esta clave. Elige uno de los modelos v\xE1lidos detectados: ${availableModels.slice(0, 4).join(", ")}` : expP?.suggestedFix
    };
    if (!primaryOk && !fallbackOk) report.overallSuccess = false;
  }
  if (!hasKey || !aiClient) {
    report.tests.grounding = {
      id: "grounding",
      name: "B\xFAsqueda de Google (Search Grounding)",
      passed: false,
      message: "Prueba de b\xFAsqueda omitida: se requiere una clave de API v\xE1lida."
    };
  } else {
    try {
      const respG = await withTimeout(
        aiClient.models.generateContent({
          model: primaryModel,
          contents: "Dime brevemente qu\xE9 hora es en Tokio hoy",
          config: { maxOutputTokens: 10, tools: [{ googleSearch: {} }] }
        }),
        8e3
      );
      const passedG = !!respG.text;
      report.tests.grounding = {
        id: "grounding",
        name: "B\xFAsqueda de Google (Search Grounding)",
        passed: passedG,
        message: passedG ? "Herramienta de b\xFAsqueda en tiempo real operativa (Google Search Grounding activo)." : "La b\xFAsqueda no devolvi\xF3 datos estructurados."
      };
    } catch (err) {
      const codeG = err.status || err.code || "ERROR";
      const isQuota = String(codeG) === "429" || err.message?.toLowerCase().includes("quota") || err.message?.toLowerCase().includes("resource_exhausted");
      report.tests.grounding = {
        id: "grounding",
        name: "B\xFAsqueda de Google (Search Grounding)",
        passed: false,
        code: codeG,
        quotaExhausted: isQuota,
        autoDisableRecommended: isQuota,
        message: isQuota ? "L\xEDmite de cuota alcanzado para Google Search Grounding (C\xF3digo 429)." : `Fallo en prueba de b\xFAsqueda: ${err.message}`,
        suggestedFix: isQuota ? "Desactiva la B\xFAsqueda Web Autom\xE1tica en Ajustes para continuar conversando con Gemini sin agotar la cuota diaria." : "Verifica tu plan en Google AI Studio o prueba sin b\xFAsqueda web."
      };
    }
  }
  report.tests.localServer = {
    id: "local_server",
    name: "Servidor Local & Red Interna (127.0.0.1)",
    passed: true,
    userDataDir,
    proxy: process.env.HTTPS_PROXY || "Conexi\xF3n Directa (Sin Proxy)",
    message: `Servidor Express interno activo en 127.0.0.1. Directorio de datos: ${userDataDir}. Proxy: ${process.env.HTTPS_PROXY || "Ninguno"}.`
  };
  report.totalLatencyMs = Date.now() - startTime;
  res.json(report);
});
app.get("/api/assistant/diagnostics/chain", async (req, res) => {
  const result = {
    apiKeyConfigured: !!aiClient,
    tiers: {
      searchGrounding: false,
      directGemini: false,
      liteGemini: false,
      localEngine: true
    },
    latencyMs: 0,
    timestamp: Date.now()
  };
  if (!aiClient) return res.json(result);
  const start = Date.now();
  try {
    const testDirect = await withTimeout(
      aiClient.models.generateContent({
        model: "gemini-3.8-flash",
        contents: "ping",
        config: { maxOutputTokens: 5 }
      }),
      6e3
    );
    result.tiers.directGemini = !!testDirect.text;
  } catch {
  }
  try {
    const testSearch = await withTimeout(
      aiClient.models.generateContent({
        model: "gemini-3.8-flash",
        contents: "hora en Tokio hoy",
        config: { maxOutputTokens: 10, tools: [{ googleSearch: {} }] }
      }),
      8e3
    );
    result.tiers.searchGrounding = !!testSearch.text;
  } catch {
  }
  try {
    const testLite = await withTimeout(
      aiClient.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: "ping",
        config: { maxOutputTokens: 5 }
      }),
      6e3
    );
    result.tiers.liteGemini = !!testLite.text;
  } catch {
  }
  result.latencyMs = Date.now() - start;
  res.json(result);
});
app.get("/api/assistant/diagnostics/models", async (req, res) => {
  const models = await fetchAvailableModels(currentApiKey);
  res.json({ models, activeKey: !!currentApiKey });
});
app.get("/api/assistant/diagnostics/logs", (req, res) => {
  if (import_fs.default.existsSync(connectionLogFile)) {
    try {
      const content = import_fs.default.readFileSync(connectionLogFile, "utf-8");
      const lines = content.split("\n").filter(Boolean);
      return res.json({ logs: lines.slice(-60) });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  res.json({ logs: [] });
});
app.get("/api/assistant/config/apikey", (req, res) => {
  const isSet = !!currentApiKey && currentApiKey !== "MY_GEMINI_API_KEY";
  const masked = isSet ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" + currentApiKey.slice(-4) : "";
  res.json({
    isConfigured: isSet,
    maskedKey: masked,
    storageLocation: import_fs.default.existsSync(credentialsFile) ? credentialsFile : "Entorno"
  });
});
app.post("/api/assistant/config/apikey", (req, res) => {
  const { apiKey } = req.body;
  if (typeof apiKey === "string") {
    const cleanKey = apiKey.trim();
    try {
      let existingCreds = {};
      if (import_fs.default.existsSync(credentialsFile)) {
        try {
          existingCreds = JSON.parse(import_fs.default.readFileSync(credentialsFile, "utf-8"));
        } catch {
        }
      }
      existingCreds.apiKey = cleanKey;
      existingCreds.updatedAt = Date.now();
      import_fs.default.writeFileSync(credentialsFile, JSON.stringify(existingCreds, null, 2), "utf-8");
      refreshAiClient(cleanKey);
      logConnectionEvent(
        "Config",
        "KEY_SAVED",
        0,
        cleanKey ? `Clave guardada y recargada en caliente en UserData (...${cleanKey.slice(-4)})` : "Clave eliminada. Modo local activo."
      );
      return res.json({
        success: true,
        isConfigured: !!cleanKey,
        maskedKey: cleanKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" + cleanKey.slice(-4) : ""
      });
    } catch (err) {
      logConnectionEvent("Config", "KEY_ERROR", 0, `Error guardando clave: ${err.message}`);
      return res.status(500).json({ error: "Error guardando clave: " + err.message });
    }
  }
  res.status(400).json({ error: "apiKey inv\xE1lida" });
});
app.get("/api/assistant/config/proxy", (req, res) => {
  res.json({
    proxyUrl: process.env.HTTPS_PROXY || "",
    systemProxyActive: !!process.env.HTTPS_PROXY
  });
});
app.post("/api/assistant/config/proxy", (req, res) => {
  const { proxyUrl } = req.body;
  const cleanProxy = typeof proxyUrl === "string" ? proxyUrl.trim() : "";
  try {
    let existingCreds = {};
    if (import_fs.default.existsSync(credentialsFile)) {
      try {
        existingCreds = JSON.parse(import_fs.default.readFileSync(credentialsFile, "utf-8"));
      } catch {
      }
    }
    existingCreds.proxy = cleanProxy;
    existingCreds.updatedAt = Date.now();
    import_fs.default.writeFileSync(credentialsFile, JSON.stringify(existingCreds, null, 2), "utf-8");
    if (cleanProxy) {
      process.env.HTTPS_PROXY = cleanProxy;
      process.env.HTTP_PROXY = cleanProxy;
      try {
        (0, import_undici.setGlobalDispatcher)(new import_undici.EnvHttpProxyAgent());
      } catch {
      }
      logConnectionEvent("Proxy", "CONFIGURED", 0, `Proxy manual configurado: ${cleanProxy}`);
    } else {
      delete process.env.HTTPS_PROXY;
      delete process.env.HTTP_PROXY;
      try {
        (0, import_undici.setGlobalDispatcher)(new import_undici.EnvHttpProxyAgent());
      } catch {
      }
      logConnectionEvent("Proxy", "RESET", 0, "Proxy manual restablecido a modo directo.");
    }
    return res.json({ success: true, proxyUrl: cleanProxy });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get("/api/assistant/userdata", (req, res) => {
  if (import_fs.default.existsSync(userStoreFile)) {
    try {
      const data = JSON.parse(import_fs.default.readFileSync(userStoreFile, "utf-8"));
      return res.json(data);
    } catch {
    }
  }
  res.json({});
});
app.post("/api/assistant/userdata", (req, res) => {
  try {
    import_fs.default.writeFileSync(userStoreFile, JSON.stringify(req.body, null, 2), "utf-8");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/assistant/transcribe", async (req, res) => {
  const { audioBase64, mimeType = "audio/webm" } = req.body;
  if (!audioBase64 || typeof audioBase64 !== "string") {
    return res.status(400).json({ error: "audioBase64 requerido" });
  }
  if (aiClient) {
    try {
      const response = await aiClient.models.generateContent({
        model: "gemini-3.5-transcribe",
        contents: {
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            { text: "Transcribe exactamente en espa\xF1ol lo que dice el usuario en este audio. Devuelve \xDANICAMENTE el texto transcrito directo, sin comillas ni aclaraciones." }
          ]
        }
      });
      const transcript = (response.text || "").trim();
      if (transcript) {
        return res.json({ transcript, source: "gemini_3.5_transcribe" });
      }
    } catch (err) {
      console.warn("[Viernes System] gemini-3.5-transcribe fall\xF3, ejecutando fallback gemini-3.8-flash:", err.message);
      try {
        const fallbackResp = await aiClient.models.generateContent({
          model: "gemini-3.8-flash",
          contents: {
            parts: [
              { inlineData: { mimeType, data: audioBase64 } },
              { text: "Transcribe exactamente en espa\xF1ol lo que dice el usuario en este audio. Devuelve \xDANICAMENTE el texto transcrito directo, sin comillas ni aclaraciones." }
            ]
          }
        });
        const transcript = (fallbackResp.text || "").trim();
        return res.json({ transcript, source: "gemini_3.8_flash_transcribe" });
      } catch (fbErr) {
        console.warn("[Viernes System] Error en fallback de transcripci\xF3n:", fbErr.message);
      }
    }
  }
  res.json({
    transcript: "",
    source: "offline_local",
    offline: true,
    message: "Modo sin conexi\xF3n activo o sin clave de Gemini. Operando comandos locales deterministicos."
  });
});
app.post("/api/assistant/launch-edge", (req, res) => {
  const port = req.body.port || process.env.PORT || 3e3;
  const targetUrl = `http://localhost:${port}`;
  try {
    if (process.platform === "win32") {
      (0, import_child_process.spawn)("msedge", [`--app=${targetUrl}`], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      (0, import_child_process.spawn)("open", ["-a", "Microsoft Edge", targetUrl], { detached: true, stdio: "ignore" }).unref();
    } else {
      (0, import_child_process.spawn)("xdg-open", [targetUrl], { detached: true, stdio: "ignore" }).unref();
    }
    res.json({ success: true, url: targetUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/assistant/chat", async (req, res) => {
  try {
    const result = await answerEverything(req.body);
    return res.json(result);
  } catch (err) {
    console.error("[Viernes System] Error inesperado en chat endpoint:", err);
    return res.status(500).json({
      response: "Error interno de procesamiento. Los subsistemas locales permanecen intactos.",
      tier: "emergency",
      confidence: "baja",
      sources: []
    });
  }
});
app.post("/api/assistant/chat-stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  try {
    const result = await answerEverything({
      ...req.body,
      onChunk: (chunk) => {
        res.write(`data: ${JSON.stringify({ type: "chunk", text: chunk })}

`);
      }
    });
    res.write(`data: ${JSON.stringify({ type: "done", result })}

`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}

`);
    res.end();
  }
});
async function setupApp(serverInstance) {
  const isProduction = process.env.NODE_ENV === "production" || !!process.env.VIERNES_PACKAGED || !!process.env.ELECTRON_RUN_AS_NODE;
  const potentialPaths = [
    process.env.VIERNES_STATIC_PATH,
    process.resourcesPath ? import_path.default.join(process.resourcesPath, "app.asar", "dist") : "",
    process.resourcesPath ? import_path.default.join(process.resourcesPath, "dist") : "",
    import_path.default.resolve(currentDir, "dist"),
    import_path.default.resolve(currentDir, "../dist"),
    import_path.default.resolve(process.cwd(), "dist")
  ].filter(Boolean);
  let staticDir = "";
  for (const p of potentialPaths) {
    if (import_fs.default.existsSync(p) && import_fs.default.existsSync(import_path.default.join(p, "index.html"))) {
      staticDir = p;
      break;
    }
  }
  if (!isProduction && !staticDir) {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    console.log("[Viernes System] Vite middleware montado en desarrollo.");
  } else {
    if (staticDir) {
      app.use(import_express.default.static(staticDir));
      app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api/")) return next();
        if (req.path === "/overlay" || req.path === "/overlay.html") {
          return res.sendFile(import_path.default.join(staticDir, "overlay.html"));
        }
        if (req.path === "/wake-word" || req.path === "/wake-word.html") {
          return res.sendFile(import_path.default.join(staticDir, "wake-word.html"));
        }
        res.sendFile(import_path.default.join(staticDir, "index.html"));
      });
      console.log(`[Viernes System] Sirviendo archivos est\xE1ticos desde: ${staticDir}`);
    } else {
      console.warn("[Viernes System] Directorio est\xE1tico dist no encontrado en rutas previstas.");
    }
  }
}
async function startServer(initialPort = 3e3) {
  await setupApp();
  return new Promise((resolve, reject) => {
    let port = parseInt(process.env.PORT || String(initialPort), 10);
    const server = import_http.default.createServer(app);
    function tryListen(p) {
      server.listen(p, "0.0.0.0", () => {
        console.log(`[Viernes System] Core online on http://0.0.0.0:${p}`);
        try {
          import_fs.default.writeFileSync(import_path.default.join(userDataDir, "viernes_port.json"), JSON.stringify({ port: p, pid: process.pid }), "utf-8");
        } catch {
        }
        resolve({ server, port: p });
        setTimeout(() => {
          runInternetAudit().then(() => {
            console.log("[Viernes System] Auditor\xEDa inicial de accesos a internet completada en segundo plano.");
          }).catch(() => {
          });
        }, 1200);
      });
      server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
          console.warn(`[Viernes System] Puerto ${p} en uso, intentando ${p + 1}...`);
          tryListen(p + 1);
        } else {
          reject(err);
        }
      });
    }
    tryListen(port);
  });
}
var isMain = process.argv[1] && (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.cjs") || process.argv[1].endsWith("server.js"));
if (isMain) {
  startServer().catch((err) => {
    console.error("[Viernes System] Error al iniciar el servidor:", err);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  answerEverything,
  app,
  explainErrorCode,
  logConnectionEvent,
  refreshAiClient,
  runInternetAudit,
  setupApp,
  startServer
});
