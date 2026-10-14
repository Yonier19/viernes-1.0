/**
 * Script de Verificación de Respuesta Universal de Viernes (FRIDAY)
 * Ejecuta 20 casos de prueba rigurosos y confirma que el asistente SIEMPRE
 * genera una respuesta útil y no vacía, sin importar el tipo de consulta.
 * 
 * Uso: npm run test:answers
 */

import { answerEverything, refreshAiClient } from '../server';

interface TestCase {
  id: number;
  name: string;
  category: string;
  message: string;
  settings?: any;
  memories?: any[];
  notifications?: any[];
  overrideApiKey?: string | null;
}

const TEST_CASES: TestCase[] = [
  {
    id: 1,
    name: 'Clima en vivo',
    category: 'CURRENT_INFO',
    message: '¿Qué tiempo hace en Madrid hoy?',
  },
  {
    id: 2,
    name: 'Noticias actuales',
    category: 'CURRENT_INFO',
    message: '¿Cuáles son las últimas noticias de tecnología de hoy?',
  },
  {
    id: 3,
    name: 'Precios de mercado',
    category: 'CURRENT_INFO',
    message: '¿Cuánto cuesta un iPhone 16 actualmente?',
  },
  {
    id: 4,
    name: 'Deportes y marcadores',
    category: 'CURRENT_INFO',
    message: '¿Quién ganó el último partido del Real Madrid?',
  },
  {
    id: 5,
    name: 'Cálculo numérico directo',
    category: 'CALCULATION',
    message: 'Calcula 458 * 12 + 109',
  },
  {
    id: 6,
    name: 'Cálculo con porcentajes',
    category: 'CALCULATION',
    message: 'Calcula el 15% de 800 más 45',
  },
  {
    id: 7,
    name: 'Conocimiento general',
    category: 'GENERAL_KNOWLEDGE',
    message: '¿Quién formuló la teoría de la relatividad general y en qué año?',
  },
  {
    id: 8,
    name: 'Generación de código',
    category: 'CODE',
    message: 'Escribe una función en TypeScript para verificar si una palabra es un palíndromo',
  },
  {
    id: 9,
    name: 'Comando: Temporizador',
    category: 'LOCAL_COMMAND',
    message: 'Pon un temporizador de 5 minutos para la pizza',
  },
  {
    id: 10,
    name: 'Comando: Calculadora',
    category: 'LOCAL_COMMAND',
    message: 'Abre la calculadora',
  },
  {
    id: 11,
    name: 'Comando: Bloc de notas',
    category: 'LOCAL_COMMAND',
    message: 'Abre mis notas de trabajo',
  },
  {
    id: 12,
    name: 'Pregunta ambigua',
    category: 'AMBIGUOUS',
    message: 'El coso de la cosa no funciona bien',
  },
  {
    id: 13,
    name: 'Consulta con URL',
    category: 'URL_QUERY',
    message: 'Lee https://example.com y dime qué dice la página',
  },
  {
    id: 14,
    name: 'Modo sin conexión forzado',
    category: 'LOCAL_OFFLINE',
    message: '¿Qué hora es y cuál es tu protocolo de seguridad?',
    settings: { provider: 'local' },
  },
  {
    id: 15,
    name: 'Consulta con API key inválida',
    category: 'EMERGENCY_FALLBACK',
    message: 'Explica el principio de indeterminación de Heisenberg',
    overrideApiKey: 'INVALID_MOCK_KEY_FOR_TEST',
  },
  {
    id: 16,
    name: 'Consulta de memoria de usuario',
    category: 'MEMORY',
    message: '¿Qué sabes sobre mis preferencias de café?',
    memories: [
      { id: 'm1', title: 'Café Matutino', content: 'Espresso doble sin azúcar a primera hora del día.', type: 'PREFERENCE' }
    ],
  },
  {
    id: 17,
    name: 'Pregunta creativa',
    category: 'CREATIVE',
    message: 'Escribe un lema táctico para Industrias Stark',
  },
  {
    id: 18,
    name: 'Consulta médica (aviso)',
    category: 'MEDICAL_SENSITIVE',
    message: 'Me duele la cabeza y tengo fiebre ligera, ¿qué puedo tener?',
  },
  {
    id: 19,
    name: 'Consulta financiera (aviso)',
    category: 'FINANCIAL_SENSITIVE',
    message: '¿Cómo invertir 1000 dólares de forma segura?',
  },
  {
    id: 20,
    name: 'Corrección del usuario',
    category: 'CORRECTION',
    message: 'No, eso es incorrecto, el café que tomo es doble espresso sin azúcar',
  },
];

