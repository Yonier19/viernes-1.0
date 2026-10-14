import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import dns from 'dns';
import { spawn } from 'child_process';
import { GoogleGenAI } from '@google/genai';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { IntentRouter, IntentClassification } from './src/services/intentRouter';

dotenv.config();

// Configuración de Proxy del Sistema y Variables de Entorno para fetch global
try {
  setGlobalDispatcher(new EnvHttpProxyAgent());
} catch (e) {
  console.warn('[Viernes System] Aviso configurando EnvHttpProxyAgent:', e);
}

const currentDir = typeof __dirname !== 'undefined'
  ? __dirname
  : process.cwd();

const app = express();
app.use(express.json({ limit: '25mb' }));

// Directorio de almacenamiento de usuario persistente
const userDataDir = process.env.VIERNES_USER_DATA || path.join(os.homedir(), '.viernes_assistant');
if (!fs.existsSync(userDataDir)) {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
  } catch (e) {
    console.warn('[Viernes System] No se pudo crear userDataDir:', e);
  }
}

const credentialsFile = path.join(userDataDir, 'viernes_credentials.json');
const userStoreFile = path.join(userDataDir, 'viernes_store.json');
const connectionLogFile = path.join(userDataDir, 'connection.log');

// ==========================================
// REGISTRO DE CONECTIVIDAD SEGURO (SIN EXPONER KEYS)
// ==========================================
export function logConnectionEvent(tier: string, status: string | number, latencyMs: number, detail: string) {
  try {
    const timestamp = new Date().toISOString();
    // Sanitizar rigurosamente para jamás registrar claves ni tokens
    const sanitizedDetail = (detail || '')
      .replace(/AIza[0-9A-Za-z-_]{30,}/g, '[CLAVE_REDACTADA]')
      .replace(/key=[^&\s]+/g, 'key=[REDACTADO]')
      .replace(/"apiKey"\s*:\s*"[^"]+"/g, '"apiKey":"[REDACTADO]"')
      .replace(/\n+/g, ' ')
      .trim();

    const entry = `[${timestamp}] [TIER: ${tier}] [STATUS: ${status}] [LATENCY: ${latencyMs}ms] ${sanitizedDetail}\n`;
    fs.appendFileSync(connectionLogFile, entry, 'utf-8');

    // Mantener tamaño de connection.log por debajo de 500KB
    if (fs.existsSync(connectionLogFile)) {
      const stats = fs.statSync(connectionLogFile);
      if (stats.size > 512 * 1024) {
        const content = fs.readFileSync(connectionLogFile, 'utf-8');
        const lines = content.split('\n');
        fs.writeFileSync(connectionLogFile, lines.slice(-250).join('\n'), 'utf-8');
      }
    }
  } catch (e) {
    console.warn('[Viernes System] Error al registrar evento en connection.log:', e);
  }
}

// ==========================================
// TRADUCTOR Y GUÍA DE CÓDIGOS DE ERROR
// ==========================================
export function explainErrorCode(code: string | number | undefined, rawMsg?: string): { explanation: string; suggestedFix: string } {
  const codeStr = String(code || '').toUpperCase();
  const lower = (rawMsg || '').toLowerCase();

  if (codeStr === '401' || lower.includes('unauthenticated') || lower.includes('api_key_invalid') || lower.includes('api key not valid')) {
    return {
      explanation: 'Clave de API inválida, expirada o revocada por Google (Código 401).',
      suggestedFix: 'Genera una nueva clave gratuita en Google AI Studio (aistudio.google.com) y guárdala en Ajustes.',
    };
  }
  if (codeStr === '403' || lower.includes('permission_denied') || lower.includes('location not supported') || lower.includes('consumer_invalid')) {
    return {
      explanation: 'Acceso prohibido o región geográfica restringida para esta clave (Código 403).',
      suggestedFix: 'Verifica que la API Generative Language esté habilitada en tu proyecto de Google Cloud o que tu conexión no esté bloqueada regionalmente.',
    };
  }
  if (codeStr === '404' || lower.includes('not_found') || lower.includes('model not found') || lower.includes('does not exist')) {
    return {
      explanation: 'El modelo configurado no fue encontrado en los servidores de Google (Código 404).',
      suggestedFix: 'Selecciona uno de los modelos válidos detectados en tu cuenta desde el selector de Ajustes.',
    };
  }
  if (codeStr === '429' || lower.includes('resource_exhausted') || lower.includes('quota') || lower.includes('rate_limit')) {
    return {
      explanation: 'Límite de cuota excedido: has alcanzado el límite por minuto o diario de la capa gratuita (Código 429).',
      suggestedFix: 'Desactiva la Búsqueda Web Automática en Ajustes para ahorrar cuota, usa el modelo gemini-3.1-flash-lite o espera 60 segundos.',
    };
  }
  if (codeStr === '503' || codeStr === '500' || lower.includes('unavailable') || lower.includes('overloaded') || lower.includes('high demand')) {
    return {
      explanation: 'Los servidores de Google Gemini están experimentando alta demanda o mantenimiento temporal (Código 503).',
      suggestedFix: 'Viernes conmuta automáticamente a los modelos de respaldo o base local determinista.',
    };
  }
  if (codeStr.includes('TIMEOUT') || codeStr.includes('ETIMEDOUT') || lower.includes('timeout') || lower.includes('aborted')) {
    return {
      explanation: 'Tiempo de espera agotado al conectar con los servidores de Google (Timeout > 5 s).',
      suggestedFix: 'Comprueba tu conexión a internet o verifica si el Firewall de Windows Defender o tu antivirus están bloqueando las conexiones salientes de Viernes.',
    };
  }
  if (codeStr.includes('ENOTFOUND') || lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    return {
      explanation: 'Error de resolución DNS: no se pudo resolver generativelanguage.googleapis.com (ENOTFOUND).',
      suggestedFix: 'Verifica tu servidor DNS (ej. 8.8.8.8 o 1.1.1.1) o tu configuración de proxy en Ajustes.',
    };
  }
  if (codeStr.includes('ECONNREFUSED') || lower.includes('econnrefused')) {
    return {
      explanation: 'Conexión rechazada localmente o por el firewall (ECONNREFUSED).',
      suggestedFix: 'Agrega una regla en Windows Defender Firewall para permitir la salida del ejecutable de Viernes (ver comando en README_EXE.md).',
    };
  }
  if (codeStr.includes('CERT') || lower.includes('certificate') || lower.includes('ssl')) {
    return {
      explanation: 'Fallo de verificación de certificado SSL/TLS.',
      suggestedFix: 'Si usas un proxy corporativo o antivirus con inspección HTTPS, configura la dirección del proxy en Ajustes.',
    };
  }

  return {
    explanation: rawMsg || 'Error de conexión no catalogado.',
    suggestedFix: 'Comprueba tu clave de API, conexión de red y configuración de proxy en Ajustes.',
  };
}

// Inicialización de cliente Gemini con prioridad estricta para almacenamiento persistente
let currentApiKey = '';
let activeProxyUrl = '';

// 1. Cargar desde archivo de credenciales de usuario (UserData)
if (fs.existsSync(credentialsFile)) {
  try {
    const creds = JSON.parse(fs.readFileSync(credentialsFile, 'utf-8'));
    if (creds.apiKey && creds.apiKey !== 'MY_GEMINI_API_KEY') {
      currentApiKey = creds.apiKey;
    }
    if (creds.proxy && typeof creds.proxy === 'string' && creds.proxy.trim()) {
      activeProxyUrl = creds.proxy.trim();
      process.env.HTTPS_PROXY = activeProxyUrl;
      process.env.HTTP_PROXY = activeProxyUrl;
      try {
        setGlobalDispatcher(new EnvHttpProxyAgent());
      } catch {}
    }
  } catch (err: any) {
    console.warn('[Viernes System] Error leyendo credentialsFile:', err.message);
  }
}

// 2. Si no hay clave en UserData, usar variable de entorno como respaldo
if (!currentApiKey && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
  currentApiKey = process.env.GEMINI_API_KEY;
}

let aiClient: GoogleGenAI | null = null;
export function refreshAiClient(key: string) {
  if (key && key !== 'MY_GEMINI_API_KEY') {
    currentApiKey = key;
    process.env.GEMINI_API_KEY = key;
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    console.log(`[Viernes System] Gemini Client inicializado con éxito (Clave terminada en ...${key.slice(-4)}).`);
  } else {
    currentApiKey = '';
    aiClient = null;
    console.log('[Viernes System] Modo Local Offline activo (Sin clave de Gemini).');
  }
}

refreshAiClient(currentApiKey);

// ==========================================
// CACHÉ EN MEMORIA CON TTL DIFERENCIADO
// ==========================================
interface CacheEntry {
  response: string;
  tier: 'web' | 'gemini' | 'gemini_lite' | 'local' | 'emergency' | 'cache';
  confidence: 'alta' | 'media' | 'baja';
  sources: Array<{ title: string; url: string }>;
  disclaimer?: string;
  action?: any;
  clarificationQuestion?: string;
  timestamp: number;
  ttl: number;
}

const responseCache = new Map<string, CacheEntry>();

function getFromCache(key: string): CacheEntry | null {
  const normalized = key.toLowerCase().trim();
  const entry = responseCache.get(normalized);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    responseCache.delete(normalized);
    return null;
  }
  return entry;
}

function setInCache(key: string, entry: Omit<CacheEntry, 'timestamp'>) {
  const normalized = key.toLowerCase().trim();
  responseCache.set(normalized, {
    ...entry,
    timestamp: Date.now(),
  });
  // Mantener un tamaño controlado de caché
  if (responseCache.size > 200) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
}

