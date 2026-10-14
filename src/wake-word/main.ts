import { WakeWordDetector } from './detector';

console.log('[WakeWordService] Iniciando servicio de escucha en segundo plano...');

async function initBackgroundWakeWordService() {
  const electronAPI = (window as any).electronAPI;
  let detector: WakeWordDetector | null = null;

  let currentSettings = {
    enabled: true,
    phrase: 'viernes' as const,
    sensitivity: 0.65,
    micDeviceId: '',
    bargeIn: false,
  };

  if (electronAPI && typeof electronAPI.getWakeWordSettings === 'function') {
    try {
      const stored = await electronAPI.getWakeWordSettings();
      if (stored) {
        currentSettings = { ...currentSettings, ...stored };
      }
    } catch (e) {
      console.warn('[WakeWordService] Error obteniendo ajustes iniciales:', e);
    }
  }

  detector = new WakeWordDetector({
    phrase: currentSettings.phrase,
    sensitivity: currentSettings.sensitivity,
    bargeInEnabled: currentSettings.bargeIn,
    selectedMicDeviceId: currentSettings.micDeviceId,
    onWakeWordDetected: (phrase, confidence) => {
      console.log(`[WakeWordService] ✨ Wake Word "${phrase}" detectada! (confianza: ${confidence.toFixed(2)})`);
      if (electronAPI && typeof electronAPI.notifyWakeWordDetected === 'function') {
        electronAPI.notifyWakeWordDetected({ phrase, confidence });
      }
    },
    onListeningStateChange: (active, reason) => {
      console.log(`[WakeWordService] Estado de escucha: ${active ? 'ACTIVO' : 'PAUSADO'} (${reason || ''})`);
    },
    onError: (type, message) => {
      console.warn(`[WakeWordService] Error en micrófono (${type}): ${message}`);
      if (electronAPI && typeof electronAPI.setAssistantState === 'function') {
        electronAPI.setAssistantState('ERROR', message);
      }
    },
  });

  if (currentSettings.enabled !== false) {
    await detector.start();
  }

  // Handle Mute events from System Tray
  if (electronAPI && typeof electronAPI.onMicrophoneMuteChanged === 'function') {
    electronAPI.onMicrophoneMuteChanged((isMuted: boolean) => {
      console.log(`[WakeWordService] Micrófono silenciado: ${isMuted}`);
      if (detector) {
        detector.setMuted(isMuted);
      }
    });
  }

  // Handle TTS coordination: pause detector or apply strict barge-in threshold while speaking
  if (electronAPI && typeof electronAPI.onTtsStop === 'function') {
    electronAPI.onTtsStop(() => {
      console.log('[WakeWordService] TTS detenido o finalizado. Restableciendo estado a reposo...');
      if (detector) {
        detector.setSpeakingState(false);
      }
    });
  }

  // Listen to assistant state changes (coherencia de Barge-In Paso 0.c)
  if (electronAPI && typeof electronAPI.onAssistantStateChanged === 'function') {
    electronAPI.onAssistantStateChanged((payload: any) => {
      if (!detector) return;
      if (payload.state === 'SPEAKING') {
        detector.setSpeakingState(true);
      } else {
        detector.setSpeakingState(false);
        if (payload.state === 'PAUSED') {
          detector.setPaused(true, 'Escucha pausada');
        } else if (payload.state === 'IDLE' || payload.state === 'LISTENING') {
          detector.setPaused(false, 'Listo para escuchar');
        }
      }
    });
  }

  // Update detector if settings change from SettingsScreen
  if (electronAPI && typeof electronAPI.onWakeWordStateChange === 'function') {
    electronAPI.onWakeWordStateChange(async (payload: any) => {
      if (!detector) return;
      if (payload.settings) {
        currentSettings = { ...currentSettings, ...payload.settings };
        detector.updateConfig({
          phrase: currentSettings.phrase,
          sensitivity: currentSettings.sensitivity,
          bargeInEnabled: currentSettings.bargeIn,
          selectedMicDeviceId: currentSettings.micDeviceId,
        });

        if (currentSettings.enabled === false) {
          await detector.stop();
        } else {
          await detector.start();
        }
      }
      if (payload.active !== undefined) {
        detector.setPaused(!payload.active, payload.reason);
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBackgroundWakeWordService);
} else {
  initBackgroundWakeWordService();
}
