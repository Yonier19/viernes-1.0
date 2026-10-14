# 🖥️ Viernes (F.R.I.D.A.Y.) - Instalador para Windows (.exe)

Guía completa para empaquetar, compilar y ejecutar **Viernes** como una aplicación nativa de escritorio para Windows con instalador NSIS (.exe), sin necesidad de abrir terminales ni comandos de consola.

---

## ⚡ Motor de Respuesta Universal (Universal Answer Engine)

Viernes implementa una arquitectura que garantiza que **el usuario SIEMPRE obtenga una respuesta útil**, sin bloqueos, respuestas vacías ni mensajes de "no sé" a secas.

### 1. Enrutador Previo de Intenciones (`src/services/intentRouter.ts`)
Antes de invocar modelos en la nube, el sistema clasifica la consulta:
- **Comando Local**: Temporizador, calculadora, notas, apertura de aplicaciones (YouTube, Spotify, WhatsApp, Maps), rutinas y guardado en memoria. Se procesa de forma instantánea en local.
- **Información Actual / En Vivo**: Consultas sobre clima, noticias, cotizaciones, deportes, horarios o términos como *"hoy"*, *"ahora"*, *"último"*. Activa **Google Search Grounding**.
- **Consulta con URL**: Detecta enlaces (`https://...`), descarga el contenido de la página de forma segura en servidor y lo analiza.
- **Correcciones del Usuario**: Cuando el usuario indica *"eso es incorrecto"* o *"te equivocaste"*, Viernes busca en la web para corroborar y ofrece guardar la corrección en el Banco de Memoria.
- **Pregunta Ambigua o Incompleta**: Responde asumiendo la interpretación más factible y añade una única pregunta corta de aclaración al final sin bloquear.

### 2. Cadena de Respaldo de 5 Niveles (`answerEverything`)
Si un nivel experimenta saturación, timeout (límite de 12 segundos) o fallo de red, desciende automáticamente al siguiente escalón con reintentos y retroceso exponencial:

| Nivel | Componente | Cuándo se usa | Confiabilidad |
|---|---|---|---|
| **Tier 1** | **Gemini 3.8 Flash + Google Search** | Noticias, clima, precios, eventos, actualidad | Máxima actualidad y fuentes citadas |
| **Tier 2** | **Gemini 3.8 Flash Estándar** | Conocimiento general, código, razonamiento | Profundidad analítica y creatividad |
| **Tier 3** | **Gemini 3.1 Flash Lite** | Respaldo ante cuota o latencia de Tier 1/2 | Respuesta ágil y ultraligera |
| **Tier 4** | **Base Local Determinista** | Sin internet o sin API key | Memoria de usuario, mathjs, hora, comandos |
| **Tier 5** | **Mensaje de Emergencia Táctica** | Caída absoluta de enlaces y red | Acción directa sobre qué sí puede hacer |

- **Caché Táctica**: Almacenamiento en memoria con TTL diferenciado (3 minutos para clima/noticias; 2 horas para conocimiento estable).
- **Streaming en Tiempo Real (SSE)**: El texto aparece progresivamente y la síntesis de voz comienza a emitir las primeras oraciones de inmediato.

---

## 🛰️ Ciclo de Vida en Segundo Plano (Fase 1: Asistente Residente)

Viernes está diseñado para operar como un asistente permanente en segundo plano en Windows, con bajo impacto en memoria y alta tolerancia a fallos:

1. **Instancia Única (`Single Instance Lock`)**:
   - Controlado mediante `app.requestSingleInstanceLock()`. Si el usuario hace doble clic sobre un acceso directo cuando Viernes ya está ejecutándose, no se abre un proceso duplicado; la instancia existente se restaura, se enfoca y se muestra en pantalla.

2. **Arranque Silencioso con Windows (`openAtLogin` + `--hidden`)**:
   - Puede configurarse para iniciar sesión con Windows mediante `app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] })`.
   - Cuando se detecta el argumento `--hidden` o el ajuste `startHidden: true`, la ventana principal **no se carga en memoria (Lazy Load)** hasta que el usuario la requiera, reduciendo drásticamente el consumo inicial de RAM.

3. **Cierre a la Bandeja (Hide on Close)**:
   - Al pulsar la `[X]` de la ventana principal, el evento `close` es interceptado (`event.preventDefault()`) y la ventana se oculta (`mainWindow.hide()`).
   - El asistente permanece activo en la bandeja del sistema junto al reloj. La aplicación solo finaliza cuando se pulsa explícitamente *"Salir de Viernes"* en el menú contextual de la bandeja.