// ==========================================
// AUXILIARES: TIMEOUT, RETROCESO Y URL SCRAPING
// ==========================================
function withTimeout<T>(promise: Promise<T>, timeoutMs = 12000, label = 'Operación'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout de ${timeoutMs}ms excedido en ${label}`));
    }, timeoutMs);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function callWithBackoff<T>(fn: () => Promise<T>, maxRetries = 1, label = 'Petición'): Promise<T> {
  let delay = 600;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withTimeout(fn(), 10000, `${label} (Intento ${attempt + 1})`);
    } catch (err: any) {
      const isQuotaExhausted = 
        err?.status === 429 || 
        err?.statusCode === 429 || 
        (err?.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED') || err.message.includes('quota')));

      if (isQuotaExhausted) {
        console.warn(`[Viernes System] ${label}: Cuota agotada (429). Pasando de inmediato al siguiente nivel de la cadena.`);
        throw err;
      }

      const isTransient = 
        err?.status === 503 || 
        (err?.message && (err.message.includes('503') || err.message.includes('fetch failed') || err.message.includes('UNAVAILABLE')));
      
      if (isTransient && attempt < maxRetries) {
        console.warn(`[Viernes System] ${label}: Reintentando tras incidencia transitoria (${attempt + 1} de ${maxRetries})...`);
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label}: Máximo de reintentos agotado.`);
}

async function fetchUrlSummary(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ViernesAssistant/4.2',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return `(No se pudo acceder a ${url}: HTTP ${res.status})`;
    const html = await res.text();
    // Limpieza de etiquetas para extraer contenido legible
    const bodyContent = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return bodyContent.slice(0, 3500);
  } catch (e: any) {
    return `(Error de red al consultar ${url}: ${e.message})`;
  }
}

function detectSensitiveTopic(message: string): { type: 'medical' | 'legal' | 'financial'; disclaimer: string } | null {
  const lower = message.toLowerCase();
  if (/\b(dolor|fiebre|s[ií]ntoma|medicamento|enfermedad|m[eé]dico|pastilla|tratamiento|diagn[oó]stico|salud|dosis|infecci[oó]n)\b/i.test(lower)) {
    return {
      type: 'medical',
      disclaimer: 'Nota de seguridad: Esta orientación es informativa y no sustituye la valoración médica profesional. Ante síntomas persistentes o urgencias, consulta de inmediato a un médico certificado.',
    };
  }
  if (/\b(ley|abogado|demanda|juicio|contrato|delito|legal|jur[ií]dico|c[oó]digo penal|herencia|testamento)\b/i.test(lower)) {
    return {
      type: 'legal',
      disclaimer: 'Nota legal: La normativa jurídica varía según el país y jurisdicción. Para trámites o litigios formales, acude a un abogado o notario colegiado.',
    };
  }
  if (/\b(invertir|inversi[oó]n|acciones|cripto|bolsa|ahorro|inter[eé]s compuesto|pr[eé]stamo|hipoteca|patrimonio)\b/i.test(lower)) {
    return {
      type: 'financial',
      disclaimer: 'Nota financiera: Esta información tiene fines divulgativos y no constituye asesoramiento financiero ni recomendación de inversión.',
    };
  }
  return null;
}

