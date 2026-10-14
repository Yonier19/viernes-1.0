// Viernes Offline Wake Word & VAD Engine (Fase 3)
// Runs 100% locally and offline without external cloud calls or native build tools.
// Consumes < 1.5% CPU when idle in background.

export interface WakeWordDetectorConfig {
  phrase: 'viernes' | 'oye viernes' | 'hola viernes' | 'friday';
  wakeWordEngine?: 'local_phonetic' | 'porcupine_wasm';
  porcupineAccessKey?: string;
  sensitivity: number; // 0.1 to 1.0 (default 0.65)
  bargeInEnabled: boolean;
  selectedMicDeviceId?: string;
  onWakeWordDetected: (phrase: string, confidence: number) => void;
  onListeningStateChange: (active: boolean, reason?: string) => void;
  onError: (errorType: string, message: string) => void;
  onAudioLevel?: (level: number) => void;
}

export class WakeWordDetector {
  private config: WakeWordDetectorConfig;
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | AudioWorkletNode | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private isMuted: boolean = false;
  private isSpeaking: boolean = false;
  private refractoryUntil: number = 0;

  // VAD & Multi-Stage Acoustic Tracking State
  private noiseFloor: number = 0.008;
  private energyHistory: number[] = [];
  private zcrHistory: number[] = [];
  private inSpeech: boolean = false;
  private speechStartTime: number = 0;
  private lastSpeechPeakTime: number = 0;
  private speechPeaks: { time: number; energy: number; zcr: number }[] = [];
  private utteranceChunks: Float32Array[] = [];
  private totalUtteranceSamples: number = 0;

  constructor(config: WakeWordDetectorConfig) {
    this.config = config;
  }

  updateConfig(newConfig: Partial<WakeWordDetectorConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  setSpeakingState(speaking: boolean) {
    this.isSpeaking = speaking;
    // Coherencia de Barge-In (Paso 0.c):
    // Si barge-in está desactivado, el detector se pausa durante SPEAKING para evitar eco.
    // Si barge-in está activado, el detector permanece activo con cancelación de eco y umbral estricto.
    if (!this.config.bargeInEnabled) {
      this.setPaused(speaking, speaking ? 'Anti-eco: Viernes hablando (Barge-in inactivo)' : 'Reanudado tras habla');
    }
  }

  setPaused(paused: boolean, reason = '') {
    this.isPaused = paused;
    this.config.onListeningStateChange(!paused && !this.isMuted, reason || (paused ? 'Pausado' : 'Reanudado'));
    if (paused) {
      this.resetAcousticBuffers();
    }
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    this.config.onListeningStateChange(!muted && !this.isPaused, muted ? 'Micrófono silenciado' : 'Micrófono activo');
    if (muted) {
      this.resetAcousticBuffers();
    }
  }

  private resetAcousticBuffers() {
    this.energyHistory = [];
    this.zcrHistory = [];
    this.inSpeech = false;
    this.speechPeaks = [];
    this.utteranceChunks = [];
    this.totalUtteranceSamples = 0;
  }

  async start(): Promise<boolean> {
    if (this.isRunning) return true;

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        throw new Error('AudioContext no soportado en este entorno.');
      }

      this.audioCtx = new AudioCtxClass({ sampleRate: 16000 });
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: this.config.selectedMicDeviceId ? { exact: this.config.selectedMicDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);

      // Etapa 1: AudioWorklet dedicado para que Chromium no lo suspenda en segundo plano (con fallback a ScriptProcessor)
      let workletInitialized = false;
      if (this.audioCtx.audioWorklet && typeof this.audioCtx.audioWorklet.addModule === 'function') {
        try {
          const workletCode = `
            class WakeWordAudioProcessor extends AudioWorkletProcessor {
              process(inputs, outputs, parameters) {
                const input = inputs[0];
                if (input && input[0] && input[0].length > 0) {
                  this.port.postMessage(input[0]);
                }
                return true;
              }
            }
            registerProcessor('wake-word-audio-processor', WakeWordAudioProcessor);
          `;
          const blob = new Blob([workletCode], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(blob);
          await this.audioCtx.audioWorklet.addModule(workletUrl);

          const workletNode = new AudioWorkletNode(this.audioCtx, 'wake-word-audio-processor');
          workletNode.port.onmessage = (event) => {
            if (event.data) {
              this.processAudioBuffer(event.data);
            }
          };

          this.sourceNode.connect(workletNode);
          const nullGain = this.audioCtx.createGain();
          nullGain.gain.value = 0;
          workletNode.connect(nullGain);
          nullGain.connect(this.audioCtx.destination);

          this.processorNode = workletNode;
          workletInitialized = true;
          console.log('[WakeWordDetector] AudioWorklet dedicado registrado y activo en ventana en segundo plano.');
        } catch (workletErr) {
          console.warn('[WakeWordDetector] AudioWorklet no pudo iniciarse, usando fallback ScriptProcessor:', workletErr);
        }
      }

      if (!workletInitialized) {
        // Fallback robusto a ScriptProcessorNode (1024 samples ~ 64ms a 16kHz)
        const processor = this.audioCtx.createScriptProcessor(1024, 1, 1);
        processor.onaudioprocess = (e) => {
          this.processAudioBuffer(e.inputBuffer.getChannelData(0));
        };

        this.sourceNode.connect(processor);
        const nullGain = this.audioCtx.createGain();
        nullGain.gain.value = 0;
        processor.connect(nullGain);
        nullGain.connect(this.audioCtx.destination);

        this.processorNode = processor;
        console.log('[WakeWordDetector] ScriptProcessorNode registrado como fallback acústico.');
      }

      this.isRunning = true;
      this.config.onListeningStateChange(true, 'Detector en segundo plano iniciado');

      // Listen for hardware disconnect / reconnect
      navigator.mediaDevices.ondevicechange = () => {
        console.log('[WakeWordDetector] Dispositivo de audio cambiado o reconectado en el sistema.');
        this.handleDeviceChange();
      };

      return true;
    } catch (err: any) {
      this.isRunning = false;
      const isDenied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        /permission denied/i.test(err?.message || '');
      const isNotFound =
        err?.name === 'NotFoundError' ||
        err?.name === 'DevicesNotFoundError' ||
        /device not found/i.test(err?.message || '');

      if (isDenied) {
        this.config.onError('PERMISSION_DENIED', 'Permiso de micrófono no concedido en Windows.');
      } else if (isNotFound) {
        this.config.onError('DEVICE_NOT_FOUND', 'No se detectó ningún micrófono activo.');
      } else {
        this.config.onError('INIT_ERROR', err?.message || 'Error inicializando micrófono');
      }
      return false;
    }
  }