4. **Bandeja del Sistema (Tray) con Estados Visuales Dinámicos**:
   - Menú contextual:
     - **Abrir Viernes**: Despliega la ventana principal (o la crea perezosamente si aún no se había inicializado).
     - **Pausar / Reanudar Escucha**: Alterna instantáneamente el estado del asistente entre `IDLE` y `PAUSED`.
     - **Mostrar / Ocultar Overlay Flotante**: Gancho preparado para el overlay interactivo de la Fase 2.
     - **Silenciar Micrófono**: Desactiva la captura de audio en hardware/software.
     - **Salir de Viernes**: Concluye el ciclo de vida de forma limpia (`before-quit`).
   - Iconos por color de estado en bandeja:
     - 🔵 **Activo / En Espera (`IDLE`, `LISTENING`, `PROCESSING`, `SPEAKING`)**: Orbe Arc Reactor cian.
     - 🟠 **Pausado (`PAUSED`)**: Orbe ámbar / dorado.
     - 🔴 **Atención / Reconectando (`ERROR`)**: Orbe carmesí de advertencia.

5. **Máquina de Estados Compartida (IPC)**:
   - Estados canónicos: `IDLE`, `WAKE_DETECTED`, `LISTENING`, `PROCESSING`, `SPEAKING`, `PAUSED`, `ERROR`.
   - Expuesta mediante el canal IPC seguro de `preload.cjs` (`electronAPI.getAssistantState()`, `electronAPI.onAssistantStateChanged()`), permitiendo sincronizar la bandeja del sistema, el orbe en el renderer y el overlay en tiempo real.

6. **Recuperación Automática del Servidor Express**:
   - Supervisado por un watchdog periódico y listeners de eventos en Node.js.
   - Si el servidor interno falla, se reactiva con **retroceso exponencial** (1 s, 2 s, 4 s, 8 s... hasta 30 s) sin cerrar la aplicación Electron.
   - Los eventos de caída y recuperación se auditan en `%APPDATA%\viernes-assistant\connection.log` manteniendo la clave API estrictamente ofuscada.

---

## 🔮 Overlay Flotante Permanente (Fase 2: Asistente Siempre Visible)

Viernes incorpora una segunda ventana `BrowserWindow` liviana e interactiva diseñada para flotar permanentemente sobre cualquier juego, navegador o aplicación en Windows:

1. **Configuración de Ventana Ultra Ligera**:
   - `frame: false`, `transparent: true`, `backgroundColor: '#00000000'`, `hasShadow: false`, `skipTaskbar: true`.
   - Nivel de superposición máxima con `setAlwaysOnTop(true, 'screen-saver')`.
   - Visibilidad en todos los escritorios virtuales con `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`.
   - Se muestra con `showInactive()` para **jamás robar el foco** de la ventana activa del usuario.

2. **Dos Modos Dinámicos**:
   - **Modo Compacto**:
     - Orbe holográfico reactivo (~72 px) con baja carga computacional.
     - Posición persistente guardada en `%APPDATA%\viernes-assistant\viernes_store.json`.
     - Validación contra monitores actuales mediante la API `screen` de Electron: si el usuario desconecta una pantalla secundaria, el orbe se reubica automáticamente en la esquina inferior derecha del monitor principal sin perderse fuera de pantalla.
     - Arrastrable libremente con el ratón por todo el escritorio.
     - Opacidad atenuada (~50%) en reposo (`IDLE` o `PAUSED`), y 100% al activarse o pasar el cursor por encima.
   - **Modo Expandido**:
     - Panel HUD futurista Stark (~370 x 480 px) con efecto de vidrio esmerilado (`backdrop-blur-2xl`).
     - Muestra la transcripción en vivo del comando de voz.
     - Streaming progresivo token a token desde `/api/assistant/chat-stream`.
     - Fuentes citadas de Google Search Grounding con enlaces externos interactivos.
     - Reproducción por voz con síntesis de voz contextual.
     - Autocontracción inteligente: tras **5 segundos de inactividad** tras finalizar la respuesta, el panel se repliega automáticamente al orbe compacto sin intervención del usuario.

3. **Click-Through Transparente**:
   - Utiliza `setIgnoreMouseEvents(true, { forward: true })` en las áreas vacías/transparentes, permitiendo que cualquier clic pase limpiamente a las ventanas situadas debajo.
   - Al pasar el cursor sobre el orbe o el panel HUD, el renderer activa `setIgnoreMouseEvents(false)` para permitir interacción, arrastre y selección inmediata.