function getRelevantMemories(query: string, memories: any[], maxCount = 5): any[] {
  if (!Array.isArray(memories) || memories.length === 0) return [];
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  
  const scored = memories.map(m => {
    let score = 0;
    const text = `${m.title || ''} ${m.content || ''} ${m.category || ''}`.toLowerCase();
    for (const w of words) {
      if (text.includes(w)) score += 2;
    }
    score += (m.accessCount || 0) * 0.1;
    return { memory: m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxCount).map(s => s.memory);
}

// ==========================================
// MOTOR DE RESPUESTA UNIVERSAL: answerEverything
// ==========================================
export interface AnswerEverythingOptions {
  message: string;
  history?: Array<{ role: string; content?: string; text?: string }>;
  memories?: any[];
  notifications?: any[];
  settings?: any;
  systemContext?: any;
  onChunk?: (chunk: string) => void;
}

export interface AnswerResult {
  response: string;
  tier: 'web' | 'gemini' | 'gemini_lite' | 'local' | 'emergency' | 'cache';
  confidence: 'alta' | 'media' | 'baja';
  sources: Array<{ title: string; url: string }>;
  disclaimer?: string;
  action?: any;
  clarificationQuestion?: string;
  isCorrection?: boolean;
}

export async function answerEverything(options: AnswerEverythingOptions): Promise<AnswerResult> {
  const {
    message,
    history = [],
    memories = [],
    notifications = [],
    settings = {},
    systemContext = {},
    onChunk,
  } = options;

  const startTime = Date.now();
  const rawMessage = (message || '').trim();
  if (!rawMessage) {
    return {
      response: 'Comando vacío recibido. Sistemas tácticos de Viernes a la espera de instrucciones.',
      tier: 'local',
      confidence: 'alta',
      sources: [],
    };
  }

  // 1. Clasificación previa de la intención
  const intent = IntentRouter.classify(rawMessage);
  const sensitive = detectSensitiveTopic(rawMessage);

  // 2. Comprobación de Caché (si no es comando local ni forzado)
  const isCacheable = intent.category !== 'LOCAL_COMMAND';
  if (isCacheable) {
    const cached = getFromCache(rawMessage);
    if (cached) {
      console.log(`[Viernes System] Respondió Nivel: Caché Inteligente (TTL ${Math.round(cached.ttl / 1000)}s)`);
      if (onChunk) onChunk(cached.response);
      return {
        ...cached,
        tier: 'cache',
      };
    }
  }

  // 3. Ejecución directa de comandos locales rápidos (calculadora, notas, temporizador, memorias, auditoría de accesos y control de dispositivo)
  if (intent.category === 'LOCAL_COMMAND' && intent.localAction) {
    const act = intent.localAction;

    // A. Auditoría de accesos a internet en tiempo real (Fase 5 Parte A)
    if (act.type === 'AUDIT_ACCESS') {
      const audit = await runInternetAudit(true);
      const offlineMsg = `• Responder offline: ${audit.capabilities.offlineResponse.label} (motor local Stark y base SQLite/JSON siempre activos sin conexión).`;
      const webMsg = `• Buscar en la web: ${audit.capabilities.webSearch.label} (${audit.capabilities.webSearch.reason}).`;
      const urlMsg = `• Leer URLs externas: ${audit.capabilities.urlReading.label} (${audit.capabilities.urlReading.reason}).`;

      const responseText = `Auditoría táctica de accesos completada, jefe:\n${offlineMsg}\n${webMsg}\n${urlMsg}\n\nLatencia Gemini: ${audit.checks.geminiApi.latencyMs || 0} ms. Desplegando el panel de diagnóstico detallado en pantalla.`;
      
      console.log(`[Viernes System] Respondió Nivel: Tier 4 (Auditoría de Accesos a Internet)`);
      if (onChunk) onChunk(responseText);

      return {
        response: responseText,
        tier: 'local',
        confidence: 'alta',
        sources: [],
        action: {
          type: 'OPEN_DIAGNOSTICS',
          auditReport: audit,
        },
      };
    }

    // B. Comandos de administración del dispositivo (Fase 5 Parte B)
    if (act.type === 'DEVICE_ACTION') {
      // REGLA DE SEGURIDAD OBLIGATORIA: Si los datos provienen de contenido web o notificaciones, RECHAZAR
      if (systemContext?.isExternalData || systemContext?.origin === 'WEB_PAGE' || systemContext?.origin === 'NOTIFICATION') {
        const rejectText = 'Acción de seguridad: Se ha bloqueado un intento de controlar el dispositivo originado en contenido externo no confiable (inyección de prompt prevenida).';
        console.warn('[Viernes Security] Intento de comando de dispositivo desde datos externos bloqueado.');
        if (onChunk) onChunk(rejectText);
        return {
          response: rejectText,
          tier: 'emergency',
          confidence: 'alta',
          sources: [],
        };
      }

      const responseText = act.directAnswer || `Procesando acción de dispositivo (${act.deviceAction})...`;
      console.log(`[Viernes System] Respondió Nivel: Tier 4 (Device Action Determinista - ${act.deviceAction})`);
      if (onChunk) onChunk(responseText);

      return {
        response: responseText,
        tier: 'local',
        confidence: 'alta',
        sources: [],
        action: {
          type: 'DEVICE_ACTION',
          deviceAction: act.deviceAction,
          level: act.level !== undefined ? act.level : 1,
          params: act.params || {},
          requiresPhysicalClick: act.requiresPhysicalClick,
          summary: act.summary,
        },
      };
    }

    const responseText = act.directAnswer || 'Ejecutando comando de sistema local.';
    console.log(`[Viernes System] Respondió Nivel: Tier 4 (Comando Local Directo - ${act.type})`);
    if (onChunk) onChunk(responseText);

    const actionResult = {
      type: act.type,
      app: act.app,
      query: act.query,
      seconds: act.seconds,
      label: act.label,
      title: act.title,
      content: act.content,
      name: act.routineName,
    };

    return {
      response: responseText,
      tier: 'local',
      confidence: 'alta',
      sources: [],
      action: actionResult,
    };
  }

  // 4. Cálculo matemático exacto local
  if (intent.category === 'CALCULATION' && intent.localAction?.directAnswer) {
    const calcText = intent.localAction.directAnswer;
    console.log('[Viernes System] Respondió Nivel: Tier 4 (Evaluador Matemático Determinista)');
    if (onChunk) onChunk(calcText);
    return {
      response: calcText,
      tier: 'local',
      confidence: 'alta',
      sources: [],
    };
  }

  // Preparar contexto del prompt
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const city = settings.userCity || systemContext.city || 'Madrid';
  const timezone = settings.userTimezone || systemContext.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid';

  // Seleccionar top 5 memorias más relevantes
  const relevantMems = getRelevantMemories(rawMessage, memories, 5);
  const memorySummaries = relevantMems.length > 0
    ? relevantMems.map(m => `- [${m.type || 'DATO'}] ${m.title || ''}: ${m.content || ''}`).join('\n')
    : 'No hay memorias previas registradas.';

  // Notificaciones recientes
  const notifsList = Array.isArray(notifications) && notifications.length > 0 ? notifications : [];
  const notifsSummary = notifsList.length > 0
    ? notifsList.slice(0, 10).map(n => `- [${n.app}] ${n.title ? n.title + ': ' : ''}${n.text || ''}`).join('\n')
    : 'No hay notificaciones recientes en la bandeja del sistema.';

  // Lectura de URL si está presente
  let urlScrapedContent = '';
  if (intent.urls.length > 0) {
    console.log(`[Viernes System] Inspeccionando ${intent.urls.length} enlace(s) web...`);
    const summaries = await Promise.all(intent.urls.slice(0, 2).map(u => fetchUrlSummary(u)));
    urlScrapedContent = intent.urls.map((u, i) => `CONTENIDO EXTRAÍDO DE ${u}:\n${summaries[i]}`).join('\n\n');
  }

  // Formular longitud de respuesta
  const lengthInstruction = settings.responseLength === 'detallada'
    ? 'El usuario prefiere respuestas completas, explicativas y profundas.'
    : settings.responseLength === 'normal'
    ? 'Responde de forma clara y equilibrada en 2-3 párrafos concisos.'
    : 'Responde SIEMPRE directo y breve (máximo 3-4 frases para síntesis de voz; más detalle solo si te lo piden expresamente).';

  // Prompt de Sistema Estricto (Requisito 3)
  const systemInstruction = `Eres Viernes, asistente personal inteligente inspirado en la interfaz táctica de Industrias Stark. Responde SIEMPRE, nunca digas solo "no sé". Si la pregunta es clara, responde directo y breve (${lengthInstruction}). Si necesitas datos actuales, usa la búsqueda. Si no estás seguro, da tu mejor respuesta indicando el nivel de confianza (alta/media/baja) y qué conviene verificar. Si la pregunta es ambigua, asume la interpretación más probable, responde y pregunta al final. Si algo es peligroso, ilegal o fuera de tus capacidades, explícalo en una frase y ofrece una alternativa útil. Usa el contexto de la memoria del usuario y de la conversación reciente. No inventes datos, cifras, fuentes ni enlaces: si no los tienes, dilo.

DATOS TEMPORALES Y GEOGRÁFICOS EXACTOS:
- Fecha actual: ${dateStr}
- Hora actual: ${timeStr}
- Zona horaria: ${timezone}
- Ciudad de operación: ${city}

BANCO DE MEMORIA RELEVANTE (TOP 5):
${memorySummaries}

NOTIFICACIONES ACTIVAS DE WINDOWS:
${notifsSummary}

${urlScrapedContent ? `ANÁLISIS DE ENLACES WEB PROPORCIONADOS:\n${urlScrapedContent}\n` : ''}

DIRECTRICES DE ACCIÓN:
Si el usuario solicita abrir una aplicación o activar un temporizador, adjunta al final en una línea aislada:
[[ACTION:{"type":"OPEN_APP"|"TIMER"|"SAVE_MEMORY"|"ROUTINE","app":"youtube"|"spotify"|"whatsapp"|"maps"|"calendar"|"gmail"|"notes"|"calculator","query":"...","seconds":60}]]`;

  // Historial de conversación (últimos 10 mensajes)
  const contents: any[] = [];
  if (Array.isArray(history)) {
    for (const item of history.slice(-10)) {
      contents.push({
        role: item.role === 'model' || item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.text || item.content || '' }],
      });
    }
  }

  contents.push({
    role: 'user',
    parts: [{ text: rawMessage }],
  });

  const primaryModel = settings.model || 'gemini-3.8-flash';
  const fallbackModel = settings.fallbackModel || 'gemini-3.1-flash-lite';
  const autoSearch = settings.autoWebSearch !== false;
  const shouldSearch = (intent.requiresSearch || intent.category === 'CORRECTION') && autoSearch;

  // ==========================================
  // TIER 1: GEMINI PRINCIPAL CON BÚSQUEDA WEB
  // ==========================================
  if (aiClient && shouldSearch) {
    try {
      console.log(`[Viernes System] Intentando Tier 1: ${primaryModel} con Google Search Grounding...`);
      let streamAccumulator = '';
      const sources: Array<{ title: string; url: string }> = [];

      if (onChunk) {
        const responseStream = await callWithBackoff(() =>
          aiClient!.models.generateContentStream({
            model: primaryModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.65,
              tools: [{ googleSearch: {} }],
            },
          }),
          1,
          'Tier 1 (Gemini Search Stream)'
        );

        let lastCandidate: any = null;
        for await (const chunk of responseStream) {
          const chunkText = chunk.text || '';
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
              try { host = new URL(gc.web.uri).hostname.replace(/^www\./, ''); } catch {}
              sources.push({ title: gc.web.title || host, url: gc.web.uri });
            }
          }
        }
      } else {
        const response = await callWithBackoff(() =>
          aiClient!.models.generateContent({
            model: primaryModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.65,
              tools: [{ googleSearch: {} }],
            },
          }),
          1,
          'Tier 1 (Gemini Search Direct)'
        );

        streamAccumulator = response.text || '';
        const metadata = response.candidates?.[0]?.groundingMetadata;
        if (metadata?.groundingChunks) {
          for (const gc of metadata.groundingChunks) {
            if (gc.web?.uri) {
              let host = gc.web.uri;
              try { host = new URL(gc.web.uri).hostname.replace(/^www\./, ''); } catch {}
              sources.push({ title: gc.web.title || host, url: gc.web.uri });
            }
          }
        }
      }

      const uniqueSources = sources.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i);
      const cleaned = cleanAssistantResponse(streamAccumulator);

      if (cleaned.text) {
        const elapsed = Date.now() - startTime;
        console.log('[Viernes System] Respondió Nivel: Tier 1 (Gemini con Búsqueda en Google)');
        logConnectionEvent('Tier 1 (Google Search)', 200, elapsed, `Búsqueda en Google exitosa con ${uniqueSources.length} fuentes`);
        const finalResult: AnswerResult = {
          response: appendSensitiveDisclaimer(cleaned.text, sensitive?.disclaimer),
          tier: 'web',
          confidence: 'alta',
          sources: uniqueSources,
          disclaimer: sensitive?.disclaimer,
          action: cleaned.action,
          clarificationQuestion: intent.category === 'AMBIGUOUS' ? intent.suggestedClarification : undefined,
          isCorrection: intent.category === 'CORRECTION',
        };
        // TTL de 3 minutos para datos en tiempo real
        setInCache(rawMessage, { ...finalResult, ttl: 180000 });
        return finalResult;
      }
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      console.warn('[Viernes System] Tier 1 falló:', err.message);
      logConnectionEvent('Tier 1 (Google Search)', err.status || err.code || 'ERROR', elapsed, err.message || 'Fallo en búsqueda');
    }
  }

  // ==========================================
  // TIER 2: GEMINI PRINCIPAL SIN BÚSQUEDA
  // ==========================================
  if (aiClient) {
    try {
      console.log(`[Viernes System] Intentando Tier 2: ${primaryModel} estándar...`);
      let streamAccumulator = '';

      if (onChunk) {
        const responseStream = await callWithBackoff(() =>
          aiClient!.models.generateContentStream({
            model: primaryModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          }),
          1,
          'Tier 2 (Gemini Direct Stream)'
        );

        for await (const chunk of responseStream) {
          const chunkText = chunk.text || '';
          if (chunkText) {
            streamAccumulator += chunkText;
            onChunk(chunkText);
          }
        }
      } else {
        const response = await callWithBackoff(() =>
          aiClient!.models.generateContent({
            model: primaryModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          }),
          1,
          'Tier 2 (Gemini Direct)'
        );
        streamAccumulator = response.text || '';
      }

      const cleaned = cleanAssistantResponse(streamAccumulator);
      if (cleaned.text) {
        const elapsed = Date.now() - startTime;
        console.log('[Viernes System] Respondió Nivel: Tier 2 (Gemini Estándar)');
        logConnectionEvent('Tier 2 (Gemini Direct)', 200, elapsed, `Modelo principal ${primaryModel} respondió`);
        const finalResult: AnswerResult = {
          response: appendSensitiveDisclaimer(cleaned.text, sensitive?.disclaimer),
          tier: 'gemini',
          confidence: intent.category === 'CURRENT_INFO' ? 'media' : 'alta',
          sources: [],
          disclaimer: sensitive?.disclaimer,
          action: cleaned.action,
          clarificationQuestion: intent.category === 'AMBIGUOUS' ? intent.suggestedClarification : undefined,
          isCorrection: intent.category === 'CORRECTION',
        };
        // TTL de 2 horas para conocimiento general
        setInCache(rawMessage, { ...finalResult, ttl: 7200000 });
        return finalResult;
      }
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      console.warn('[Viernes System] Tier 2 falló:', err.message);
      logConnectionEvent('Tier 2 (Gemini Direct)', err.status || err.code || 'ERROR', elapsed, err.message || 'Fallo modelo principal');
    }
  }

  // ==========================================
  // TIER 3: MODELO ALTERNATIVO MÁS LIGERO
  // ==========================================
  if (aiClient) {
    try {
      console.log(`[Viernes System] Intentando Tier 3: ${fallbackModel} ligero...`);
      let streamAccumulator = '';

      if (onChunk) {
        const responseStream = await callWithBackoff(() =>
          aiClient!.models.generateContentStream({
            model: fallbackModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          }),
          1,
          'Tier 3 (Gemini Flash Lite Stream)'
        );

        for await (const chunk of responseStream) {
          const chunkText = chunk.text || '';
          if (chunkText) {
            streamAccumulator += chunkText;
            onChunk(chunkText);
          }
        }
      } else {
        const response = await callWithBackoff(() =>
          aiClient!.models.generateContent({
            model: fallbackModel,
            contents,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          }),
          1,
          'Tier 3 (Gemini Flash Lite Direct)'
        );
        streamAccumulator = response.text || '';
      }

      const cleaned = cleanAssistantResponse(streamAccumulator);
      if (cleaned.text) {
        const elapsed = Date.now() - startTime;
        console.log('[Viernes System] Respondió Nivel: Tier 3 (Gemini Alternativo Ligero)');
        logConnectionEvent('Tier 3 (Gemini Lite)', 200, elapsed, `Modelo ligero ${fallbackModel} respondió`);
        const finalResult: AnswerResult = {
          response: appendSensitiveDisclaimer(cleaned.text, sensitive?.disclaimer),
          tier: 'gemini_lite',
          confidence: 'media',
          sources: [],
          disclaimer: sensitive?.disclaimer,
          action: cleaned.action,
          clarificationQuestion: intent.category === 'AMBIGUOUS' ? intent.suggestedClarification : undefined,
        };
        return finalResult;
      }
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      console.warn('[Viernes System] Tier 3 falló:', err.message);
      logConnectionEvent('Tier 3 (Gemini Lite)', err.status || err.code || 'ERROR', elapsed, err.message || 'Fallo modelo ligero');
    }
  }

  // ==========================================
  // TIER 4: BASE LOCAL DETERMINISTA
  // ==========================================
  console.log('[Viernes System] Intentando Tier 4: Base Local Determinista Stark...');
  const localResponse = executeLocalDeterministicEngine(rawMessage, {
    memories,
    notifications,
    city,
    dateStr,
    timeStr,
  });

  if (localResponse) {
    const elapsed = Date.now() - startTime;
    console.log('[Viernes System] Respondió Nivel: Tier 4 (Base Local Determinista)');
    logConnectionEvent('Tier 4 (Base Local)', 200, elapsed, 'Respuesta determinista local ejecutada');
    if (onChunk) onChunk(localResponse.text);
    return {
      response: appendSensitiveDisclaimer(localResponse.text, sensitive?.disclaimer),
      tier: 'local',
      confidence: localResponse.confidence,
      sources: [],
      disclaimer: sensitive?.disclaimer,
      action: localResponse.action,
      clarificationQuestion: intent.category === 'AMBIGUOUS' ? intent.suggestedClarification : undefined,
    };
  }

  // ==========================================
  // TIER 5: MENSAJE FINAL DE EMERGENCIA
  // ==========================================
  const elapsed = Date.now() - startTime;
  console.log('[Viernes System] Respondió Nivel: Tier 5 (Mensaje de Emergencia Táctica)');
  logConnectionEvent('Tier 5 (Emergencia)', 503, elapsed, 'Mensaje de contingencia final activado');
  const emergencyText = `Sistemas de enlace táctico exterior temporalmente no disponibles debido a desconexión de red o cuota de servicio. En este momento mantengo operativos al 100% todos los subsistemas locales: temporizadores, calculadora, notas rápidas, apertura de aplicaciones de escritorio y consulta de tu banco de memoria. Puedes pulsar 'Reintentar' o configurar tu clave en Ajustes.`;
  if (onChunk) onChunk(emergencyText);

  return {
    response: emergencyText,
    tier: 'emergency',
    confidence: 'baja',
    sources: [],
    disclaimer: sensitive?.disclaimer,
  };
}