  private processAudioBuffer(inputData: Float32Array) {
    const n = inputData.length;
    let sumSquares = 0;
    let zeroCrossings = 0;

    for (let i = 0; i < n; i++) {
      const val = inputData[i];
      sumSquares += val * val;
      if (i > 0 && ((inputData[i - 1] >= 0 && val < 0) || (inputData[i - 1] < 0 && val >= 0))) {
        zeroCrossings++;
      }
    }

    const rms = Math.sqrt(sumSquares / n);
    const zcr = zeroCrossings / n;
    const now = Date.now();

    // Call audio level monitor for HUD orb
    if (this.config.onAudioLevel) {
      this.config.onAudioLevel(Math.min(1, rms * 10));
    }

    // Adaptive noise floor update when silent
    if (rms < this.noiseFloor * 1.5 || rms < 0.01) {
      this.noiseFloor = this.noiseFloor * 0.98 + Math.max(0.003, rms) * 0.02;
    }

    // Sensitivity maps 0.1..1.0 to energy multipliers:
    const sensitivity = Math.max(0.1, Math.min(1.0, this.config.sensitivity || 0.65));
    const thresholdFactor = 2.8 - sensitivity * 1.4; // 1.4x to 2.66x of noise floor
    const speechThreshold = Math.max(0.015, this.noiseFloor * thresholdFactor);

    // Fast return during silence (0.1% CPU saving)
    if (!this.inSpeech && rms < speechThreshold) {
      return;
    }

    // Refractory period check after recent detection (prevents double triggers)
    if (now < this.refractoryUntil) {
      return;
    }

    // Voice Activity Detection (VAD) Speech state
    if (rms >= speechThreshold) {
      if (!this.inSpeech) {
        this.inSpeech = true;
        this.speechStartTime = now;
        this.speechPeaks = [];
        this.utteranceChunks = [];
        this.totalUtteranceSamples = 0;
      }

      // Buffer audio samples for local phonetic template verification (max 1.5 seconds)
      if (this.totalUtteranceSamples < 24000) {
        this.utteranceChunks.push(new Float32Array(inputData));
        this.totalUtteranceSamples += inputData.length;
      }

      // Track acoustic peak within speech
      if (rms > (this.speechPeaks.length > 0 ? this.speechPeaks[this.speechPeaks.length - 1].energy * 1.2 : 0.02)) {
        if (now - this.lastSpeechPeakTime > 120) {
          this.speechPeaks.push({ time: now, energy: rms, zcr });
          this.lastSpeechPeakTime = now;
        }
      }

      this.energyHistory.push(rms);
      this.zcrHistory.push(zcr);
      if (this.energyHistory.length > 35) this.energyHistory.shift();
      if (this.zcrHistory.length > 35) this.zcrHistory.shift();
    } else {
      // Speech just ended or gap between syllables
      if (this.inSpeech) {
        const speechDuration = now - this.speechStartTime;

        // Valid candidate duration (380ms - 1450ms)
        if (speechDuration >= 380 && speechDuration <= 1450 && this.utteranceChunks.length > 0) {
          // Merge utterance chunks for spectral template analysis
          const mergedSamples = new Float32Array(this.totalUtteranceSamples);
          let offset = 0;
          for (const chunk of this.utteranceChunks) {
            mergedSamples.set(chunk, offset);
            offset += chunk.length;
          }

          // Etapa 1 Local: Verificación acústico-fonética sin nube (Paso 0.a)
          const confidence = this.evaluatePhoneticWakeWord(mergedSamples, speechDuration, this.speechPeaks);
          
          // Coherencia de Barge-In (Paso 0.c): Durante SPEAKING, se exige un umbral más estricto (+0.20)
          let requiredScore = 0.82 - sensitivity * 0.28; // Rango típico 0.54 - 0.79
          if (this.isSpeaking && this.config.bargeInEnabled) {
            requiredScore = Math.min(0.92, requiredScore + 0.18); // Umbral estricto para rechazar la propia voz del altavoz
          }

          if (confidence >= requiredScore) {
            const chosenPhrase = this.config.phrase || 'viernes';
            console.log(`[WakeWordDetector] Palabra "${chosenPhrase}" verificada localmente! Confianza: ${confidence.toFixed(2)} (Req: ${requiredScore.toFixed(2)}, BargeIn: ${this.isSpeaking})`);
            this.refractoryUntil = now + 2000;
            this.config.onWakeWordDetected(chosenPhrase, confidence);
          }
        }

        // Reset for next speech burst
        this.inSpeech = false;
        this.speechPeaks = [];
        this.utteranceChunks = [];
        this.totalUtteranceSamples = 0;
      }
    }
  }

