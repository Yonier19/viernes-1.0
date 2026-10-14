# Viernes (F.R.I.D.A.Y.) - Asistente IA Táctico

Asistente personal inteligente con interfaz holográfica, reconocimiento de voz continuo por palabra de activación (*Wake Word*), síntesis de voz, gestión de memoria semántica y automatización, inspirado en el sistema F.R.I.D.A.Y. / Industrias Stark.

---

## 🚀 Requisitos Previos

Para correr este programa en tu computadora necesitas:

1. **Node.js** (versión 18 o superior, recomendada versión 20 LTS o 22 LTS).
   - Descárgalo gratis desde [https://nodejs.org/](https://nodejs.org/) (incluye `npm`).
2. **Navegador web moderno**: Google Chrome, Microsoft Edge o Brave (recomendados por su compatibilidad completa con la Web Speech API para reconocimiento de voz por micrófono).

---

## 💻 Instalación y Puesta en Marcha en tu PC

### Paso 1: Descargar o clonar el proyecto
Si descargaste el archivo ZIP, descomprímelo en una carpeta de tu preferencia (por ejemplo en tu Escritorio o Documentos).

Si usas Git en tu terminal:
```bash
git clone <URL_DE_TU_REPOSITORIO>
cd viernes
```

### Paso 2: Instalar las dependencias
Abre una terminal (PowerShell / CMD en Windows, o Terminal en Mac / Linux) dentro de la carpeta del proyecto y ejecuta:

```bash
npm install
```

### Paso 3: Configurar variables de entorno (Opcional para IA Gemini)
Crea una copia del archivo `.env.example` y nómbrala `.env`:

```bash
cp .env.example .env
```

Abre el archivo `.env` con cualquier editor de texto y coloca tu clave de API de Google Gemini (puedes obtener una gratis en [Google AI Studio](https://aistudio.google.com/)):

```env
GEMINI_API_KEY="AIzaSy..."
```

> **Nota:** Si no configuras una API Key, el programa seguirá funcionando completamente en **Modo Local / Subsistema Offline**, con reconocimiento de voz, automatizaciones, widgets y banco de memoria.

### Paso 4: Iniciar la aplicación
Ejecuta el comando:

```bash
npm run dev
```

Verás un mensaje similar a:
```
[Viernes System] Core online on http://0.0.0.0:3000
```

### Paso 5: Abrir en tu navegador
Abre tu navegador (Google Chrome o Edge) y entra a:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🎙️ Cómo Usar a Viernes

1. **Permiso de micrófono**: Cuando abras la página, el navegador te pedirá permiso para usar el micrófono. Haz clic en **Permitir**.
2. **Activar por voz (Wake Word)**:
   - Di en voz alta: **"Oye Viernes"**, **"Viernes"** o **"Hola Viernes"**.
   - Viernes emitirá un sonido de activación holográfica y el orbe cambiará a color rojo pulsante (*Escuchando*).
3. **Comandos de ejemplo que puedes probar**:
   - *"Abre YouTube y busca música lofi"*
   - *"Pon un temporizador de 5 minutos"*
   - *"Recuerda que mi cumpleaños es el 15 de marzo"*
   - *"Abre Spotify"*
   - *"¿Qué sabes sobre mí?"*
   - *"Calcula 250 por 18"*
   - *"Activa el modo trabajo"*
4. **Control táctil o por teclado**:
   - También puedes pulsar directamente el orbe central para iniciar la escucha, o escribir cualquier comando en la barra inferior.

---

## 📁 Estructura del Proyecto

- `server.ts`: Servidor Node.js + Express que conecta con el SDK `@google/genai` y sirve la aplicación web.
- `src/components/ViernesOrb.tsx`: Orbe holográfico interactivo renderizado en Canvas con anillos orbitales y modulación por voz.
- `src/components/MainScreen.tsx`: Pantalla principal del asistente, chat y orbe.
- `src/components/MemoryScreen.tsx`: Gestor de memoria semántica, preferencias, hábitos y contactos.
- `src/components/AutomationScreen.tsx`: Lanzador de aplicaciones vinculadas y rutinas multi-paso.
- `src/components/PermissionsScreen.tsx`: Panel de seguridad y Secure KeyStore.
- `src/components/SettingsScreen.tsx`: Ajustes de voz, velocidad, tono, wake-word y temas cromáticos.
- `src/services/audioService.ts`: Síntesis de voz (TTS) y sintetizador de efectos sonoros Stark.
- `src/services/memoryStorage.ts`: Persistencia local de datos y rutinas.
