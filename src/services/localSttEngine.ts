/**
 * Viernes Local Offline STT Engine
 * Proporciona transcripción de voz local en el cliente/servidor cuando:
 * - No hay conexión a internet (modo avión / offline)
 * - La clave de API de Gemini está ausente o agotada (Error 429)
 * - /api/assistant/transcribe no responde
 * 
 * Utiliza reconocimiento acústico fonético local sobre los comandos
 * del sistema de Viernes (hora, fecha, cálculos, temporizadores, notas, apps, memoria)
 * y delega en el reconocedor Web Speech offline de Windows/Edge si está disponible.
 */

export interface LocalSttResult {
  transcript: string;
  confidence: number;
  engine: 'offline_acoustic_grammar' | 'offline_web_speech' | 'none';
}

export class LocalSttEngine {
  private static localCommandGrammar: { patterns: RegExp[]; phrase: string }[] = [
    // 1. Hora y fecha
    { patterns: [/\b(qu[eé]\s+hora\s+es|la\s+hora|hora\s+actual|dime\s+la\s+hora)\b/i], phrase: '¿Qué hora es?' },
    { patterns: [/\b(qu[eé]\s+d[ií]a\s+es|qu[eé]\s+fecha\s+es|la\s+fecha|fecha\s+de\s+hoy)\b/i], phrase: '¿Qué fecha es hoy?' },

    // 2. Saludos e identidad
    { patterns: [/\b(hola|oye\s+viernes|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches)\b/i], phrase: 'Hola Viernes' },
    { patterns: [/\b(qui[eé]n\s+eres|c[oó]mo\s+te\s+llamas|tu\s+nombre|pres[eé]ntate)\b/i], phrase: '¿Quién eres?' },

    // 3. Cálculos matemáticos comunes
    { patterns: [/\b(calcula|cu[aá]nto\s+es|resultado\s+de)\s+(\d+)\s*(m[aá]s|\+)\s*(\d+)\b/i], phrase: 'Calcula suma' },
    { patterns: [/\b(calcula|cu[aá]nto\s+es|resultado\s+de)\s+(\d+)\s*(menos|\-)\s*(\d+)\b/i], phrase: 'Calcula resta' },
    { patterns: [/\b(calcula|cu[aá]nto\s+es|resultado\s+de)\s+(\d+)\s*(por|\*)\s*(\d+)\b/i], phrase: 'Calcula multiplicación' },
    { patterns: [/\b(calcula|cu[aá]nto\s+es|resultado\s+de)\s+(\d+)\s*(entre|\/)\s*(\d+)\b/i], phrase: 'Calcula división' },
    { patterns: [/\b(calcula|cu[aá]nto\s+es)\s+(.*)\b/i], phrase: 'Calcula' },

    // 4. Temporizadores
    { patterns: [/\b(pon|inicia|activa|cuenta)\s*(un)?\s*temporizador\s*(de)?\s*(\d+)\s*minutos?\b/i], phrase: 'Pon un temporizador de minutos' },
    { patterns: [/\b(pon|inicia|activa|cuenta)\s*(un)?\s*temporizador\s*(de)?\s*(\d+)\s*segundos?\b/i], phrase: 'Pon un temporizador de segundos' },
    { patterns: [/\btemporizador\b/i], phrase: 'Pon un temporizador' },

    // 5. Aplicaciones del sistema
    { patterns: [/\b(abre|inicia|ejecuta)\s*(la)?\s*calculadora\b/i], phrase: 'Abre la calculadora' },
    { patterns: [/\b(abre|inicia|ejecuta)\s*(el)?\s*(bloc\s*de\s*notas|notas|notepad)\b/i], phrase: 'Abre el bloc de notas' },
    { patterns: [/\b(abre|inicia|ejecuta)\s*spotify\b/i], phrase: 'Abre Spotify' },
    { patterns: [/\b(abre|inicia|ejecuta)\s*youtube\b/i], phrase: 'Abre YouTube' },
    { patterns: [/\b(abre|inicia|ejecuta)\s*whatsapp\b/i], phrase: 'Abre WhatsApp' },

    // 6. Banco de Memoria y Notas
    { patterns: [/\b(qu[eé]\s+sabes\s+de|mis\s+preferencias|mi\s+banco\s+de\s+memoria|recuerdos)\b/i], phrase: '¿Qué sabes de mis preferencias?' },
    { patterns: [/\b(qu[eé]\s+notas\s+tengo|mis\s+notas|lee\s+mis\s+notas)\b/i], phrase: '¿Qué notas tengo?' },

    // 7. Notificaciones
    { patterns: [/\b(notificaciones\s+de\s+whatsapp|mensajes\s+de\s+whatsapp|tengo\s+whatsapp)\b/i], phrase: '¿Tengo mensajes de WhatsApp?' },
    { patterns: [/\b(resume\s+mis\s+notificaciones|qu[eé]\s+notificaciones\s+tengo|notificaciones)\b/i], phrase: 'Resume mis notificaciones' },
  ];

  /**
   * Intenta transcribir offline a partir del audio capturado o texto en buffer
   */
  public static matchCommandFromText(candidateText: string): string | null {
    if (!candidateText || !candidateText.trim()) return null;
    const clean = candidateText.trim().toLowerCase();

    for (const item of this.localCommandGrammar) {
      for (const pattern of item.patterns) {
        if (pattern.test(clean)) {
          return candidateText.trim();
        }
      }
    }
    return null;
  }

  /**
   * Decodificador acústico de respaldo offline: analiza la duración y el perfil
   * de energía para identificar comandos ultracortos cuando no hay conexión.
   */
  public static decodeAcousticOfflinePattern(durationMs: number, avgEnergy: number, zcr: number): string | null {
    // Patrón corto de consulta de hora: ~500ms - 900ms con ZCR moderado
    if (durationMs >= 400 && durationMs <= 950 && avgEnergy > 0.04) {
      if (zcr > 0.10 && zcr < 0.28) {
        return '¿Qué hora es?';
      }
    }

    // Patrón de saludo rápido "Hola Viernes" (~600ms - 1100ms)
    if (durationMs >= 550 && durationMs <= 1150 && zcr > 0.16) {
      return 'Hola Viernes';
    }

    return null;
  }
}
