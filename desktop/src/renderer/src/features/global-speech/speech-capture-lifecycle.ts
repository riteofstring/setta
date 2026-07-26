import type { LocalMacOSVoiceModelDownloadStatus } from "@shared/speech-ipc";
import type { SettaAPI } from "@shared/types";

interface SpeechCapabilityRefreshController {
  refreshCapabilities: () => Promise<void> | void;
}

export function subscribeSpeechCapabilityRefresh(
  setta: SettaAPI,
  controller: SpeechCapabilityRefreshController,
): () => void {
  const unsubscribeCredential =
    setta.speech.onCredentialSettingsChanged?.(() => {
      void controller.refreshCapabilities();
    }) ?? (() => {});
  const unsubscribeProvider =
    setta.speech.onProviderSelectionChanged?.(() => {
      void controller.refreshCapabilities();
    }) ?? (() => {});
  const unsubscribeLocalMacOSDownload =
    setta.speech.onLocalMacOSVoiceModelDownloadChanged?.((status) => {
      if (localMacOSDownloadChangesCaptureReadiness(status)) {
        void controller.refreshCapabilities();
      }
    }) ?? (() => {});
  return () => {
    unsubscribeCredential();
    unsubscribeLocalMacOSDownload();
    unsubscribeProvider();
  };
}

function localMacOSDownloadChangesCaptureReadiness(
  status: LocalMacOSVoiceModelDownloadStatus,
): boolean {
  return status.status === "ready";
}

interface SpeechCaptureControllerDisposable {
  dispose: () => void;
}

interface PendingControllerDisposal {
  canceled: boolean;
  controller: SpeechCaptureControllerDisposable;
}

export class AppShellSpeechCaptureEffectLifetime {
  private pendingDisposal: PendingControllerDisposal | null = null;

  constructor(private readonly schedule: (handler: () => void) => void = scheduleMicrotask) {}

  mount(controller: SpeechCaptureControllerDisposable): () => void {
    if (this.pendingDisposal?.controller === controller) {
      this.pendingDisposal.canceled = true;
      this.pendingDisposal = null;
    }
    return () => {
      const pending = { canceled: false, controller } satisfies PendingControllerDisposal;
      this.pendingDisposal = pending;
      this.schedule(() => {
        if (pending.canceled) {
          return;
        }
        if (this.pendingDisposal === pending) {
          this.pendingDisposal = null;
        }
        controller.dispose();
      });
    };
  }
}

function scheduleMicrotask(handler: () => void): void {
  queueMicrotask(handler);
}