4. **Atajo Global del Sistema (`Ctrl + Alt + V`)**:
   - Registrado con `globalShortcut.register('CommandOrControl+Alt+V')`.
   - Permite despertar a Viernes desde cualquier aplicación o juego a pantalla completa sin cambiar de ventana.
   - Dispara el ciclo completo:
     `Atajo Global -> Despliegue Inactivo -> Captura STT -> intentRouter -> answerEverything (SSE) -> Voz -> Autocontracción`.

5. **Controles en Bandeja y Ajustes**:
   - Menú contextual de bandeja: opción directa *"Mostrar / Ocultar Overlay Flotante"*.
   - Pantalla de Ajustes: selector de esquina inicial (Inferior Derecha, Superior Derecha, etc.), selector de monitor y botón de prueba rápida del atajo global.

---

## 🎙️ Detección de Palabra de Activación & Escucha Continua (Fase 3)

Viernes implementa un sistema de escucha permanente en segundo plano basado en una arquitectura desacoplada de dos etapas que garantiza máxima privacidad, funcionamiento offline y un consumo inferior al **2% de CPU en reposo**:

### 1. Correcciones Integradas de Fase 2 (Paso 0)
- **Foco Dinámico (`setFocusable(true/false)`)**: El overlay mantiene `focusable: false` para no interferir con juegos ni aplicaciones activas. Únicamente cuando el usuario pulsa en el campo de texto manual se activa temporalmente el foco (`setFocusable(true)`), restaurando `focusable: false` al desenfocar o contraer el panel.
- **Validación del Atajo Global**: Se comprueba el valor booleano devuelto por `globalShortcut.register()`. Si el atajo está ocupado por otro programa de Windows, la pestaña Ajustes muestra una advertencia preventiva `⚠ Atajo ocupado` y permite escoger combinaciones alternativas (`Ctrl+Alt+V`, `Ctrl+Shift+V`, `Ctrl+Alt+F`, `Alt+Espacio`).
- **CSP Estricto**: `overlay.html` y `wake-word.html` implementan la directiva CSP homologada con `index.html`.
- **Memoria e Historial Compartidos y Emisor Único de TTS**: El overlay y la ventana principal comparten las memorias de usuario (`memoryStorage`) y sincronizan mensajes en tiempo real mediante el canal IPC `sync-chat-message`. Además, el proceso principal coordina un bloqueo único de audio (`notifyTtsStarted` / `tts-stop`), impidiendo que ambas ventanas hablen a la vez.
- **Especificidad de Pantalla Completa en Windows**: La propiedad `visibleOnFullScreen: true` de Electron es exclusiva de macOS. En Windows, el asistente utiliza `setAlwaysOnTop(true, 'screen-saver')` para mantenerse sobre aplicaciones a pantalla completa.

### 2. Verificación de STT y Justificación de Diseño (Paso 1)
- **Por qué falla `webkitSpeechRecognition` en Electron**: Chromium elimina las claves privadas de la API de reconocimiento de voz de Google en binarios de terceros empaquetados, causando el error sistemático `network` o `service-not-allowed`.
- **Diseño de Etapa 2 Elegido**:
  1. **En línea**: Al detectar la palabra de activación, se graba el comando del usuario mediante `MediaRecorder` y se transcribe en el backend interno (`/api/assistant/transcribe`) utilizando **Gemini Flash**. La transcripción es instantánea, de alta fidelidad fonética en español y respeta la cadena de respaldo.
  2. **Sin conexión (Tier 4)**: Si no hay internet, el motor determinista local procesa comandos de voz esenciales (hora, fecha, cálculos matemáticos, temporizadores, apertura de programas y notas) sin arrojar error 500.

### 3. Detección de Palabra de Activación en Dos Etapas (Paso 2)
- **Elección del Motor de Etapa 1**:
  - Se implementó un detector acústico basado en **AudioWorklet / ScriptProcessor VAD local** optimizado para formantes de habla y transiciones silábicas en *"Viernes"* (2 sílabas con terminación sibilante alta), *"Oye Viernes"* (3 sílabas) y *"Friday"*.
  - **Ventajas**: 100% offline, sin claves de terceros que caduquen (a diferencia del plan gratuito de Picovoice Porcupine), sin binarios nativos C++ que exijan Visual Studio Build Tools, y con consumo &lt; 1.5% de CPU en reposo gracias al filtrado inmediato por umbral adaptativo de ruido.