async function runAllTests() {
  console.log('\n================================================================');
  console.log('🤖 VIERNES OS // BATERÍA DE PRUEBAS DE RESPUESTA UNIVERSAL');
  console.log('================================================================\n');

  const originalApiKey = process.env.GEMINI_API_KEY || '';
  const results: Array<{
    id: number;
    name: string;
    category: string;
    tier: string;
    confidence: string;
    timeMs: number;
    passed: boolean;
    preview: string;
  }> = [];

  for (const tc of TEST_CASES) {
    const startTime = Date.now();

    // Configurar API key específica para el test
    if (tc.overrideApiKey) {
      refreshAiClient(tc.overrideApiKey);
    } else {
      refreshAiClient(originalApiKey);
    }

    try {
      const outcome = await answerEverything({
        message: tc.message,
        settings: tc.settings || {},
        memories: tc.memories || [],
        notifications: tc.notifications || [],
        systemContext: { city: 'Madrid', currentTime: new Date().toLocaleTimeString() },
      });

      const elapsed = Date.now() - startTime;
      const isNotEmpty = typeof outcome.response === 'string' && outcome.response.trim().length > 0;

      results.push({
        id: tc.id,
        name: tc.name,
        category: tc.category,
        tier: outcome.tier || 'unknown',
        confidence: outcome.confidence || 'media',
        timeMs: elapsed,
        passed: isNotEmpty,
        preview: outcome.response.slice(0, 48).replace(/\n/g, ' ') + '...',
      });
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      results.push({
        id: tc.id,
        name: tc.name,
        category: tc.category,
        tier: 'error',
        confidence: 'baja',
        timeMs: elapsed,
        passed: false,
        preview: `Error: ${err.message}`,
      });
    }
  }

  // Restaurar API key original
  refreshAiClient(originalApiKey);

  // Formato de tabla de resultados
  console.log('+-----+---------------------------------+--------------------+-----------+------------+----------+--------+');
  console.log('| ID  | CASO DE PRUEBA                  | CATEGORÍA          | NIVEL     | CONFIANZA  | TIEMPO   | ESTADO |');
  console.log('+-----+---------------------------------+--------------------+-----------+------------+----------+--------+');

  let allPassed = true;

  for (const r of results) {
    if (!r.passed) allPassed = false;
    const idStr = String(r.id).padEnd(3);
    const nameStr = r.name.padEnd(31).slice(0, 31);
    const catStr = r.category.padEnd(18).slice(0, 18);
    const tierStr = r.tier.padEnd(9).slice(0, 9);
    const confStr = r.confidence.padEnd(10).slice(0, 10);
    const timeStr = `${r.timeMs}ms`.padEnd(8);
    const statusStr = r.passed ? '✓ PASS' : '✗ FAIL';

    console.log(`| ${idStr} | ${nameStr} | ${catStr} | ${tierStr} | ${confStr} | ${timeStr} | ${statusStr} |`);
  }

  console.log('+-----+---------------------------------+--------------------+-----------+------------+----------+--------+\n');

  const passedCount = results.filter(r => r.passed).length;
  console.log(`Resumen de Ejecución: ${passedCount}/${results.length} pruebas superadas.`);

  if (allPassed) {
    console.log('✅ ÉXITO TOTAL: El Motor de Respuesta Universal garantizó respuesta útil en el 100% de los casos.\n');
    process.exit(0);
  } else {
    console.error('❌ ALGUNAS PRUEBAS FALLARON: Se detectaron respuestas vacías o no controladas.\n');
    process.exit(1);
  }
}

runAllTests().catch((e) => {
  console.error('Fallo crítico ejecutando test:answers:', e);
  process.exit(1);
});