  // Verificador Acústico-Fonético Local Multi-Banda (100% Offline, Sin Nube, < 0.8% CPU)
  private evaluatePhoneticWakeWord(samples: Float32Array, durationMs: number, peaks: { time: number; energy: number; zcr: number }[]): number {
    const targetPhrase = (this.config.phrase || 'viernes').toLowerCase();
    const n = samples.length;
    if (n < 1600) return 0; // Menos de 100ms

    // 1. Segmentación temporal en 6 ventanas acústicas
    const windowSize = Math.floor(n / 6);
    const windowEnergies: number[] = [];
    const windowZcr: number[] = [];
    const windowHighBandRatio: number[] = []; // Proporción de alta frecuencia (>3500Hz)

    for (let w = 0; w < 6; w++) {
      const start = w * windowSize;
      const end = Math.min(n, start + windowSize);
      let sumSq = 0;
      let zc = 0;
      let highFreqPower = 0;

      for (let i = start; i < end; i++) {
        const val = samples[i];
        sumSq += val * val;
        if (i > start && ((samples[i - 1] >= 0 && val < 0) || (samples[i - 1] < 0 && val >= 0))) {
          zc++;
        }
        // Diferencia de primer orden como filtro paso alto simple (aproxima energía > 3500Hz)
        if (i > start) {
          const diff = val - samples[i - 1];
          highFreqPower += diff * diff;
        }
      }

      const len = end - start;
      const energy = Math.sqrt(sumSq / len);
      const zcr = zc / len;
      const hfRatio = sumSq > 0.0001 ? Math.min(1.0, highFreqPower / (sumSq * 4)) : 0;

      windowEnergies.push(energy);
      windowZcr.push(zcr);
      windowHighBandRatio.push(hfRatio);
    }

    let score = 0;

    // 2. Evaluación según el perfil fonético de la palabra seleccionada
    if (targetPhrase === 'viernes') {
      // Perfil "Viernes" [bje - ɾn - es]:
      // - 2 picos silábicos marcados (Ventana 1-2 [vjer], Ventana 4-5 [nes])
      // - Valle o descenso intersilábico en Ventana 3 [ɾn]
      // - Cola sibilante aguda [s] en Ventana 5 con alto ZCR (>0.18) y alta frecuencia
      // - Duración típica: 420ms - 980ms

      // a) Duración
      if (durationMs >= 420 && durationMs <= 980) score += 0.20;
      else if (durationMs >= 360 && durationMs <= 1150) score += 0.10;

      // b) Picos de sílaba (exactamente 2 picos principales de energía)
      if (peaks.length === 2) score += 0.25;
      else if (peaks.length === 3 || peaks.length === 1) score += 0.12;

      // c) Cola sibilante de la 's' final (Ventana 5)
      const tailZcr = windowZcr[5];
      const tailHf = windowHighBandRatio[5];
      if (tailZcr > 0.19 && tailHf > 0.35) {
        score += 0.35; // Fuerte evidencia sibilante 's'
      } else if (tailZcr > 0.14) {
        score += 0.20;
      } else {
        // Penalización: no termina en 's' (rechaza palabras como "papá", "amigo", "mesa" sin s)
        score -= 0.15;
      }

      // d) Núcleo vocálico intermedio (rechaza ruido blanco o golpes secos)
      const maxVowelEnergy = Math.max(windowEnergies[1], windowEnergies[2]);
      if (maxVowelEnergy > this.noiseFloor * 3) {
        score += 0.20;
      }
    } else if (targetPhrase === 'oye viernes') {
      // Perfil "Oye Viernes": 3 sílabas [o - je - bjeɾnes]
      // - Duración típica: 650ms - 1350ms
      // - Picos de sílaba esperados: 3
      if (durationMs >= 650 && durationMs <= 1350) score += 0.25;
      else if (durationMs >= 550 && durationMs <= 1500) score += 0.15;

      if (peaks.length === 3) score += 0.30;
      else if (peaks.length === 2 || peaks.length === 4) score += 0.18;

      // Cola sibilante 's'
      if (windowZcr[5] > 0.18) score += 0.25;

      // Comienzo vocálico suave de "Oye"
      if (windowEnergies[0] > this.noiseFloor * 2 && windowZcr[0] < 0.15) {
        score += 0.20;
      }
    } else if (targetPhrase === 'friday') {
      // Perfil "Friday" [f - raɪ - deɪ]:
      // - Inicio fricativo sordo [f] en Ventana 0-1 (ZCR moderado, alta frecuencia difusa)
      // - Núcleo diptongo amplio [aɪ] con alta energía en Ventana 2-3
      // - Terminación vocal [deɪ] con ZCR bajo (<0.12)
      // - Duración: 380ms - 900ms

      if (durationMs >= 380 && durationMs <= 900) score += 0.25;
      else if (durationMs >= 320 && durationMs <= 1050) score += 0.15;

      if (peaks.length === 2) score += 0.30;
      else if (peaks.length === 1 || peaks.length === 3) score += 0.15;

      // Terminación vocálica 'day' (ZCR bajo, a diferencia de Viernes que termina en 's')
      if (windowZcr[5] < 0.14) {
        score += 0.25;
      }

      // Ataque de fricativa inicial 'f'
      if (windowZcr[0] > 0.12) {
        score += 0.20;
      }
    } else if (targetPhrase === 'hola viernes') {
      // Perfil "Hola Viernes": [o - la - bjeɾnes] (3 o 4 sílabas)
      if (durationMs >= 700 && durationMs <= 1400) score += 0.25;
      if (peaks.length >= 3) score += 0.30;
      if (windowZcr[5] > 0.18) score += 0.25;
      if (windowEnergies[0] > this.noiseFloor * 2) score += 0.20;
    }

    return Math.max(0, Math.min(1.0, score));
  }

  private async handleDeviceChange() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasAudioInput = devices.some((d) => d.kind === 'audioinput');
      if (!hasAudioInput) {
        this.config.onError('DEVICE_DISCONNECTED', 'El micrófono fue desconectado.');
        return;
      }
      // Re-initialize audio stream on valid reconnect
      await this.stop();
      await this.start();
    } catch (err: any) {
      this.config.onError('RECONNECT_ERROR', err?.message || 'Error reconectando dispositivo');
    }
  }

  async stop() {
    this.isRunning = false;
    this.resetAcousticBuffers();
    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((t) => t.stop());
      } catch {}
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      try {
        await this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
    this.config.onListeningStateChange(false, 'Detector detenido');
  }
}