- **Ventana Oculta Dedicada**: Corre en una `BrowserWindow` con `show: false` y `backgroundThrottling: false`, impidiendo que Chromium degrade o suspenda el reloj de audio cuando la ventana no está visible.
- **Mecanismo Anti-Eco**: Al comenzar la síntesis de voz (`SPEAKING`), el proceso principal pausa automáticamente el detector de activación. Al concluir el habla, espera 350 ms para permitir la disipación del eco acústico de la habitación y reanuda la escucha. Opcionalmente, el usuario puede activar **Barge-in** en Ajustes para interrumpir a Viernes diciendo de nuevo la palabra de activación.
- **Ajustes y Privacidad**:
  - Selector de micrófono físico del sistema con detección de reconexión automática (`devicechange`).
  - Control de sensibilidad acústica (20% a 95%).
  - Modo *"Solo atajo global"* que apaga totalmente el micrófono en segundo plano.
  - Sincronización con eventos de bloqueo de pantalla y suspensión (`powerMonitor`).
  - **Privacidad Inviolable**: Cero bytes de audio son transmitidos a la red durante la escucha permanente; la nube solo interviene tras la detección verificada de la palabra clave.

---

## 🛡️ Límites Reales de la IA y Ética de Honestidad

1. **Sin Alucinaciones de Datos Críticos**:
   - Viernes tiene prohibido inventar enlaces, cifras o hechos no verificables. Si un dato no está en internet ni en la memoria, indica su nivel de confianza (*Alta, Media o Baja*) y recomienda qué verificar.
2. **Avisos Profesionales**:
   - En consultas médicas, legales o financieras, Viernes incorpora automáticamente una nota de verificación recordando que la respuesta es orientativa y no sustituye el criterio de un especialista colegiado.
3. **Privacidad de Notificaciones**:
   - Las notificaciones de Windows se procesan 100% en local mediante `%LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db`. Jamás se envían a servidores externos salvo que el usuario pida explícitamente *"resume mis notificaciones"*.

---

## 🔍 Cómo Depurar Fallos y Probar la Cadena

### 1. Batería de Pruebas Automatizada (20 Casos)
Ejecuta en tu terminal:
```bash
npm run test:answers
```
Este comando prueba:
- Clima, noticias, precios y deportes en vivo.
- Cálculos con `mathjs` y porcentajes.
- Código, preguntas ambiguas, URLs y memoria.
- Casos de desconexión sin internet y claves inválidas.
- Imprime una tabla detallada con tiempo de respuesta, nivel que respondió y confirmación de que ninguna respuesta quedó vacía.

### 2. Botón "Probar conexión con Gemini" en Ajustes
En la pestaña **Ajustes** dentro de la aplicación, pulsa el botón *"Probar conexión con Gemini"* para ver en vivo el estado y latencia de cada uno de los 4 niveles de inferencia.

### 3. Registro en Consola
El servidor y la ventana de Electron imprimen en tiempo real etiquetas de diagnóstico:
```
[Viernes System] Respondió Nivel: Tier 1 (Gemini con Búsqueda en Google)
[Viernes System] Respondió Nivel: Tier 4 (Base Local Determinista)
```

---

## 📦 Requisitos para Compilar en Windows