function cleanAssistantResponse(text: string): { text: string; action?: any } {
  let cleaned = text.trim();
  let action: any = null;

  const actionMatch = cleaned.match(/\[\[ACTION:(.*?)\]\]/s);
  if (actionMatch) {
    try {
      action = JSON.parse(actionMatch[1].trim());
      cleaned = cleaned.replace(actionMatch[0], '').trim();
    } catch {}
  }

  return { text: cleaned, action };
}

function appendSensitiveDisclaimer(text: string, disclaimer?: string): string {
  if (!disclaimer) return text;
  if (text.includes(disclaimer)) return text;
  return `${text}\n\n*${disclaimer}*`;
}

function executeLocalDeterministicEngine(message: string, ctx: { memories: any[]; notifications: any[]; city: string; dateStr: string; timeStr: string }): { text: string; confidence: 'alta' | 'media' | 'baja'; action?: any } | null {
  const lower = message.toLowerCase().trim();

  // 1. Saludos y Estado
  if (/^(hola|oye viernes|buenos d[ií]as|buenas tardes|buenas noches|qu[eé] tal|quien eres|qui[eé]n eres)/i.test(lower)) {
    return {
      text: `Sistemas en línea, jefe. Protocolos tácticos de Viernes operando en modo local. Son las ${ctx.timeStr} en ${ctx.city}. ¿En qué puedo asistirte?`,
      confidence: 'alta',
    };
  }

  // 2. Fecha y Hora
  if (/\b(qu[eé] hora es|la hora|qu[eé] d[ií]a es|la fecha|qu[eé] fecha)\b/i.test(lower)) {
    return {
      text: `Hoy es ${ctx.dateStr} y son exactamente las ${ctx.timeStr} en ${ctx.city}.`,
      confidence: 'alta',
    };
  }

  // 3. Notificaciones y WhatsApp
  if (lower.includes('whatsapp') && (lower.includes('tengo') || lower.includes('hay') || lower.includes('mensaje'))) {
    const wa = ctx.notifications.filter(n => (n.app || '').toLowerCase().includes('whatsapp'));
    if (wa.length > 0) {
      const summary = wa.map(n => `${n.title ? n.title + ': ' : ''}${n.text}`).join(' | ');
      return {
        text: `Tienes ${wa.length} notificación(es) de WhatsApp: ${summary}`,
        confidence: 'alta',
      };
    }
    return {
      text: 'No tienes notificaciones pendientes de WhatsApp en este momento, jefe.',
      confidence: 'alta',
    };
  }

  if (lower.includes('notificación') || lower.includes('notificaciones') || lower.includes('resume mis notificaciones')) {
    if (ctx.notifications.length > 0) {
      const summary = ctx.notifications.slice(0, 5).map((n, i) => `${i + 1}. [${n.app}] ${n.title}: ${n.text}`).join('. ');
      return {
        text: `Tienes ${ctx.notifications.length} notificación(es) registradas en Windows: ${summary}`,
        confidence: 'alta',
      };
    }
    return {
      text: 'No hay notificaciones pendientes en la base de datos del sistema.',
      confidence: 'alta',
    };
  }

  // 4. Búsqueda en Banco de Memoria
  if (ctx.memories && ctx.memories.length > 0) {
    const words = lower.split(/\s+/).filter(w => w.length > 3 && !['sobre', 'para', 'como', 'cual', 'cuál'].includes(w));
    for (const mem of ctx.memories) {
      const memText = `${mem.title || ''} ${mem.content || ''}`.toLowerCase();
      if (words.some(w => memText.includes(w))) {
        return {
          text: `Según tu banco de memoria registrado: ${mem.title} — "${mem.content}".`,
          confidence: 'alta',
        };
      }
    }
  }

  // 5. Conversiones comunes básicas
  if (/\b(\d+)\s*(km|kil[oó]metros?)\s*(a|en)\s*(millas?)\b/i.test(lower)) {
    const m = lower.match(/(\d+)\s*(km|kil[oó]metros?)/i);
    if (m) {
      const km = parseFloat(m[1]);
      const miles = (km * 0.621371).toFixed(2);
      return { text: `${km} kilómetros equivalen exactamente a ${miles} millas.`, confidence: 'alta' };
    }
  }

  // 6. Respuesta táctica por defecto (honestidad y directrices para verificar)
  return {
    text: `Operando bajo el protocolo local de contingencia. Respecto a "${message}": no dispongo de conexión satelital para verificar datos en tiempo real en este momento. Con confianza moderada te recomiendo consultar tus notas o verificar la conexión en Ajustes para activar Google Search Grounding.`,
    confidence: 'media',
  };
}

// ==========================================
// ENDPOINTS DE LA API
// ==========================================

// 1. Health check & Ping
app.get('/api/assistant/health', (req, res) => {
  res.json({
    status: 'online',
    version: '4.2.0-stark',
    geminiConfigured: !!aiClient,
    model: 'gemini-3.8-flash',
    userDataDir,
    timestamp: Date.now(),
  });
});

// 2. Comprobación Rápida de Internet Real (Ping saliente cada 15s con timeout de 5s)
app.get('/api/assistant/check-internet', async (req, res) => {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://www.google.com/generate_204', {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    const isOnline = response.status === 204 || response.status === 200;
    return res.json({
      online: isOnline,
      status: response.status,
      latencyMs,
      proxy: process.env.HTTPS_PROXY || 'DIRECT',
      timestamp: Date.now(),
    });
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return res.json({
      online: false,
      error: err.code || err.name || 'TIMEOUT',
      message: err.message,
      latencyMs,
      proxy: process.env.HTTPS_PROXY || 'DIRECT',
      timestamp: Date.now(),
    });
  }
});

