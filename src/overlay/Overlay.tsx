import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OverlayOrb } from './OverlayOrb';
import {
  AssistantLifecycleState,
  GroundingSource,
  AISettings,
  OrbThemeColor,
  ChatMessage,
} from '../types/assistant';
import { audioService } from '../services/audioService';
import { memoryStorage } from '../services/memoryStorage';
import {
  Mic,
  MicOff,
  Maximize2,
  Minus,
  Send,
  ExternalLink,
  Sparkles,
  GripHorizontal,
  AlertTriangle,
  Check,
  Zap,
} from 'lucide-react';

export const Overlay: React.FC = () => {
  const [state, setState] = useState<AssistantLifecycleState>('IDLE');
  const [theme, setTheme] = useState<OrbThemeColor>('cyan');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [responseStream, setResponseStream] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [powerProfile, setPowerProfile] = useState<'eco' | 'balanced' | 'performance'>('balanced');
  const [inactivityCountdown, setInactivityCountdown] = useState<number | null>(null);

  // Fase 5: Estado de acciones de dispositivo en el Overlay
  const [deviceActionBanner, setDeviceActionBanner] = useState<{ status: 'preview' | 'executing' | 'done' | 'failed' | 'cancelled'; text: string } | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<any | null>(null);

  // Dragging state
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 });
  const hasMovedRef = useRef<boolean>(false);

  // Inactivity collapse timer ref
  const inactivityTimerRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);

  // Audio level simulation for the orb visualizer
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const audioIntervalRef = useRef<any>(null);

  // Helper to send mouse pass-through state to Electron
  const handleMouseEnter = () => {
    if (window.electronAPI?.setIgnoreMouseEvents) {
      window.electronAPI.setIgnoreMouseEvents(false);
    }
  };

  const handleMouseLeave = () => {
    if (!isExpanded && window.electronAPI?.setIgnoreMouseEvents) {
      window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    }
  };

  // Sync state with Electron main process
  useEffect(() => {
    if (window.electronAPI?.getAssistantState) {
      window.electronAPI.getAssistantState().then((res) => {
        if (res?.state) setState(res.state);
        if (res?.isMicMuted !== undefined) setIsMicMuted(res.isMicMuted);
      });
    }

    if (window.electronAPI?.getPowerProfile) {
      window.electronAPI.getPowerProfile().then((prof) => {
        if (prof) setPowerProfile(prof);
      });
    }

    if (window.electronAPI?.onAssistantStateChanged) {
      const unsub = window.electronAPI.onAssistantStateChanged((payload) => {
        if (payload?.state) {
          setState(payload.state);
        }
      });
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
  }, []);

  // Update assistant state in Electron
  const updateAssistantState = useCallback((newState: AssistantLifecycleState, reason = '') => {
    setState(newState);
    if (window.electronAPI?.setAssistantState) {
      window.electronAPI.setAssistantState(newState, reason);
    }
  }, []);

  // Dynamic audio simulation while listening or speaking
  useEffect(() => {
    if (state === 'LISTENING' || state === 'SPEAKING') {
      audioIntervalRef.current = setInterval(() => {
        setAudioLevel(0.2 + Math.random() * 0.7);
      }, 100);
    } else {
      setAudioLevel(0);
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    }
    return () => {
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    };
  }, [state]);

  // Handle window expansion bounds (Paso 0.a: Desactivar foco al contraer)
  const expandOverlay = useCallback((expand: boolean) => {
    setIsExpanded(expand);
    if (!expand && window.electronAPI?.setOverlayFocusable) {
      window.electronAPI.setOverlayFocusable(false);
    }
    if (window.electronAPI?.setOverlayExpanded) {
      window.electronAPI.setOverlayExpanded(expand);
    }
    if (window.electronAPI?.setIgnoreMouseEvents) {
      window.electronAPI.setIgnoreMouseEvents(!expand, { forward: true });
    }
  }, []);

  // Timer refs for Etapa 2 voice capture (1.5s silence / 10s max limit)
  const silenceTimerRef = useRef<any>(null);
  const maxRecordingTimerRef = useRef<any>(null);

  // Cross-window single TTS lock listener (Paso 0.d)
  useEffect(() => {
    if (window.electronAPI?.onTtsStop) {
      const unsub = window.electronAPI.onTtsStop(() => {
        audioService.stopSpeaking();
      });
      return () => unsub();
    }
  }, []);

  // Cross-window chat synchronization (Paso 0.d)
  useEffect(() => {
    if (window.electronAPI?.onSyncChatMessage) {
      const unsub = window.electronAPI.onSyncChatMessage((msg: ChatMessage) => {
        if (msg.sender === 'viernes' && msg.text) {
          setResponseStream(msg.text);
          if (msg.sources) setSources(msg.sources);
        } else if (msg.sender === 'user' && msg.text) {
          setTranscript(msg.text);
        }
      });
      return () => unsub();
    }
  }, []);

  // Reset inactivity timer (5 seconds of inactivity before auto-collapsing)
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setInactivityCountdown(null);

    // Only start 5s countdown when not streaming, not listening, and in expanded mode
    if (isExpanded && !isStreaming && state !== 'LISTENING' && state !== 'PROCESSING' && state !== 'SPEAKING') {
      let secondsLeft = 5;
      setInactivityCountdown(secondsLeft);

      countdownIntervalRef.current = setInterval(() => {
        secondsLeft -= 1;
        setInactivityCountdown(secondsLeft);
        if (secondsLeft <= 0) {
          clearInterval(countdownIntervalRef.current);
        }
      }, 1000);

      inactivityTimerRef.current = setTimeout(() => {
        expandOverlay(false);
        setInactivityCountdown(null);
      }, 5000);
    }
  }, [isExpanded, isStreaming, state, expandOverlay]);

  // Trigger inactivity countdown on stream end
  useEffect(() => {
    if (isExpanded && !isStreaming && state === 'IDLE') {
      resetInactivityTimer();
    }
  }, [isExpanded, isStreaming, state, resetInactivityTimer]);

  // Execute command through /api/assistant/chat-stream (Tier 1-4 fallback router)
  const executeCommand = useCallback(
    async (commandText: string) => {
      if (!commandText.trim()) return;

      expandOverlay(true);
      const cleanCommand = commandText.trim();
      setTranscript(cleanCommand);
      setInterimTranscript('');
      setResponseStream('');
      setSources([]);
      setIsStreaming(true);
      updateAssistantState('PROCESSING', 'Procesando comando en overlay');

      // Sincronizar mensaje del usuario con la ventana principal (Paso 0.d)
      if (window.electronAPI?.syncChatMessage) {
        window.electronAPI.syncChatMessage({
          id: 'user-' + Date.now(),
          sender: 'user',
          text: cleanCommand,
          timestamp: Date.now(),
        });
      }

      // Cargar memorias compartidas desde memoryStorage (Paso 0.d)
      const sharedMemories = memoryStorage.getMemories();

      try {
        const res = await fetch('/api/assistant/chat-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: cleanCommand,
            conversationId: 'viernes-shared-session',
            history: [],
            memories: sharedMemories,
            systemContext: {
              source: 'floating_overlay',
              currentTime: new Date().toLocaleString(),
            },
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error('No se pudo establecer comunicación con el núcleo de Viernes.');
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let finalResult: any = null;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const raw = decoder.decode(value, { stream: true });
          const lines = raw.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.type === 'chunk' && parsed.text) {
                  accumulated += parsed.text;
                  setResponseStream(accumulated);
                } else if (parsed.type === 'done' && parsed.result) {
                  finalResult = parsed.result;
                  if (parsed.result.sources) {
                    setSources(parsed.result.sources);
                  }
                }
              } catch {}
            }
          }
        }

        const finalText = finalResult?.response || accumulated || 'Comando procesado, jefe.';
        setResponseStream(finalText);
        setIsStreaming(false);

        // Sincronizar respuesta de Viernes con la ventana principal
        if (window.electronAPI?.syncChatMessage) {
          window.electronAPI.syncChatMessage({
            id: 'friday-' + Date.now(),
            sender: 'viernes',
            text: finalText,
            timestamp: Date.now(),
            sources: finalResult?.sources,
            tier: finalResult?.tier,
          });
        }

        // Ejecución de Acción de Dispositivo en Overlay (Fase 5)
        if (finalResult?.action?.type === 'DEVICE_ACTION') {
          const devAct = finalResult.action;
          const actionLabel = devAct.summary || devAct.deviceAction || 'orden de dispositivo';
          setDeviceActionBanner({
            status: 'executing',
            text: `Voy a hacer: ${actionLabel}...`,
          });

          if (window.electronAPI?.executeDeviceAction) {
            window.electronAPI.executeDeviceAction({
              action: devAct.deviceAction,
              params: devAct.params || {},
              origin: 'USER_VOICE',
              confidence: 0.95,
            }).then((res: any) => {
              if (res.status === 'CONFIRMATION_REQUIRED') {
                setPendingConfirmation(res);
                setDeviceActionBanner({
                  status: 'preview',
                  text: `Confirmación requerida (Nivel ${res.level}): ${res.summary || devAct.deviceAction}`,
                });
              } else if (res.success) {
                setDeviceActionBanner({
                  status: 'done',
                  text: `Hecho: ${res.message || 'Acción completada con éxito.'}`,
                });
                setTimeout(() => setDeviceActionBanner(null), 5000);
              } else {
                setDeviceActionBanner({
                  status: 'failed',
                  text: `Falló: ${res.error || 'No se pudo completar la orden.'}`,
                });
                setTimeout(() => setDeviceActionBanner(null), 5000);
              }
            }).catch((err: any) => {
              setDeviceActionBanner({ status: 'failed', text: `Falló: ${err.message}` });
              setTimeout(() => setDeviceActionBanner(null), 5000);
            });
          } else {
            if (devAct.level && devAct.level >= 2) {
              setPendingConfirmation({
                actionId: 'sim-' + Date.now(),
                level: devAct.level,
                action: devAct.deviceAction,
                summary: devAct.summary || devAct.deviceAction,
                requiresPhysicalClick: devAct.level === 3,
                message: `Acción de Nivel ${devAct.level}: ${devAct.summary || devAct.deviceAction}. ¿Deseas confirmar la ejecución?`,
              });
            } else {
              setDeviceActionBanner({
                status: 'done',
                text: `Hecho: [Modo Simulado] ${devAct.deviceAction} ejecutado con éxito.`,
              });
              setTimeout(() => setDeviceActionBanner(null), 5000);
            }
          }
        }

        // Transición a SPEAKING con bloqueo único de TTS (Paso 0.d & Anti-eco)
        updateAssistantState('SPEAKING', 'Respondiendo por voz');
        if (window.electronAPI?.notifyTtsStarted) {
          window.electronAPI.notifyTtsStarted();
        }

        audioService.speak(finalText, {
          onEnd: () => {
            if (window.electronAPI?.notifyTtsEnded) {
              window.electronAPI.notifyTtsEnded();
            }
            updateAssistantState('IDLE', 'Respuesta por voz completada');
          },
          onError: () => {
            if (window.electronAPI?.notifyTtsEnded) {
              window.electronAPI.notifyTtsEnded();
            }
            updateAssistantState('IDLE', 'Fin de TTS con aviso');
          },
        });
      } catch (err: any) {
        setIsStreaming(false);
        const errMsg = `Protocolo local: ${err?.message || 'Error de conexión'}. Modo Tier 4 activo.`;
        setResponseStream(errMsg);
        updateAssistantState('ERROR', err?.message || 'Fallo de streaming');
      }
    },
    [expandOverlay, updateAssistantState]
  );

  const handleConfirmAction = async (confirmed: boolean) => {
    if (!pendingConfirmation) return;
    const item = pendingConfirmation;
    setPendingConfirmation(null);

    if (window.electronAPI?.confirmDeviceAction && item.actionId) {
      try {
        const res = await window.electronAPI.confirmDeviceAction(item.actionId, confirmed, 'PHYSICAL_CLICK');
        if (res.success) {
          setDeviceActionBanner({
            status: confirmed ? 'done' : 'cancelled',
            text: `${confirmed ? 'Hecho' : 'Cancelado'}: ${res.message || 'Operación completada con éxito.'}`,
          });
          if (confirmed) audioService.playActivationSound();
        } else {
          setDeviceActionBanner({
            status: 'failed',
            text: `Falló: ${res.error || 'No se pudo completar la operación confirmada.'}`,
          });
        }
      } catch (e: any) {
        setDeviceActionBanner({ status: 'failed', text: `Falló: ${e.message}` });
      }
    } else {
      setDeviceActionBanner({
        status: confirmed ? 'done' : 'cancelled',
        text: confirmed ? `Hecho: Acción de Nivel ${item.level} confirmada con clic físico.` : 'Cancelado por el usuario.',
      });
    }
    setTimeout(() => setDeviceActionBanner(null), 5000);
  };

  // Toggle voice listening con Etapa 2 (VAD silencio de ~1.5 s y máximo 10 s)
  const handleToggleListening = useCallback(() => {
    if (state === 'LISTENING') {
      audioService.stopListening();
      audioService.stopMediaRecording();
      updateAssistantState('IDLE', 'Escucha detenida por usuario');
      return;
    }

    expandOverlay(true);
    updateAssistantState('LISTENING', 'Escucha activa tras activación');
    setInterimTranscript('Escuchando tu comando...');
    audioService.playActivationSound();

    // Captura con MediaRecorder + VAD enviada a /api/assistant/transcribe (Paso 1 y 2)
    audioService.startMediaRecording(
      async (base64Audio, mimeType) => {
        setInterimTranscript('Procesando voz...');
        try {
          const transRes = await fetch('/api/assistant/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64Audio, mimeType }),
          });
          const transData = await transRes.json();
          const transcript = (transData.transcript || '').trim() || audioService.decodeLocalOfflineCommand(base64Audio);
          if (transcript) {
            executeCommand(transcript);
          } else {
            setInterimTranscript('No se detectó comando de voz claro.');
            updateAssistantState('IDLE', 'Sin transcripción detectada');
          }
        } catch {
          // Respaldo STT local determinista cuando no hay red (Paso 0.b)
          const localCmd = audioService.decodeLocalOfflineCommand(base64Audio);
          if (localCmd) {
            console.log('[Overlay STT Fallback] Ejecutando comando local offline:', localCmd);
            executeCommand(localCmd);
          } else {
            setInterimTranscript('Modo sin conexión. Puedes escribir tu comando.');
            updateAssistantState('IDLE', 'Fallo de transcripción');
          }
        }
      },
      (_err) => {
        // En caso de que MediaRecorder falle (permiso o soporte), intentar Web Speech
        audioService.initSpeechRecognition({
          onTranscript: (text: string, isFinal: boolean) => {
            if (isFinal) {
              setInterimTranscript('');
              executeCommand(text);
            } else {
              setInterimTranscript(text);
            }
          },
          onError: () => {
            setInterimTranscript('Micrófono en espera. Puedes escribir tu comando.');
            updateAssistantState('IDLE', 'Micrófono no disponible');
          },
        });
        audioService.startListening();
      },
      {
        onAudioLevel: (lvl) => setAudioLevel(lvl),
        silenceThresholdMs: 1500,
        maxDurationMs: 10000,
      }
    );
  }, [state, expandOverlay, updateAssistantState, executeCommand]);

  // Listen to Global Shortcut or Wake Word triggered from Electron
  useEffect(() => {
    if (window.electronAPI?.onOverlayTriggerListening) {
      const unsub = window.electronAPI.onOverlayTriggerListening((payload) => {
        console.log('[Overlay] Disparo de escucha recibido desde Electron:', payload);
        handleToggleListening();
      });
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
  }, [handleToggleListening]);

  // Dragging handlers for compact orb
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    dragStartRef.current = { clientX: e.screenX, clientY: e.screenY };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = ev.screenX - dragStartRef.current.clientX;
      const dy = ev.screenY - dragStartRef.current.clientY;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMovedRef.current = true;
      }

      dragStartRef.current = { clientX: ev.screenX, clientY: ev.screenY };
      if (window.electronAPI?.moveOverlayBy) {
        window.electronAPI.moveOverlayBy(dx, dy);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        if (hasMovedRef.current && window.electronAPI?.saveOverlayPosition) {
          window.electronAPI.saveOverlayPosition();
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleOrbClick = () => {
    if (hasMovedRef.current) return; // Ignore drag clicks
    if (!isExpanded) {
      handleToggleListening();
    } else {
      expandOverlay(false);
    }
  };

  const handleOpenMainWindow = () => {
    if (window.electronAPI?.openMainWindow) {
      window.electronAPI.openMainWindow();
    }
  };

  const handleSubmitText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    const msg = inputMessage;
    setInputMessage('');
    executeCommand(msg);
  };

  const isIdle = state === 'IDLE' || state === 'PAUSED';

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="w-full h-full flex flex-col justify-end items-end p-2 box-border select-none overflow-hidden"
    >
      {/* COMPACT MODE */}
      {!isExpanded && (
        <div
          onMouseDown={handleMouseDown}
          className={`relative flex flex-col items-center justify-center transition-all duration-300 cursor-grab active:cursor-grabbing ${
            isIdle ? 'opacity-60 hover:opacity-100' : 'opacity-100'
          }`}
          style={{ width: 76, height: 76 }}
        >
          <OverlayOrb
            state={state}
            theme={theme}
            size={72}
            audioLevel={audioLevel}
            powerProfile={powerProfile}
            onClick={handleOrbClick}
          />

          {/* Micro Status Dot & Privacy Indicator */}
          <div className="absolute bottom-0 right-1 pointer-events-none">
            <span
              className={`block w-2.5 h-2.5 rounded-full border border-black/60 shadow-md ${
                isMicMuted
                  ? 'bg-amber-500'
                  : state === 'LISTENING'
                  ? 'bg-red-500 animate-ping'
                  : state === 'PROCESSING'
                  ? 'bg-purple-500 animate-pulse'
                  : state === 'SPEAKING'
                  ? 'bg-emerald-400 animate-bounce'
                  : state === 'PAUSED'
                  ? 'bg-amber-400'
                  : state === 'ERROR'
                  ? 'bg-red-600'
                  : 'bg-cyan-400'
              }`}
            />
          </div>
        </div>
      )}

      {/* EXPANDED MODE */}
      {isExpanded && (
        <div
          onMouseEnter={resetInactivityTimer}
          className="w-full max-w-[370px] h-[480px] flex flex-col bg-slate-950/92 backdrop-blur-2xl border border-cyan-500/40 rounded-2xl shadow-2xl shadow-cyan-950/70 text-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        >
          {/* Top Bar / HUD Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900/90 border-b border-cyan-500/20">
            <div className="flex items-center space-x-2">
              <div
                onMouseDown={handleMouseDown}
                className="cursor-grab active:cursor-grabbing"
                title="Arrastrar overlay"
              >
                <OverlayOrb state={state} theme={theme} size={30} audioLevel={audioLevel} />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-orbitron font-bold tracking-wider text-cyan-300">
                    VIERNES
                  </span>
                  <span className="text-[10px] font-mono text-cyan-500/80">F.R.I.D.A.Y.</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isMicMuted
                        ? 'bg-amber-400'
                        : state === 'LISTENING'
                        ? 'bg-red-400 animate-ping'
                        : state === 'PROCESSING'
                        ? 'bg-purple-400 animate-pulse'
                        : state === 'SPEAKING'
                        ? 'bg-emerald-400'
                        : state === 'PAUSED'
                        ? 'bg-amber-400'
                        : state === 'ERROR'
                        ? 'bg-red-500'
                        : 'bg-cyan-400'
                    }`}
                  />
                  <span className="text-[9px] font-mono text-slate-400 uppercase tracking-tight">
                    {isMicMuted
                      ? 'MICRÓFONO SILENCIADO'
                      : state === 'LISTENING'
                      ? 'ESCUCHANDO VOZ'
                      : state === 'PROCESSING'
                      ? 'PROCESANDO PROTOCOLO'
                      : state === 'SPEAKING'
                      ? 'HABLANDO'
                      : state === 'PAUSED'
                      ? 'PAUSADO'
                      : state === 'ERROR'
                      ? 'ERROR DE ENLACE'
                      : 'EN ESPERA'}
                  </span>
                </div>
              </div>
            </div>

            {/* Window Controls */}
            <div className="flex items-center space-x-1 text-slate-400">
              <button
                type="button"
                onClick={handleOpenMainWindow}
                className="p-1 hover:text-cyan-300 hover:bg-slate-800 rounded transition-all cursor-pointer"
                title="Abrir ventana principal completa"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => expandOverlay(false)}
                className="p-1 hover:text-red-400 hover:bg-slate-800 rounded transition-all cursor-pointer"
                title="Contraer a orbe flotante"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Transcript & Streaming Content Area */}
          <div className="flex-1 p-3 overflow-y-auto space-y-3 font-sans text-xs scrollbar-thin scrollbar-thumb-cyan-500/20">
            {/* User prompt / transcription */}
            {(transcript || interimTranscript) && (
              <div className="flex justify-end">
                <div className="max-w-[85%] px-3 py-2 rounded-xl bg-cyan-950/60 border border-cyan-500/30 text-cyan-100">
                  <p className="text-[11px] font-semibold text-cyan-400 mb-0.5">TÚ:</p>
                  <p className="text-xs">{transcript || interimTranscript}</p>
                </div>
              </div>
            )}

            {/* Listening Live Status */}
            {state === 'LISTENING' && (
              <div className="flex items-center space-x-2 p-2.5 rounded-xl bg-red-950/30 border border-red-500/30 text-red-200">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <span className="text-xs font-mono">
                  {interimTranscript || 'Di tu comando o consulta...'}
                </span>
              </div>
            )}

            {/* Friday Streaming Response */}
            {(responseStream || isStreaming) && (
              <div className="flex justify-start">
                <div className="max-w-[92%] px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/60 text-slate-200 shadow-md">
                  <div className="flex items-center space-x-1.5 mb-1 text-cyan-400">
                    <Sparkles className="w-3 h-3" />
                    <span className="text-[10px] font-orbitron font-semibold tracking-wide">
                      RESPUESTA:
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">
                    {responseStream}
                    {isStreaming && <span className="inline-block w-1.5 h-3.5 ml-1 bg-cyan-400 animate-pulse align-middle" />}
                  </p>

                  {/* Sources Chips */}
                  {sources && sources.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-800">
                      <span className="text-[10px] font-mono text-slate-400 block mb-1">
                        FUENTES WEB GROUNDING:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {sources.map((src, idx) => (
                          <a
                            key={idx}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              e.preventDefault();
                              if (window.electronAPI?.openExternal) {
                                window.electronAPI.openExternal(src.url);
                              }
                            }}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-950 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500 text-[10px] text-cyan-300 transition-colors"
                          >
                            <span className="truncate max-w-[140px]">{src.title}</span>
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Welcome / Idle Placeholder if nothing yet */}
            {!transcript && !interimTranscript && !responseStream && (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400">
                <p className="text-xs font-semibold text-slate-300 mb-1">
                  Viernes está escuchando en segundo plano
                </p>
                <p className="text-[11px] text-slate-500 mb-3">
                  Pulsa el micrófono, usa el atajo <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-cyan-300 font-mono">Ctrl+Alt+V</kbd> o escribe abajo.
                </p>
                <div className="flex items-center space-x-2 text-[10px] text-slate-500">
                  <GripHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Arrastra el orbe para ubicarlo donde prefieras</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer Controls & Quick Input */}
          <div className="p-2.5 bg-slate-900/90 border-t border-cyan-500/20">
            <form onSubmit={handleSubmitText} className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={handleToggleListening}
                className={`p-2 rounded-xl border transition-all cursor-pointer ${
                  state === 'LISTENING'
                    ? 'bg-red-600 border-red-400 text-white animate-pulse'
                    : 'bg-cyan-950/60 hover:bg-cyan-900/70 border-cyan-500/50 text-cyan-300'
                }`}
                title={state === 'LISTENING' ? 'Detener escucha' : 'Hablar con Viernes (Ctrl+Alt+V)'}
              >
                {state === 'LISTENING' ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <input
                type="text"
                value={inputMessage}
                onFocus={() => {
                  if (window.electronAPI?.setOverlayFocusable) {
                    window.electronAPI.setOverlayFocusable(true);
                  }
                  resetInactivityTimer();
                }}
                onBlur={() => {
                  if (window.electronAPI?.setOverlayFocusable) {
                    window.electronAPI.setOverlayFocusable(false);
                  }
                }}
                onChange={(e) => {
                  setInputMessage(e.target.value);
                  resetInactivityTimer();
                }}
                placeholder="Escribe tu comando o pregunta..."
                className="flex-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-sans"
              />

              <button
                type="submit"
                disabled={!inputMessage.trim()}
                className="p-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 text-white transition-all cursor-pointer"
                title="Enviar comando"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            {/* Inactivity Auto-collapse indicator */}
            {inactivityCountdown !== null && (
              <div className="mt-1 flex items-center justify-between text-[9px] text-slate-400 font-mono px-1">
                <span>Reposo automático en {inactivityCountdown}s</span>
                <button
                  type="button"
                  onClick={() => setInactivityCountdown(null)}
                  className="hover:text-cyan-300 cursor-pointer"
                >
                  Mantener abierto
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