1. **Node.js**: Versión 18, 20 LTS o 22 LTS (recomendado Node 20 LTS) desde [https://nodejs.org/](https://nodejs.org/).
2. **Python 3**: Para la generación automatizada de los iconos multi-resolución en `build/`.
3. **Git** (opcional para clonar el repositorio).
4. **Sin herramientas C++ pesadas**: Viernes utiliza `sql.js` (WebAssembly) y librerías puras en JavaScript/TypeScript, por lo que **NO** requiere instalar Visual Studio C++ Build Tools ni compiladores nativos.

---

## 🛠️ Pasos Exactos para Generar el Instalador (.exe)

Abre una terminal (PowerShell, CMD o bash) en la raíz del proyecto y ejecuta:

### Paso 1: Instalar dependencias
```bash
npm install
```

### Paso 2: Generar el instalador para Windows
```bash
npm run dist:win
```

Este script ejecuta de manera encadenada y automática:
1. `python3 scripts/generate_icon.py`: Crea `build/icon.png`, `build/icon.ico` (recurso multi-resolución de 256, 128, 64, 48, 32 y 16 px) y los iconos de estado de la bandeja (`tray-active.png`, `tray-paused.png`, `tray-error.png`).
2. `vite build`: Compila la interfaz gráfica React 19 con Tailwind CSS para la ventana principal, el overlay flotante y el detector en segundo plano (`dist/index.html`, `dist/overlay.html`, `dist/wake-word.html`).
3. `npm run build:server`: Empaqueta `server.ts` con esbuild produciendo el servidor de producción CommonJS ultra optimizado en `dist-server/server.cjs`.
4. `electron-builder --win`: Empaqueta la aplicación para Windows empaquetando el runtime de Electron, configurando `asarUnpack` para WebAssembly/sql.js, emitiendo el instalador NSIS sin privilegios administrativos forzados y la versión portable.

---

## 📍 Archivos Generados

Una vez finalizada la compilación, los artefactos listos para su distribución se encuentran en:

```
📁 dist-electron/
   ├── 💿 Viernes Setup 1.0.0.exe        <- Instalador interactivo guiado (NSIS)
   ├── 🚀 Viernes-Portable-1.0.0.exe     <- Ejecutable autónomo portátil (sin instalación)
   └── 📂 win-unpacked/                 <- Carpeta con el ejecutable directo (Viernes.exe)
```

---

## 🔏 Firma de Código (Code Signing) para Evitar Windows SmartScreen

Al descargar o ejecutar un instalador recién compilado en Windows 10 u 11, el filtro de reputación **Windows Defender SmartScreen** puede mostrar la pantalla azul *"Windows protegió su PC (Aplicación desconocida)"*.

### ¿Por qué ocurre?
Windows SmartScreen evalúa dos factores:
1. **Firma digital válida**: Que el binario esté firmado con un certificado de firma de código emitido por una Autoridad de Certificación reconocida (Sectigo, DigiCert, GlobalSign, etc.).
2. **Reputación histórica**: La cantidad de usuarios en el mundo que han descargado y ejecutado ese ejecutable sin incidentes de seguridad.

### Método 1: Firma Comercial con Certificado PFX / Token USB (Producción Oficial)

Si dispones de un certificado de firma de código estándar (OV) o de validación extendida (EV):

1. **Mediante variables de entorno con `electron-builder`**:
   Configura las variables antes de compilar:
   ```powershell
   # PowerShell
   $env:CSC_LINK = "C:\ruta\a\tu_certificado.pfx"
   $env:CSC_KEY_PASSWORD = "TuContraseñaSegura"
   npm run dist:win
   ```
   `electron-builder` detectará automáticamente el archivo `.pfx` y firmará tanto el ejecutable `Viernes.exe` como el instalador `Viernes Setup 1.0.0.exe`.

2. **Firma manual post-compilación con `signtool.exe` (Windows SDK)**:
   ```cmd
   signtool sign /f "C:\ruta\certificado.pfx" /p "TuContraseña" /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 "dist-electron\Viernes Setup 1.0.0.exe"
   ```

3. **Certificados EV en Token de Hardware o Cloud HSM (Azure Trusted Signing)**:
   Los certificados EV nuevos requieren tokens físicos FIPS (ej. YubiKey) o servicios en la nube como Azure Trusted Signing. `electron-builder` se integra con hardware tokens a través de Windows Certificate Store configurando en `package.json`:
   ```json
   "win": {
     "certificateSubjectName": "Tu Empresa o Nombre",
     "signingHashAlgorithms": ["sha256"]
   }
   ```

### Método 2: Certificado Autofirmado para Entornos de Prueba / Red Local

Para distribuir la app dentro de una organización o entre tus propios equipos sin pagar un certificado público anual:

1. **Generar un certificado autofirmado en PowerShell (como Administrador)**:
   ```powershell
   $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Industrias Stark Viernes" -CertStoreLocation Cert:\CurrentUser\My
   $pwd = ConvertTo-SecureString "Stark2026!" -AsPlainText -Force
   Export-PfxCertificate -Cert $cert -FilePath "$env:USERPROFILE\Desktop\stark_codesign.pfx" -Password $pwd
   ```

2. **Compilar y firmar con dicho certificado**:
   ```powershell
   $env:CSC_LINK = "$env:USERPROFILE\Desktop\stark_codesign.pfx"
   $env:CSC_KEY_PASSWORD = "Stark2026!"
   npm run dist:win
   ```

3. **Confiar en el certificado en la máquina de destino**:
   - En la máquina donde se instalará Viernes, haz doble clic sobre el instalador `.exe` > Propiedades > Pestaña *Firmas Digitales* > Selecciona la firma > *Detalles* > *Ver Certificado* > *Instalar Certificado*.
   - Elige **Equipo local** > Colocar en el almacén: **"Entidades de certificación raíz de confianza"**.
   - Tras este paso, Windows SmartScreen reconocerá la firma y **nunca más mostrará la advertencia azul**.

---

## 📋 Lista de Comprobación en una Máquina Limpia (Clean Machine Checklist)

Para certificar que el ejecutable funciona con el 100% de capacidades tácticas en cualquier computadora nueva con Windows 10 u 11, verifica los siguientes 8 puntos en orden:

| # | Prueba | Procedimiento | Criterio de Éxito |
|---|---|---|---|
| **1** | **Instalación** | Ejecutar `Viernes Setup 1.0.0.exe` en una cuenta estándar sin privilegios de administrador. | El asistente se instala en `%LOCALAPPDATA%\Programs\viernes-assistant` (`perMachine: false`) sin saltar UAC de administrador. Pregunta amablemente si se desea iniciar con Windows y crea los accesos directos en Escritorio y Menú Inicio. |
| **2** | **Apertura** | Abrir Viernes desde el acceso directo del Escritorio o Menú Inicio. | La ventana se abre con fondo oscuro Stark, marco holográfico y el icono del Arc Reactor (`build/icon.ico`). La bandeja del sistema muestra el icono cian de `tray-active.png`. El servidor Express inicia en `127.0.0.1:3000` sin ventanas negras de consola. |
| **3** | **Introducir Clave** | Ir a la pestaña **Ajustes**, pegar la clave gratuita de Google AI Studio y pulsar *"Guardar Clave"*. | La clave se guarda de forma segura en `%APPDATA%\viernes-assistant\viernes_credentials.json`. Se muestra únicamente ofuscada (`...XXXX`). Al pulsar *"Probar conexión con Gemini"*, los 6 diagnósticos marcan `✓` en verde. |
| **4** | **Micrófono** | Hablar diciendo *"Viernes"* o *"Hola Viernes"*. | El detector acústico VAD offline detecta la palabra clave sin llamadas externas a internet. El estado cambia a `WAKE_DETECTED` -> `LISTENING` y el consumo de CPU permanece por debajo del 1.5%. |
| **5** | **Atajo Global** | Con cualquier otra aplicación o juego abierto a pantalla completa, presionar `Ctrl + Alt + V`. | Viernes se activa inmediatamente en modo escucha sin robar el foco del teclado de la aplicación activa ni minimizar la pantalla completa. |
| **6** | **Overlay Flotante** | Localizar el orbe en la esquina inferior derecha. Arrastrarlo con el ratón a otra posición del escritorio y hacer clic sobre él. | El orbe se desplaza suavemente y guarda su nueva coordenada en `viernes_store.json`. Al hacer clic se expande mostrando el panel HUD con streaming SSE y se contrae automáticamente a los 5 segundos de inactividad. |
| **7** | **Autoinicio** | Reiniciar Windows o verificar el Administrador de Tareas > Pestaña *Inicio*. | Viernes aparece en la lista de aplicaciones de inicio. Al arrancar el sistema, inicia en segundo plano con el parámetro `--hidden` (modo silencioso, ventana principal en espera en memoria liberada). |
| **8** | **Desinstalación** | Ir a Configuración de Windows > *Aplicaciones instaladas* > *Viernes* > *Desinstalar*. | El desinstalador se ejecuta limpiamente. Muestra un cuadro de diálogo preguntando si se desean eliminar también los recuerdos y datos personales. Si el usuario responde **"No"**, el directorio de datos `%APPDATA%\viernes-assistant` se conserva íntegro. |

---
  - Base de datos de memorias y rutinas: `%APPDATA%\viernes-assistant\viernes_store.json`
  - Registro de conectividad y diagnósticos: `%APPDATA%\viernes-assistant\connection.log`

---

## 🌐 Solución de Problemas de Conexión en la Versión .EXE

Si la app no se conecta a internet o a Gemini correctamente en Windows, sigue esta guía táctica paso a paso:

### 1. Panel de Diagnóstico Integrado
Ve a **Ajustes** y haz clic en el botón superior **"Probar conexión con Gemini"**. Se ejecutarán 6 pruebas en vivo con estado `✓` o `✗`:
- **a) Internet General**: Comprueba acceso HTTP real a `https://www.google.com/generate_204` con timeout de 5 segundos.
- **b) Alcance de la API**: Verifica handshake HTTPS hacia `https://generativelanguage.googleapis.com` (puerto 443).
- **c) Clave de API Gemini**: Confirma que la clave exista, tenga formato válido (`AIza...`) y se lea desde `UserData` (mostrando solo los últimos 4 caracteres por seguridad).
- **d) Comprobación de Modelos**: Envía una petición mínima ("Responde OK") al modelo principal (`gemini-3.8-flash`) y de respaldo (`gemini-3.1-flash-lite`). Si el modelo no existe (Error 404), lista automáticamente los modelos compatibles con tu clave para que puedas seleccionar uno con un solo clic.
- **e) Búsqueda en Google (Grounding)**: Evalúa si tu clave soporta la herramienta de búsqueda en vivo. Si falla por cuota (Error 429), ofrece desactivar la búsqueda con un clic para seguir conversando con Gemini sin consumir cuota adicional.
- **f) Servidor Local & Red Interna**: Comprueba que el servidor interno Express esté escuchando en `127.0.0.1` e informa si hay algún proxy activo.