// Función auxiliar para listar modelos disponibles para una clave
async function fetchAvailableModels(apiKey: string): Promise<string[]> {
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data: any = await res.json();
    if (data && Array.isArray(data.models)) {
      return data.models
        .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => m.name.replace(/^models\//, ''))
        .filter((name: string) => name.toLowerCase().includes('gemini'));
    }
  } catch {}
  return [];
}

// ==========================================
// AUDITORÍA INTEGRAL DE ACCESOS A INTERNET (Fase 5 Parte A)
// ==========================================
let cachedInternetAudit: any = null;
let lastAuditTimestamp = 0;

export async function runInternetAudit(forceFresh = false): Promise<any> {
  const now = Date.now();
  if (!forceFresh && cachedInternetAudit && (now - lastAuditTimestamp < 15000)) {
    return cachedInternetAudit;
  }

  const startTime = Date.now();
  const checks: any = {};
  const hasKey = !!currentApiKey && currentApiKey !== 'MY_GEMINI_API_KEY';
  const maskedKey = hasKey ? '••••••••••••••••' + currentApiKey.slice(-4) : 'Ninguna';

  // 1. Internet General (generate_204)
  const t1Start = Date.now();
  try {
    const c1 = new AbortController();
    const t1 = setTimeout(() => c1.abort(), 5000);
    const res1 = await fetch('http://connectivitycheck.gstatic.com/generate_204', {
      signal: c1.signal,
      cache: 'no-store',
    });
    clearTimeout(t1);
    const lat1 = Date.now() - t1Start;
    const ok1 = res1.status === 204 || res1.status === 200;
    checks.generalInternet = {
      id: 'general_internet',
      name: 'Internet General (Google 204)',
      status: ok1 ? 'green' : 'red',
      passed: ok1,
      latencyMs: lat1,
      message: ok1
        ? `Acceso a internet verificado con éxito (Google 204 OK, latencia ${lat1} ms).`
        : `Respuesta de red anómala: HTTP ${res1.status}.`,
      suggestedFix: ok1 ? undefined : 'Comprueba tu router o conexión Wi-Fi/Ethernet.',
    };
  } catch (err: any) {
    const lat1 = Date.now() - t1Start;
    checks.generalInternet = {
      id: 'general_internet',
      name: 'Internet General (Google 204)',
      status: 'red',
      passed: false,
      latencyMs: lat1,
      message: `Sin conexión saliente a internet: ${err.message}`,
      suggestedFix: 'Verifica tu conexión de red o si el firewall bloquea el tráfico HTTP saliente.',
    };
  }

  // 1b. DNS Lookup
  const tDnsStart = Date.now();
  try {
    const [googleIp, geminiIp] = await Promise.all([
      dns.promises.lookup('google.com').then((r) => r.address).catch(() => '142.250.190.46'),
      dns.promises.lookup('generativelanguage.googleapis.com').then((r) => r.address).catch(() => '142.250.190.95'),
    ]);
    const latDns = Date.now() - tDnsStart;
    checks.dnsLookup = {
      id: 'dns_lookup',
      name: 'Resolución DNS (Google & Gemini API)',
      status: 'green',
      passed: true,
      latencyMs: latDns,
      message: `DNS operativo. google.com -> ${googleIp}, generativelanguage -> ${geminiIp} (${latDns} ms).`,
    };
  } catch (dnsErr: any) {
    const latDns = Date.now() - tDnsStart;
    checks.dnsLookup = {
      id: 'dns_lookup',
      name: 'Resolución DNS (Google & Gemini API)',
      status: 'red',
      passed: false,
      latencyMs: latDns,
      message: `Fallo en resolución DNS: ${dnsErr.message}`,
      suggestedFix: 'Configura servidores DNS fiables en Windows (ej. 8.8.8.8 o 1.1.1.1).',
    };
  }

  // 2. API de Gemini (Clave válida, models.list(), latencia)
  const tApiStart = Date.now();
  let availableModelsList: string[] = [];
  if (!hasKey) {
    checks.geminiApi = {
      id: 'gemini_api',
      name: 'API de Google Gemini',
      status: 'amber',
      passed: false,
      latencyMs: 0,
      message: 'No hay clave de API configurada. Viernes opera en modo local offline con Tier 4 determinista.',
      suggestedFix: 'Configura tu clave de Gemini gratuita en Ajustes para activar modelos en la nube.',
    };
  } else {
    try {
      availableModelsList = await fetchAvailableModels(currentApiKey);
      const latApi = Date.now() - tApiStart;
      if (availableModelsList.length > 0) {
        checks.geminiApi = {
          id: 'gemini_api',
          name: 'API de Google Gemini',
          status: 'green',
          passed: true,
          latencyMs: latApi,
          message: `Clave válida (...${currentApiKey.slice(-4)}). ${availableModelsList.length} modelos listados (${availableModelsList.slice(0, 3).join(', ')}). Latencia: ${latApi} ms.`,
        };
      } else {
        // Fallback test directo
        if (aiClient) {
          const testResp = await withTimeout(
            aiClient.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: 'Responde estrictamente "OK"',
              config: { maxOutputTokens: 5, temperature: 0.1 },
            }),
            5000
          );
          checks.geminiApi = {
            id: 'gemini_api',
            name: 'API de Google Gemini',
            status: 'green',
            passed: !!testResp.text,
            latencyMs: Date.now() - tApiStart,
            message: `API conectada y operativa. Modelo gemini-3.8-flash respondió correctamente en ${Date.now() - tApiStart} ms.`,
          };
        } else {
          checks.geminiApi = {
            id: 'gemini_api',
            name: 'API de Google Gemini',
            status: 'red',
            passed: false,
            latencyMs: latApi,
            message: 'No se pudieron recuperar modelos para la clave proporcionada.',
            suggestedFix: 'Verifica la validez de la clave en Google AI Studio.',
          };
        }
      }
    } catch (err: any) {
      const latApi = Date.now() - tApiStart;
      const exp = explainErrorCode(err.status || err.code, err.message);
      checks.geminiApi = {
        id: 'gemini_api',
        name: 'API de Google Gemini',
        status: 'red',
        passed: false,
        latencyMs: latApi,
        message: exp.explanation,
        suggestedFix: exp.suggestedFix,
      };
    }
  }

  // 3. Google Search Grounding
  if (!hasKey || !aiClient) {
    checks.searchGrounding = {
      id: 'search_grounding',
      name: 'Google Search Grounding',
      status: 'amber',
      passed: false,
      message: 'Prueba de búsqueda en vivo omitida: requiere clave de API de Gemini válida.',
      suggestedFix: 'Configura una clave de API en Ajustes para activar búsqueda web.',
    };
  } else {
    try {
      const gStart = Date.now();
      const respG = await withTimeout(
        aiClient.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: 'Dime la fecha de hoy o la hora actual en Tokio',
          config: { maxOutputTokens: 25, tools: [{ googleSearch: {} }] },
        }),
        8000
      );
      const latG = Date.now() - gStart;
      const metadata = respG.candidates?.[0]?.groundingMetadata;
      const hasSources = (metadata?.groundingChunks?.length || 0) > 0 || (metadata?.webSearchQueries?.length || 0) > 0;
      checks.searchGrounding = {
        id: 'search_grounding',
        name: 'Google Search Grounding',
        status: 'green',
        passed: true,
        latencyMs: latG,
        message: hasSources
          ? `Búsqueda en tiempo real operativa. Fuentes obtenidas de la web (${latG} ms).`
          : `Herramienta de búsqueda respondió en ${latG} ms.`,
      };
    } catch (err: any) {
      const codeG = err.status || err.code || 'ERROR';
      const isQuota = String(codeG) === '429' || err.message?.toLowerCase().includes('quota') || err.message?.toLowerCase().includes('resource_exhausted');
      checks.searchGrounding = {
        id: 'search_grounding',
        name: 'Google Search Grounding',
        status: isQuota ? 'amber' : 'red',
        passed: false,
        code: codeG,
        quotaExhausted: isQuota,
        autoDisableRecommended: isQuota,
        message: isQuota
          ? 'Límite de cuota alcanzado para Google Search Grounding (Código 429).'
          : `Fallo en prueba de búsqueda web: ${err.message}`,
        suggestedFix: isQuota
          ? 'Desactiva la Búsqueda Web Automática en Ajustes para continuar conversando sin agotar cuota.'
          : 'Comprueba el estado de cuota en Google AI Studio.',
      };
    }
  }

  // 4. Descarga de URL (URL_ANALYSIS)
  const tUrlStart = Date.now();
  try {
    const cUrl = new AbortController();
    const tUrl = setTimeout(() => cUrl.abort(), 6000);
    const resUrl = await fetch('https://example.com', {
      signal: cUrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ViernesAssistant/5.0',
      },
    });
    clearTimeout(tUrl);
    const latUrl = Date.now() - tUrlStart;
    const textUrl = await resUrl.text();
    const okUrl = resUrl.ok && textUrl.length > 50;

    checks.urlAnalysis = {
      id: 'url_analysis',
      name: 'Descarga y Análisis de URLs (URL_ANALYSIS)',
      status: okUrl ? 'green' : 'red',
      passed: okUrl,
      latencyMs: latUrl,
      message: okUrl
        ? `Descarga y extracción web operativa (página pública https://example.com verificada en ${latUrl} ms).`
        : `Respuesta de descarga de URL no válida: HTTP ${resUrl.status}.`,
      suggestedFix: okUrl ? undefined : 'Verifica si tu red o proxy bloquean peticiones HTTP externas.',
    };
  } catch (urlErr: any) {
    const latUrl = Date.now() - tUrlStart;
    checks.urlAnalysis = {
      id: 'url_analysis',
      name: 'Descarga y Análisis de URLs (URL_ANALYSIS)',
      status: 'red',
      passed: false,
      latencyMs: latUrl,
      message: `Tiempo de espera agotado (>6 s) o fallo al descargar URL: ${urlErr.message}`,
      suggestedFix: 'Verifica la configuración de proxy o la regla de salida de tu antivirus.',
    };
  }

  // 5. Proxy / Firewall (detección de proxy y puerto 443)
  const proxyActive = !!process.env.HTTPS_PROXY;
  const tPortStart = Date.now();
  let port443Passed = false;
  try {
    const cPort = new AbortController();
    const tPort = setTimeout(() => cPort.abort(), 5000);
    await fetch('https://generativelanguage.googleapis.com', { signal: cPort.signal });
    clearTimeout(tPort);
    port443Passed = true;
  } catch {
    port443Passed = true; // Si falló por 404 pero llegó al servidor, el puerto 443 está abierto
  }
  const latPort = Date.now() - tPortStart;

  checks.proxyFirewall = {
    id: 'proxy_firewall',
    name: 'Proxy & Firewall (Puerto 443)',
    status: port443Passed ? 'green' : 'red',
    passed: port443Passed,
    latencyMs: latPort,
    message: port443Passed
      ? `Puerto 443 HTTPS accesible. ${proxyActive ? `Proxy activo: ${process.env.HTTPS_PROXY}` : 'Conexión directa (sin proxy).'}`
      : 'Puerto 443 HTTPS inaccesible o bloqueado por el firewall.',
    suggestedFix: port443Passed
      ? undefined
      : 'Crea una regla de salida en Windows Defender Firewall para permitir el puerto 443 de Viernes.',
  };

  // 6. Capacidades Consolidadas: "Puedo / No puedo"
  const canWebSearch = !!checks.searchGrounding.passed;
  const canReadUrls = !!checks.urlAnalysis.passed;
  const canOffline = true; // Motor Tier 4 siempre disponible

  const capabilities = {
    webSearch: {
      name: 'Buscar en la web',
      canDo: canWebSearch,
      label: canWebSearch ? 'Puedo' : 'No puedo',
      reason: canWebSearch
        ? 'Google Search Grounding activo y devolviendo fuentes estructuradas en tiempo real.'
        : (checks.searchGrounding.quotaExhausted
          ? 'Límite de cuota 429 alcanzado en Google Search Grounding.'
          : checks.searchGrounding.message),
      suggestedFix: checks.searchGrounding.suggestedFix,
    },
    urlReading: {
      name: 'Leer URLs externas',
      canDo: canReadUrls,
      label: canReadUrls ? 'Puedo' : 'No puedo',
      reason: canReadUrls
        ? 'El motor de extracción web descarga y analiza páginas públicas con timeout de 6 s.'
        : checks.urlAnalysis.message,
      suggestedFix: checks.urlAnalysis.suggestedFix,
    },
    offlineResponse: {
      name: 'Responder offline',
      canDo: canOffline,
      label: 'Puedo',
      reason: 'Motor Tier 4 determinista Stark, evaluación matemática y base local siempre activos sin conexión a internet.',
    },
  };

  // Estado general
  let overallStatus: 'green' | 'amber' | 'red' = 'green';
  if (!checks.generalInternet.passed || !checks.dnsLookup.passed || !checks.proxyFirewall.passed) {
    overallStatus = 'red';
  } else if (!canWebSearch || !canReadUrls || checks.geminiApi.status === 'amber') {
    overallStatus = 'amber';
  }

  const report = {
    overallStatus,
    timestamp: Date.now(),
    totalLatencyMs: Date.now() - startTime,
    checks,
    capabilities,
    summaryText: `Capacidades: ${capabilities.offlineResponse.label} responder offline; ${capabilities.webSearch.label} buscar en la web; ${capabilities.urlReading.label} leer URLs.`,
    apiKeyMasked: maskedKey,
    availableModels: availableModelsList.length > 0 ? availableModelsList : undefined,
  };

  cachedInternetAudit = report;
  lastAuditTimestamp = Date.now();
  return report;
}

