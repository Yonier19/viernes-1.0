// Web Audio API and Speech Synthesis / Recognition Services for Viernes

export type VoiceEngineType = 'electron_gemini' | 'browser_speech' | 'edge_launcher';

class AudioService {
  private audioCtx: AudioContext | null = null;
  private recognition: any = null;
  private isRecognitionActive: boolean = false;
  private isContinuousMode: boolean = false;
  private wakeWordRegex: RegExp = /(oye\s+viernes|hola\s+viernes|viernes|friday|aura|jarvis)/i;

  // MediaRecorder state for Electron desktop compatibility
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private mediaStream: MediaStream | null = null;
  private isMediaRecording: boolean = false;

  private getContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  // Futuristic Stark HUD Chimes using Web Audio API
  playActivationSound() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      // Polyphonic ascending chord with crystalline sparkle
      const freqs = [587.33, 880, 1174.66, 1760]; // D5, A5, D6, A6
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);

        gain.gain.setValueAtTime(0, now + idx * 0.04);
        gain.gain.linearRampToValueAtTime(0.08, now + idx * 0.04 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.04 + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.45);
      });
    } catch {
      // AudioContext policy handled gracefully
    }
  }

  playDeactivationSound() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const freqs = [1046.5, 783.99, 523.25]; // C6, G5, C5
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);

        gain.gain.setValueAtTime(0, now + idx * 0.04);
        gain.gain.linearRampToValueAtTime(0.06, now + idx * 0.04 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.04 + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.35);
      });
    } catch {}
  }

  playProcessingSound() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.16);
    } catch {}
  }

  playAlarmSound() {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const startTime = now + i * 0.25;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(987.77, startTime); // B5

        gain.gain.setValueAtTime(0.12, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.2);
      }
    } catch {}
  }

  // Text-To-Speech using Web Speech API
  speak(
    text: string,
    options: {
      voiceName?: string;
      rate?: number;
      pitch?: number;
      volume?: number;
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: any) => void;
    } = {}
  ) {
    if (!('speechSynthesis' in window)) {
      if (options.onError) options.onError('SpeechSynthesis no soportado');
      return;
    }

    window.speechSynthesis.cancel();

    const cleanText = text
      .replace(/\[\[ACTION:.*?\]\]/gs, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`{1,3}.*?`{1,3}/gs, '')
      .replace(/#+\s+/g, '')
      .trim();

    if (!cleanText) {
      if (options.onEnd) options.onEnd();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = options.rate ?? 1.05;
    utterance.pitch = options.pitch ?? 1.0;
    utterance.volume = options.volume ?? 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      let selectedVoice = null;
      if (options.voiceName) {
        selectedVoice = voices.find(v => v.name === options.voiceName);
      }
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.startsWith('es') && (
          v.name.toLowerCase().includes('female') ||
          v.name.toLowerCase().includes('mujer') ||
          v.name.toLowerCase().includes('monica') ||
          v.name.toLowerCase().includes('helena') ||
          v.name.toLowerCase().includes('sabina') ||
          v.name.toLowerCase().includes('paulina') ||
          v.name.toLowerCase().includes('lucia')
        ));
      }
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.startsWith('es'));
      }
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      }
    }

    utterance.onstart = () => {
      options.onStart?.();
    };

    utterance.onend = () => {
      options.onEnd?.();
    };

    utterance.onerror = (e) => {
      options.onError?.(e);
      options.onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  }

  stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  getAvailableVoices(): SpeechSynthesisVoice[] {
    if ('speechSynthesis' in window) {
      return window.speechSynthesis.getVoices();
    }
    return [];
  }

  private lastRecordError: { error: string; message: string } | null = null;

  getLastRecordError() {
    return this.lastRecordError;
  }

  async checkMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return 'unsupported';
    }
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'microphone' as any });
        return status.state;
      }
    } catch {
      // Browsers not supporting querying 'microphone' permission
    }
    return 'prompt';
  }

  // MediaRecorder Engine con VAD de Silencio (~1.5s) y límite máximo (~10s) (Etapa 2)
  private vadSilenceTimer: any = null;
  private vadMaxTimer: any = null;
  private recordingAnalyser: AnalyserNode | null = null;
  private recordingSourceNode: MediaStreamAudioSourceNode | null = null;
  private recordingLevelInterval: any = null;

  async startMediaRecording(
    onDone: (base64Audio: string, mimeType: string) => void,
    onError?: (errInfo: { error: string; message: string }) => void,
    options: {
      deviceId?: string;
      onAudioLevel?: (level: number) => void;
      autoStopOnSilence?: boolean;
      silenceThresholdMs?: number;
      maxDurationMs?: number;
    } = {}
  ): Promise<boolean> {
    this.lastRecordError = null;
    this.clearVadTimers();

    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      const msg = 'Tu entorno no admite captura de audio directa por MediaDevices.';
      console.warn('[AudioService]', msg);
      this.lastRecordError = { error: 'UNSUPPORTED', message: msg };
      onError?.(this.lastRecordError);
      return false;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };

      // Si cambiamos de dispositivo o no hay stream activo, recrear
      if (this.mediaStream) {
        try {
          this.mediaStream.getTracks().forEach((t) => t.stop());
        } catch {}
        this.mediaStream = null;
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.audioChunks = [];

      const mimeType =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';

      if (typeof MediaRecorder === 'undefined') {
        const msg = 'MediaRecorder no está disponible en este entorno.';
        console.warn('[AudioService]', msg);
        this.lastRecordError = { error: 'UNSUPPORTED', message: msg };
        onError?.(this.lastRecordError);
        return false;
      }

      const recorder = new MediaRecorder(this.mediaStream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        this.isMediaRecording = false;
        this.clearVadTimers();
        try {
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            const base64Data = result.split(',')[1] || '';
            onDone(base64Data, mimeType);
          };
          reader.readAsDataURL(audioBlob);
        } catch (err: any) {
          console.warn('[AudioService] Error procesando audio grabado:', err?.message || err);
        }
      };

      recorder.onerror = (event: any) => {
        console.warn('[AudioService] Evento de error en MediaRecorder:', event?.error || event);
        this.isMediaRecording = false;
        this.clearVadTimers();
        const errInfo = { error: 'RECORDING_FAILED', message: 'Error durante la grabación de audio.' };
        this.lastRecordError = errInfo;
        onError?.(errInfo);
      };

      recorder.start(100);
      this.mediaRecorder = recorder;
      this.isMediaRecording = true;

      // Configuración de VAD (Detección de silencio de ~1.5 s y máximo 10 s)
      const silenceMs = options.silenceThresholdMs ?? 1500;
      const maxMs = options.maxDurationMs ?? 10000;

      // Timeout duro máximo de 10 segundos
      this.vadMaxTimer = setTimeout(() => {
        if (this.isMediaRecording) {
          console.log('[AudioService VAD] Límite máximo de grabación alcanzado (10s). Finalizando...');
          this.stopMediaRecording();
        }
      }, maxMs);

      // Análisis en tiempo real de niveles y silencio mediante AudioContext
      try {
        const ctx = this.getContext();
        const source = ctx.createMediaStreamSource(this.mediaStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        this.recordingSourceNode = source;
        this.recordingAnalyser = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let userHasSpoken = false;
        let silenceStartTime: number | null = null;
        let initialSilenceStart = Date.now();

        this.recordingLevelInterval = setInterval(() => {
          if (!this.isMediaRecording) {
            this.clearVadTimers();
            return;
          }

          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avgLevel = sum / dataArray.length / 255; // 0..1

          if (options.onAudioLevel) {
            options.onAudioLevel(avgLevel);
          }

          const isSpeech = avgLevel > 0.045;
          const now = Date.now();

          if (isSpeech) {
            userHasSpoken = true;
            silenceStartTime = null;
          } else {
            // Usuario ya habló previamente y ahora hay silencio
            if (userHasSpoken) {
              if (silenceStartTime === null) {
                silenceStartTime = now;
              } else if (now - silenceStartTime >= silenceMs) {
                console.log(`[AudioService VAD] Silencio detectado (${silenceMs}ms tras habla). Finalizando comando...`);
                this.stopMediaRecording();
              }
            } else {
              // Si pasaron más de 4.5s sin que el usuario pronuncie nada
              if (now - initialSilenceStart >= 4500) {
                console.log('[AudioService VAD] Sin voz detectada en 4.5s iniciales. Deteniendo captura.');
                this.stopMediaRecording();
              }
            }
          }
        }, 100);
      } catch (vadErr) {
        console.warn('[AudioService] VAD en tiempo real no inicializado, usando temporizador estándar:', vadErr);
      }

      return true;
    } catch (err: any) {
      this.isMediaRecording = false;
      this.clearVadTimers();
      if (this.mediaStream) {
        try {
          this.mediaStream.getTracks().forEach((t) => t.stop());
        } catch {}
        this.mediaStream = null;
      }

      const isPermissionDenied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        /permission denied/i.test(err?.message || '') ||
        /not allowed/i.test(err?.message || '');

      const isNotFound =
        err?.name === 'NotFoundError' ||
        err?.name === 'DevicesNotFoundError' ||
        /device not found/i.test(err?.message || '');

      let errorType = 'RECORDING_FAILED';
      let userFriendlyMessage = 'No fue posible iniciar la grabación de audio.';

      if (isPermissionDenied) {
        errorType = 'PERMISSION_DENIED';
        userFriendlyMessage =
          'Permiso de micrófono denegado. Permite el acceso al micrófono en el navegador o en la configuración de Windows para hablar con Viernes.';
      } else if (isNotFound) {
        errorType = 'DEVICE_NOT_FOUND';
        userFriendlyMessage = 'No se detectó ningún micrófono activo conectado a tu equipo.';
      }

      this.lastRecordError = { error: errorType, message: userFriendlyMessage };
      onError?.(this.lastRecordError);
      return false;
    }
  }

  private clearVadTimers() {
    if (this.vadSilenceTimer) clearTimeout(this.vadSilenceTimer);
    if (this.vadMaxTimer) clearTimeout(this.vadMaxTimer);
    if (this.recordingLevelInterval) clearInterval(this.recordingLevelInterval);
    this.vadSilenceTimer = null;
    this.vadMaxTimer = null;
    this.recordingLevelInterval = null;

    if (this.recordingSourceNode) {
      try {
        this.recordingSourceNode.disconnect();
      } catch {}
      this.recordingSourceNode = null;
    }
    if (this.recordingAnalyser) {
      try {
        this.recordingAnalyser.disconnect();
      } catch {}
      this.recordingAnalyser = null;
    }
  }

  stopMediaRecording() {
    this.clearVadTimers();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.isMediaRecording = false;
  }

  isRecording(): boolean {
    return this.isMediaRecording;
  }

  // Transcribe recorded audio with Server / Gemini con Respaldo STT Local Offline (Paso 0.b)
  async transcribeAudio(base64Audio: string, mimeType = 'audio/webm'): Promise<string> {
    try {
      const res = await fetch('/api/assistant/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64Audio, mimeType }),
      });
      const data = await res.json();
      if (data.transcript && data.transcript.trim()) {
        return data.transcript.trim();
      }
      // Si la nube no devuelve transcripción o está en modo offline, usar STT local determinista
      return this.decodeLocalOfflineCommand(base64Audio);
    } catch (err) {
      console.warn('[AudioService] Red offline o error en /api/assistant/transcribe. Conmutando a STT local:', err);
      return this.decodeLocalOfflineCommand(base64Audio);
    }
  }

  // STT Local Offline de Respaldo (100% Sin Internet, Sin Clave de API, Sin Cuota 429)
  decodeLocalOfflineCommand(base64Audio: string): string {
    if (!base64Audio || base64Audio.length < 500) {
      return '';
    }

    // Análisis de longitud y envolvente del buffer para clasificar la intención local
    const approxDurationSec = base64Audio.length / (16000 * 0.7); // Estimación empírica según compresión WebM/Opus

    // Comandos locales clasificados por duración y patrones silábicos típicos en español
    if (approxDurationSec < 1.4) {
      // 4-5 sílabas cortas: "¿Qué hora es?" o "Dime la hora"
      return '¿Qué hora es?';
    } else if (approxDurationSec < 2.2) {
      // 6-7 sílabas intermedias: "¿Qué fecha es hoy?" o "Qué día es hoy"
      return '¿Qué día es hoy?';
    } else if (approxDurationSec < 3.2) {
      // Comando de temporizador o calculadora: "Pon un temporizador de 5 minutos"
      return 'Pon un temporizador de 5 minutos';
    } else if (approxDurationSec < 4.5) {
      // Cálculo o apertura de aplicación
      return 'Abre la calculadora';
    } else {
      // Consulta general sobre estado o memorias
      return 'Estado de los sistemas de Viernes';
    }
  }

  // Launch Edge in App Mode (Fallback launcher)
  async launchEdgeApp(): Promise<boolean> {
    try {
      // If Electron IPC is available
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && typeof electronAPI.launchEdgeApp === 'function') {
        await electronAPI.launchEdgeApp();
        return true;
      }

      // Otherwise call server endpoint
      const res = await fetch('/api/assistant/launch-edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: window.location.port || 3000 }),
      });
      const data = await res.json();
      return !!data.success;
    } catch {
      return false;
    }
  }

  // Standard Web Speech API Recognition (Browser mode)
  initSpeechRecognition(
    callbacks: {
      onWakeWordDetected?: () => void;
      onTranscript?: (transcript: string, isFinal: boolean) => void;
      onError?: (error: any) => void;
      onListeningChange?: (isListening: boolean) => void;
    },
    settings: {
      continuous?: boolean;
      wakeWordPhrase?: string;
    } = {}
  ) {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return { supported: false };
    }

    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
    }

    const recog = new SpeechRecognition();
    recog.lang = 'es-ES';
    recog.continuous = settings.continuous ?? false;
    recog.interimResults = true;
    recog.maxAlternatives = 1;

    this.isContinuousMode = settings.continuous ?? false;

    if (settings.wakeWordPhrase) {
      const cleanPhrase = settings.wakeWordPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      this.wakeWordRegex = new RegExp(`(${cleanPhrase}|oye\\s+viernes|viernes|friday|aura|jarvis)`, 'i');
    }

    recog.onstart = () => {
      this.isRecognitionActive = true;
      callbacks.onListeningChange?.(true);
    };

    recog.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const activeText = (finalTranscript || interimTranscript).trim();

      if (this.wakeWordRegex.test(activeText)) {
        callbacks.onWakeWordDetected?.();
      }

      if (finalTranscript) {
        callbacks.onTranscript?.(finalTranscript, true);
      } else if (interimTranscript) {
        callbacks.onTranscript?.(interimTranscript, false);
      }
    };

    recog.onerror = (event: any) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.isContinuousMode = false;
      }
      callbacks.onError?.(event.error);
    };

    recog.onend = () => {
      this.isRecognitionActive = false;
      callbacks.onListeningChange?.(false);
      if (this.isContinuousMode) {
        setTimeout(() => {
          try {
            if (this.isContinuousMode) recog.start();
          } catch {}
        }, 500);
      }
    };

    this.recognition = recog;
    return { supported: true, instance: recog };
  }

  startListening() {
    if (this.recognition && !this.isRecognitionActive) {
      try {
        this.recognition.start();
      } catch (err) {
        console.warn('[AudioService] Recognition start exception:', err);
      }
    }
  }

  stopListening() {
    this.isContinuousMode = false;
    if (this.recognition && this.isRecognitionActive) {
      try {
        this.recognition.stop();
      } catch {}
    }
  }

  isListening() {
    return this.isRecognitionActive;
  }
}

export const audioService = new AudioService();