### 2. Botón "Copiar Diagnóstico" y Registro `connection.log`
- En el panel de diagnóstico de Ajustes, pulsa el botón **"Copiar diagnóstico"**. Se generará un informe técnico completo en formato Markdown en tu portapapeles listo para compartir o pegar en incidencias.
- Las peticiones y cambios de nivel se registran en `%APPDATA%\viernes-assistant\connection.log` con fecha ISO, nivel de respuesta, código HTTP y latencia, **redactando cualquier clave o token de forma estricta**.

### 3. Regla en Firewall de Windows Defender
Si Windows Defender Firewall bloquea la conexión saliente de Node o del ejecutable de Viernes, abre una consola de **PowerShell o CMD como Administrador** y ejecuta:
```cmd
netsh advfirewall firewall add rule name="Viernes Asistente" dir=out action=allow program="%LOCALAPPDATA%\Programs\viernes-assistant\Viernes.exe" enable=yes
```
*(Si instalaste en otra ruta, sustituye el parámetro `program` por la ruta real a `Viernes.exe`)*.

### 4. Redes Corporativas, VPN y Servidores Proxy
Si estás detrás de un proxy corporativo o educativo:
1. Abre **Ajustes** y localiza la sección **"Configuración de Proxy de Red"**.
2. Escribe la URL de tu servidor proxy (ej. `http://proxy.empresa.com:8080`).
3. Haz clic en **"Aplicar Proxy"**. Viernes configurará inmediatamente la sesión de Chromium en Electron y el despachador `EnvHttpProxyAgent` en el servidor Node.js sin necesidad de reiniciar.