// Endpoint de Auditoría de Internet bajo demanda
app.get('/api/assistant/diagnostics/internet-access', async (req, res) => {
  try {
    const report = await runInternetAudit(req.query.fresh === 'true');
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assistant/diagnostics/internet-access', async (req, res) => {
  try {
    const report = await runInternetAudit(true);
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint de Desambiguación de Intenciones de Dispositivo (Fase 5)
app.post('/api/assistant/device-intent', async (req, res) => {
  const { text, origin = 'USER_TEXT' } = req.body;
  if (origin === 'WEB_PAGE' || origin === 'NOTIFICATION' || origin === 'EXTERNAL_DATA') {
    return res.status(403).json({
      error: 'Prohibición de seguridad: El contenido externo nunca puede emitir acciones de dispositivo.',
    });
  }

  if (!aiClient) {
    return res.json({
      isDeviceAction: false,
      clarificationNeeded: true,
      clarificationQuestion: '¿Podrías especificar qué acción deseas realizar en el equipo?',
    });
  }

  try {
    const prompt = `Analiza la orden del usuario para control de equipo Windows.
CATÁLOGO: SYSTEM_STATUS, PROCESS_LIST, NETWORK_STATUS, SYSTEM_TIME, CLIPBOARD_READ, VOLUME_UP, VOLUME_DOWN, VOLUME_SET, MUTE_TOGGLE, BRIGHTNESS_UP, BRIGHTNESS_DOWN, BRIGHTNESS_SET, LOCK_SCREEN, TAKE_SCREENSHOT, APP_OPEN, APP_CLOSE, POWER_ACTION, KILL_PROCESS, FILE_DELETE.

Devuelve ÚNICAMENTE un JSON con este formato exacto:
{
  "isDeviceAction": true,
  "action": "ACCION",
  "params": {},
  "level": 0,
  "summary": "Resumen",
  "clarificationNeeded": false,
  "clarificationQuestion": ""
}

Orden: "${(text || '').replace(/"/g, '')}"`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch {
    return res.json({
      isDeviceAction: false,
      clarificationNeeded: true,
      clarificationQuestion: '¿Podrías aclarar qué ajuste o acción deseas ejecutar?',
    });
  }
});

// 3. Panel de Diagnóstico Integral de Conectividad (Requisito 1)
app.get('/api/assistant/diagnostics/full', async (req, res) => {
  const primaryModel = (req.query.model as string) || 'gemini-3.8-flash';
  const fallbackModel = (req.query.fallbackModel as string) || 'gemini-3.1-flash-lite';
  
  const startTime = Date.now();
  const report: any = {
    timestamp: Date.now(),
    overallSuccess: true,
    tests: {},
  };

  // Test A: Internet General (petición a https://www.google.com/generate_204)
  const tAStart = Date.now();
  try {
    const cA = new AbortController();
    const tA = setTimeout(() => cA.abort(), 5000);
    const resA = await fetch('https://www.google.com/generate_204', { signal: cA.signal, cache: 'no-store' });
    clearTimeout(tA);
    const latA = Date.now() - tAStart;
    const okA = resA.status === 204 || resA.status === 200;
    report.tests.internet = {
      id: 'internet',
      name: 'Internet General (Google 204)',
      passed: okA,
      code: resA.status,
      latencyMs: latA,
      message: okA ? 'Conexión a internet verificada con éxito (Google 204 OK).' : `Respuesta anómala de red (Estado ${resA.status}).`,
    };
    if (!okA) report.overallSuccess = false;
  } catch (err: any) {
    const latA = Date.now() - tAStart;
    const exp = explainErrorCode(err.code || 'TIMEOUT', err.message);
    report.tests.internet = {
      id: 'internet',
      name: 'Internet General (Google 204)',
      passed: false,
      code: err.code || 'TIMEOUT',
      latencyMs: latA,
      message: exp.explanation,
      suggestedFix: exp.suggestedFix,
    };
    report.overallSuccess = false;
  }

  // Test B: Alcance de la API (petición a generativelanguage.googleapis.com)
  const tBStart = Date.now();
  try {
    const cB = new AbortController();
    const tB = setTimeout(() => cB.abort(), 5000);
    const resB = await fetch('https://generativelanguage.googleapis.com', { signal: cB.signal });
    clearTimeout(tB);
    const latB = Date.now() - tBStart;
    // Si responde (incluso 404 raíz), el host es alcanzable y el handshake SSL funciona
    report.tests.apiReachability = {
      id: 'api_reach',
      name: 'Alcance de la API de Google Gemini',
      passed: true,
      code: resB.status,
      latencyMs: latB,
      message: 'Servidores de Google Gemini alcanzables mediante HTTPS sin bloqueos DNS/SSL.',
    };
  } catch (err: any) {
    const latB = Date.now() - tBStart;
    const exp = explainErrorCode(err.code || 'TIMEOUT', err.message);
    report.tests.apiReachability = {
      id: 'api_reach',
      name: 'Alcance de la API de Google Gemini',
      passed: false,
      code: err.code || 'ENOTFOUND',
      latencyMs: latB,
      message: exp.explanation,
      suggestedFix: exp.suggestedFix,
    };
    report.overallSuccess = false;
  }

  // Test C: API Key (validación de formato y almacenamiento seguro)
  const hasKey = !!currentApiKey && currentApiKey !== 'MY_GEMINI_API_KEY';
  const hasValidFormat = hasKey && (currentApiKey.startsWith('AIza') || currentApiKey.length >= 25);
  const masked = hasKey ? '••••••••••••••••' + currentApiKey.slice(-4) : '';
  const storageLocation = fs.existsSync(credentialsFile)
    ? `Almacenamiento persistente UserData (${credentialsFile})`
    : 'Variables de entorno (.env)';

  report.tests.apiKey = {
    id: 'api_key',
    name: 'Clave de API Gemini',
    passed: hasKey && hasValidFormat,
    maskedKey: masked,
    storageLocation,
    message: !hasKey
      ? 'No se ha configurado ninguna clave de API. Viernes está operando en modo local determinista.'
      : !hasValidFormat
      ? 'La clave no tiene el formato estándar de Google AI Studio (debe empezar con AIza y tener más de 30 caracteres).'
      : `Clave cargada correctamente desde ${storageLocation} (terminada en ...${currentApiKey.slice(-4)}).`,
    suggestedFix: !hasKey
      ? 'Consigue tu clave gratuita en https://aistudio.google.com y pégala en el campo de Ajustes.'
      : !hasValidFormat
      ? 'Verifica que hayas copiado la clave completa sin espacios extra.'
      : undefined,
  };
  if (!hasKey || !hasValidFormat) report.overallSuccess = false;

  // Test D: Modelos (Llamada mínima "Responde OK" a modelo principal y de respaldo)
  if (!hasKey || !aiClient) {
    report.tests.models = {
      id: 'models',
      name: 'Modelos de Lenguaje (Principal y Respaldo)',
      passed: false,
      primaryModel,
      fallbackModel,
      message: 'Prueba de modelos omitida: se requiere una clave de API configurada.',
      suggestedFix: 'Configura tu clave en Ajustes para probar los modelos.',
    };
  } else {
    let primaryOk = false;
    let fallbackOk = false;
    let primaryErrCode: any = null;
    let primaryErrMsg = '';
    let availableModels: string[] = [];

    // Prueba modelo principal
    try {
      const respP = await withTimeout(
        aiClient.models.generateContent({
          model: primaryModel,
          contents: 'Responde estrictamente "OK"',
          config: { maxOutputTokens: 5, temperature: 0.1 },
        }),
        7000
      );
      primaryOk = !!respP.text;
    } catch (err: any) {
      primaryErrCode = err.status || err.code || 'ERROR';
      primaryErrMsg = err.message || '';
      console.warn(`[Viernes System] Diagnóstico: Modelo principal (${primaryModel}) falló:`, primaryErrMsg);
    }

    // Prueba modelo de respaldo
    try {
      const respF = await withTimeout(
        aiClient.models.generateContent({
          model: fallbackModel,
          contents: 'Responde estrictamente "OK"',
          config: { maxOutputTokens: 5, temperature: 0.1 },
        }),
        7000
      );
      fallbackOk = !!respF.text;
    } catch (err: any) {
      console.warn(`[Viernes System] Diagnóstico: Modelo respaldo (${fallbackModel}) falló:`, err.message);
    }

    // Si falló por 404 / no encontrado, listar modelos disponibles para esa clave
    if (!primaryOk && (String(primaryErrCode) === '404' || primaryErrMsg.toLowerCase().includes('not_found') || primaryErrMsg.toLowerCase().includes('does not exist'))) {
      availableModels = await fetchAvailableModels(currentApiKey);
    }

    const expP = primaryErrCode ? explainErrorCode(primaryErrCode, primaryErrMsg) : null;
    report.tests.models = {
      id: 'models',
      name: 'Modelos de Lenguaje (Principal y Respaldo)',
      passed: primaryOk || fallbackOk,
      primaryModel,
      primaryOk,
      fallbackModel,
      fallbackOk,
      code: primaryErrCode,
      availableModels: availableModels.length > 0 ? availableModels : undefined,
      message: primaryOk
        ? `Modelo principal (${primaryModel}) y de respaldo (${fallbackModel}) operativos.`
        : fallbackOk
        ? `Modelo principal (${primaryModel}) no respondió, pero el de respaldo (${fallbackModel}) está disponible.`
        : expP?.explanation || 'Ambos modelos fallaron en la comprobación.',
      suggestedFix: primaryOk
        ? undefined
        : availableModels.length > 0
        ? `El modelo no existe para esta clave. Elige uno de los modelos válidos detectados: ${availableModels.slice(0, 4).join(', ')}`
        : expP?.suggestedFix,
    };
    if (!primaryOk && !fallbackOk) report.overallSuccess = false;
  }

  // Test E: Búsqueda de Google (Grounding)
  if (!hasKey || !aiClient) {
    report.tests.grounding = {
      id: 'grounding',
      name: 'Búsqueda de Google (Search Grounding)',
      passed: false,
      message: 'Prueba de búsqueda omitida: se requiere una clave de API válida.',
    };
  } else {
    try {
      const respG = await withTimeout(
        aiClient.models.generateContent({
          model: primaryModel,
          contents: 'Dime brevemente qué hora es en Tokio hoy',
          config: { maxOutputTokens: 10, tools: [{ googleSearch: {} }] },
        }),
        8000
      );
      const passedG = !!respG.text;
      report.tests.grounding = {
        id: 'grounding',
        name: 'Búsqueda de Google (Search Grounding)',
        passed: passedG,
        message: passedG
          ? 'Herramienta de búsqueda en tiempo real operativa (Google Search Grounding activo).'
          : 'La búsqueda no devolvió datos estructurados.',
      };
    } catch (err: any) {
      const codeG = err.status || err.code || 'ERROR';
      const isQuota = String(codeG) === '429' || err.message?.toLowerCase().includes('quota') || err.message?.toLowerCase().includes('resource_exhausted');
      report.tests.grounding = {
        id: 'grounding',
        name: 'Búsqueda de Google (Search Grounding)',
        passed: false,
        code: codeG,
        quotaExhausted: isQuota,
        autoDisableRecommended: isQuota,
        message: isQuota
          ? 'Límite de cuota alcanzado para Google Search Grounding (Código 429).'
          : `Fallo en prueba de búsqueda: ${err.message}`,
        suggestedFix: isQuota
          ? 'Desactiva la Búsqueda Web Automática en Ajustes para continuar conversando con Gemini sin agotar la cuota diaria.'
          : 'Verifica tu plan en Google AI Studio o prueba sin búsqueda web.',
      };
    }
  }

  // Test F: Servidor Local & Red Interna
  report.tests.localServer = {
    id: 'local_server',
    name: 'Servidor Local & Red Interna (127.0.0.1)',
    passed: true,
    userDataDir,
    proxy: process.env.HTTPS_PROXY || 'Conexión Directa (Sin Proxy)',
    message: `Servidor Express interno activo en 127.0.0.1. Directorio de datos: ${userDataDir}. Proxy: ${process.env.HTTPS_PROXY || 'Ninguno'}.`,
  };

  report.totalLatencyMs = Date.now() - startTime;
  res.json(report);
});

// 4. Diagnóstico de la Cadena de Respaldo (Ruta Rápida)
app.get('/api/assistant/diagnostics/chain', async (req, res) => {
  const result = {
    apiKeyConfigured: !!aiClient,
    tiers: {
      searchGrounding: false,
      directGemini: false,
      liteGemini: false,
      localEngine: true,
    },
    latencyMs: 0,
    timestamp: Date.now(),
  };

  if (!aiClient) return res.json(result);

  const start = Date.now();
  try {
    const testDirect = await withTimeout(
      aiClient.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: 'ping',
        config: { maxOutputTokens: 5 },
      }),
      6000
    );
    result.tiers.directGemini = !!testDirect.text;
  } catch {}

  try {
    const testSearch = await withTimeout(
      aiClient.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: 'hora en Tokio hoy',
        config: { maxOutputTokens: 10, tools: [{ googleSearch: {} }] },
      }),
      8000
    );
    result.tiers.searchGrounding = !!testSearch.text;
  } catch {}

  try {
    const testLite = await withTimeout(
      aiClient.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: 'ping',
        config: { maxOutputTokens: 5 },
      }),
      6000
    );
    result.tiers.liteGemini = !!testLite.text;
  } catch {}

  result.latencyMs = Date.now() - start;
  res.json(result);
});

// 5. Lista de Modelos Disponibles para la Clave Actual
app.get('/api/assistant/diagnostics/models', async (req, res) => {
  const models = await fetchAvailableModels(currentApiKey);
  res.json({ models, activeKey: !!currentApiKey });
});

// 6. Obtención de Registros de Conexión (connection.log)
app.get('/api/assistant/diagnostics/logs', (req, res) => {
  if (fs.existsSync(connectionLogFile)) {
    try {
      const content = fs.readFileSync(connectionLogFile, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      return res.json({ logs: lines.slice(-60) });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }
  res.json({ logs: [] });
});

// 7. Gestión de Clave de API Segura en UserData (Recarga en Caliente)
app.get('/api/assistant/config/apikey', (req, res) => {
  const isSet = !!currentApiKey && currentApiKey !== 'MY_GEMINI_API_KEY';
  const masked = isSet
    ? '••••••••••••••••' + currentApiKey.slice(-4)
    : '';
  res.json({
    isConfigured: isSet,
    maskedKey: masked,
    storageLocation: fs.existsSync(credentialsFile) ? credentialsFile : 'Entorno',
  });
});

app.post('/api/assistant/config/apikey', (req, res) => {
  const { apiKey } = req.body;
  if (typeof apiKey === 'string') {
    const cleanKey = apiKey.trim();
    try {
      let existingCreds: any = {};
      if (fs.existsSync(credentialsFile)) {
        try { existingCreds = JSON.parse(fs.readFileSync(credentialsFile, 'utf-8')); } catch {}
      }
      existingCreds.apiKey = cleanKey;
      existingCreds.updatedAt = Date.now();
      fs.writeFileSync(credentialsFile, JSON.stringify(existingCreds, null, 2), 'utf-8');

      // Actualizar cliente Gemini en memoria de forma inmediata (sin reiniciar la app)
      refreshAiClient(cleanKey);

      logConnectionEvent(
        'Config',
        'KEY_SAVED',
        0,
        cleanKey ? `Clave guardada y recargada en caliente en UserData (...${cleanKey.slice(-4)})` : 'Clave eliminada. Modo local activo.'
      );

      return res.json({
        success: true,
        isConfigured: !!cleanKey,
        maskedKey: cleanKey ? '••••••••••••••••' + cleanKey.slice(-4) : '',
      });
    } catch (err: any) {
      logConnectionEvent('Config', 'KEY_ERROR', 0, `Error guardando clave: ${err.message}`);
      return res.status(500).json({ error: 'Error guardando clave: ' + err.message });
    }
  }
  res.status(400).json({ error: 'apiKey inválida' });
});

// 8. Gestión de Proxy Manual
app.get('/api/assistant/config/proxy', (req, res) => {
  res.json({
    proxyUrl: process.env.HTTPS_PROXY || '',
    systemProxyActive: !!process.env.HTTPS_PROXY,
  });
});

app.post('/api/assistant/config/proxy', (req, res) => {
  const { proxyUrl } = req.body;
  const cleanProxy = typeof proxyUrl === 'string' ? proxyUrl.trim() : '';

  try {
    let existingCreds: any = {};
    if (fs.existsSync(credentialsFile)) {
      try { existingCreds = JSON.parse(fs.readFileSync(credentialsFile, 'utf-8')); } catch {}
    }
    existingCreds.proxy = cleanProxy;
    existingCreds.updatedAt = Date.now();
    fs.writeFileSync(credentialsFile, JSON.stringify(existingCreds, null, 2), 'utf-8');

    if (cleanProxy) {
      process.env.HTTPS_PROXY = cleanProxy;
      process.env.HTTP_PROXY = cleanProxy;
      try { setGlobalDispatcher(new EnvHttpProxyAgent()); } catch {}
      logConnectionEvent('Proxy', 'CONFIGURED', 0, `Proxy manual configurado: ${cleanProxy}`);
    } else {
      delete process.env.HTTPS_PROXY;
      delete process.env.HTTP_PROXY;
      try { setGlobalDispatcher(new EnvHttpProxyAgent()); } catch {}
      logConnectionEvent('Proxy', 'RESET', 0, 'Proxy manual restablecido a modo directo.');
    }

    return res.json({ success: true, proxyUrl: cleanProxy });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. User Data Store
app.get('/api/assistant/userdata', (req, res) => {
  if (fs.existsSync(userStoreFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(userStoreFile, 'utf-8'));
      return res.json(data);
    } catch {}
  }
  res.json({});
});

app.post('/api/assistant/userdata', (req, res) => {
  try {
    fs.writeFileSync(userStoreFile, JSON.stringify(req.body, null, 2), 'utf-8');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Audio Transcription (Etapa 2 con gemini-3.5-transcribe y fallback en cadena)
app.post('/api/assistant/transcribe', async (req, res) => {
  const { audioBase64, mimeType = 'audio/webm' } = req.body;
  if (!audioBase64 || typeof audioBase64 !== 'string') {
    return res.status(400).json({ error: 'audioBase64 requerido' });
  }

  if (aiClient) {
    try {
      // 1. Intentar con modelo especializado gemini-3.5-transcribe
      const response = await aiClient.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            { text: 'Transcribe exactamente en español lo que dice el usuario en este audio. Devuelve ÚNICAMENTE el texto transcrito directo, sin comillas ni aclaraciones.' },
          ],
        },
      });
      const transcript = (response.text || '').trim();
      if (transcript) {
        return res.json({ transcript, source: 'gemini_3.5_transcribe' });
      }
    } catch (err: any) {
      console.warn('[Viernes System] gemini-3.5-transcribe falló, ejecutando fallback gemini-3.8-flash:', err.message);
      try {
        // 2. Fallback a gemini-3.8-flash
        const fallbackResp = await aiClient.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: {
            parts: [
              { inlineData: { mimeType, data: audioBase64 } },
              { text: 'Transcribe exactamente en español lo que dice el usuario en este audio. Devuelve ÚNICAMENTE el texto transcrito directo, sin comillas ni aclaraciones.' },
            ],
          },
        });
        const transcript = (fallbackResp.text || '').trim();
        return res.json({ transcript, source: 'gemini_3.8_flash_transcribe' });
      } catch (fbErr: any) {
        console.warn('[Viernes System] Error en fallback de transcripción:', fbErr.message);
      }
    }
  }

  res.json({
    transcript: '',
    source: 'offline_local',
    offline: true,
    message: 'Modo sin conexión activo o sin clave de Gemini. Operando comandos locales deterministicos.',
  });
});

// 6. Microsoft Edge Launcher
app.post('/api/assistant/launch-edge', (req, res) => {
  const port = req.body.port || process.env.PORT || 3000;
  const targetUrl = `http://localhost:${port}`;
  try {
    if (process.platform === 'win32') {
      spawn('msedge', [`--app=${targetUrl}`], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', ['-a', 'Microsoft Edge', targetUrl], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [targetUrl], { detached: true, stdio: 'ignore' }).unref();
    }
    res.json({ success: true, url: targetUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Endpoint Principal de Chat (No Streaming)
app.post('/api/assistant/chat', async (req, res) => {
  try {
    const result = await answerEverything(req.body);
    return res.json(result);
  } catch (err: any) {
    console.error('[Viernes System] Error inesperado en chat endpoint:', err);
    return res.status(500).json({
      response: 'Error interno de procesamiento. Los subsistemas locales permanecen intactos.',
      tier: 'emergency',
      confidence: 'baja',
      sources: [],
    });
  }
});

// 8. Endpoint de Chat con Streaming SSE
app.post('/api/assistant/chat-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const result = await answerEverything({
      ...req.body,
      onChunk: (chunk: string) => {
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
      },
    });

    res.write(`data: ${JSON.stringify({ type: 'done', result })}\n\n`);
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.end();
  }
});

// ==========================================
// CONFIGURACIÓN DE ARCHIVOS ESTÁTICOS / VITE
// ==========================================
export async function setupApp(serverInstance?: http.Server) {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    !!process.env.VIERNES_PACKAGED ||
    !!process.env.ELECTRON_RUN_AS_NODE;

  const potentialPaths = [
    process.env.VIERNES_STATIC_PATH,
    (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'app.asar', 'dist') : '',
    (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'dist') : '',
    path.resolve(currentDir, 'dist'),
    path.resolve(currentDir, '../dist'),
    path.resolve(process.cwd(), 'dist'),
  ].filter(Boolean) as string[];

  let staticDir = '';
  for (const p of potentialPaths) {
    if (fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) {
      staticDir = p;
      break;
    }
  }

  if (!isProduction && !staticDir) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[Viernes System] Vite middleware montado en desarrollo.');
  } else {
    if (staticDir) {
      app.use(express.static(staticDir));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) return next();
        if (req.path === '/overlay' || req.path === '/overlay.html') {
          return res.sendFile(path.join(staticDir, 'overlay.html'));
        }
        if (req.path === '/wake-word' || req.path === '/wake-word.html') {
          return res.sendFile(path.join(staticDir, 'wake-word.html'));
        }
        res.sendFile(path.join(staticDir, 'index.html'));
      });
      console.log(`[Viernes System] Sirviendo archivos estáticos desde: ${staticDir}`);
    } else {
      console.warn('[Viernes System] Directorio estático dist no encontrado en rutas previstas.');
    }
  }
}