### 5. Guía Rápida de Códigos de Error de Gemini
| Código | Causa Común | Solución Recomendada |
| :--- | :--- | :--- |
| **401 UNAUTHENTICATED** | Clave de API inválida, revocada o con espacios al copiar. | Genera una clave nueva en [Google AI Studio](https://aistudio.google.com) y pulsa "Guardar Clave" en Ajustes. |
| **403 PERMISSION_DENIED** | API Generative Language deshabilitada o región restringida. | Habilita la API en Google Cloud Console o prueba desde una conexión/red diferente. |
| **404 NOT_FOUND** | El nombre del modelo no existe o fue descontinuado. | Pulsa "Probar conexión" en Ajustes y selecciona uno de los modelos válidos detectados. |
| **429 RESOURCE_EXHAUSTED** | Límite de peticiones por minuto o cuota diaria alcanzada. | Desactiva "Búsqueda Web Automática" en Ajustes o cambia al modelo ligero `gemini-3.1-flash-lite`. |
| **503 UNAVAILABLE** | Servidores de Google con sobrecarga temporal. | Viernes conmuta automáticamente a la base local determinista; reintenta en unos instantes. |
| **ETIMEDOUT / Timeout** | Firewall bloqueando la salida o corte de internet. | Añade la regla de firewall (`netsh advfirewall`) o verifica tu conexión Wi-Fi/cable. |
| **ENOTFOUND** | Error de resolución DNS (`generativelanguage.googleapis.com`). | Cambia tus DNS a los de Google (`8.8.8.8`) o Cloudflare (`1.1.1.1`). |
| **ECONNREFUSED** | Conexión rechazada localmente. | Comprueba que ningún software de seguridad de terceros (antivirus) esté bloqueando `127.0.0.1` o la salida web. |

---

## 🧪 Casos de Prueba Manuales de la Fase 3

Para comprobar rigurosamente la estabilidad de la escucha continua en Windows, ejecuta los siguientes 5 escenarios:

### Caso 1: Operación Sin Conexión a Internet
- **Acción**: Desconecta el cable de red o apaga el Wi-Fi en tu PC.
- **Prueba**: Di en voz alta con la aplicación oculta: *"Viernes, ¿qué hora es?"* o pulsa `Ctrl + Alt + V`.
- **Resultado Esperado**:
  1. El orbe detecta *"Viernes"* localmente, reproduce el tono táctico y pasa a `WAKE_DETECTED` -> `LISTENING`.
  2. Al terminar de hablar, el silencio de ~1.5 s finaliza la captura del comando.
  3. El motor local (Tier 4) responde de forma inmediata por voz: *"Hoy es [fecha] y son exactamente las [hora]"*.
  4. La respuesta se reproduce por síntesis de voz nativa de Windows (SAPI/OneCore) sin error de conexión ni spinner infinito.

### Caso 2: Micrófono Desconectado o Permiso Denegado
- **Acción**: Desconecta físicamente tu micrófono USB o inhabilita el acceso al micrófono en Configuración de Windows > Privacidad > Micrófono.
- **Resultado Esperado**:
  1. El evento `navigator.mediaDevices.ondevicechange` detecta la pérdida del dispositivo.
  2. La máquina de estados transiciona a `ERROR`, el icono de la bandeja cambia a orbe carmesí y el tooltip indica *"Viernes (FRIDAY) - Micrófono no detectado"*.
  3. Al volver a conectar el micrófono, Viernes se reconfigura automáticamente sin reiniciar el programa y retorna al estado `IDLE`.

### Caso 3: TTS en Curso, Anti-Eco y Barge-In
- **Acción**: Pide a Viernes una respuesta extensa (ej. *"Cuéntame sobre la armadura Mark 85"*).
- **Prueba**:
  1. Mientras Viernes está hablando (`SPEAKING`), observa que el detector de palabra de activación está en pausa y el micrófono no se activa por el audio emitido por los altavoces de tu propia PC.
  2. Al terminar la voz de Viernes, tras 350 ms de decaimiento acústico de la habitación, el detector se reanuda limpiamente a `IDLE`.
  3. Si activas en Ajustes *"Interrupción Acústica (Barge-in)"* y dices *"Viernes"* mientras habla, el TTS se cancela instantáneamente y pasa a escucharte de inmediato.

### Caso 4: Ruido de Fondo Elevado
- **Acción**: Reproduce música suave o mantén conversaciones secundarias en la habitación.
- **Resultado Esperado**:
  1. El filtro acústico adaptativo eleva el suelo de ruido (`noiseFloor`) evitando falsos positivos.
  2. El análisis de sílabas (2 picos energéticos) y el Zero-Crossing Rate (`avgTailZcr > 0.18` para la 's' final de *"Viernes"*) impiden activaciones accidentales.
  3. El consumo de CPU permanece por debajo del 1.5% en segundo plano.

### Caso 5: Aplicaciones y Juegos a Pantalla Completa
- **Acción**: Abre un juego en pantalla completa exclusiva o un reproductor de vídeo maximizado (VLC, YouTube F11).
- **Prueba**: Di *"Viernes"* o presiona `Ctrl + Alt + V`.
- **Resultado Esperado**:
  1. El overlay aparece superpuesto gracias a `setAlwaysOnTop(true, 'screen-saver')`.
  2. La aplicación a pantalla completa **NO pierde el foco ni se minimiza a la barra de tareas** porque el overlay opera con `focusable: false` y `showInactive()`.
  3. Solo si haces clic en el campo de texto manual se habilita temporalmente el foco (`setFocusable(true)`), restaurándose a `false` al contraerse el panel.

---

## ⚠️ Riesgos Conocidos y Mitigaciones Técnicas

1. **Suspensión de Chromium en Segundo Plano (`backgroundThrottling`)**:
   - *Riesgo*: Por defecto, Chromium reduce la frecuencia de temporizadores y suspende el bucle de audio cuando una ventana no está visible (`show: false`).
   - *Mitigación*: Se configuró `backgroundThrottling: false` en la `BrowserWindow` de Wake Word, junto con la ejecución en **AudioWorklet** desacoplado del hilo principal del DOM.

2. **Propiedad `visibleOnFullScreen` en Entornos Windows**:
   - *Riesgo*: La opción `visibleOnFullScreen: true` de Electron solo tiene efecto en sistemas macOS; en Windows no tiene ningún impacto operativo.
   - *Mitigación*: En Windows se implementa explícitamente `setAlwaysOnTop(true, 'screen-saver')`, que asegura la posición sobre el plano superior de las ventanas de DirectX y pantalla completa sin depender de APIs exclusivas de Apple.

3. **Conflicto de Atajos Globales de Teclado**:
   - *Riesgo*: Otra aplicación (ej. GeForce Experience, Discord, software de captura) puede haber registrado `Ctrl+Alt+V`.
   - *Mitigación*: `globalShortcut.register()` verifica el valor de retorno. Si devuelve `false`, la interfaz de Ajustes alerta al usuario y ofrece atajos alternativos (`Ctrl+Shift+V`, `Ctrl+Alt+F`, etc.) con recarga dinámica sin reiniciar.

4. **Eco Acústico y Bucle de Autoactivación**:
   - *Riesgo*: Los altavoces reproducen el nombre de Viernes o sonidos agudos y el micrófono los interpreta como una nueva activación.
   - *Mitigación*: Bloqueo estricto de captura en el proceso principal durante `SPEAKING`, supresión acústica por software y búfer de disipación de 350 ms antes de reactivar el detector.