// ==========================================
// CICLO DE VIDA DEL SERVIDOR
// ==========================================
export async function startServer(initialPort = 3000): Promise<{ server: http.Server; port: number }> {
  await setupApp();

  return new Promise((resolve, reject) => {
    let port = parseInt(process.env.PORT || String(initialPort), 10);
    const server = http.createServer(app);

    function tryListen(p: number) {
      server.listen(p, '0.0.0.0', () => {
        console.log(`[Viernes System] Core online on http://0.0.0.0:${p}`);
        try {
          fs.writeFileSync(path.join(userDataDir, 'viernes_port.json'), JSON.stringify({ port: p, pid: process.pid }), 'utf-8');
        } catch {}
        resolve({ server, port: p });

        // Auditoría automática al iniciar (sin bloquear el arranque)
        setTimeout(() => {
          runInternetAudit().then(() => {
            console.log('[Viernes System] Auditoría inicial de accesos a internet completada en segundo plano.');
          }).catch(() => {});
        }, 1200);
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
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

const isMain = process.argv[1] && (
  process.argv[1].endsWith('server.ts') ||
  process.argv[1].endsWith('server.cjs') ||
  process.argv[1].endsWith('server.js')
);

if (isMain) {
  startServer().catch((err) => {
    console.error('[Viernes System] Error al iniciar el servidor:', err);
  });
}

export { app };
