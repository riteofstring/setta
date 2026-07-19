import type { DesktopPlatform } from "@shared/types";
import { CircleAlert, Sparkles } from "lucide-react";
import { useSyncExternalStore } from "react";

import type { AppShellMasterController } from "./app-shell-master-controller";
import { MasterSurfaceFrame, useMasterVoiceShortcut } from "./app-shell-master-surface";
import type { AppShellSpeechCaptureContextValue } from "../global-speech/app-shell-speech-capture";
import type {
  AppShellSpeechCaptureController,
  AppShellSpeechCaptureSnapshot,
} from "../global-speech/app-shell-speech-capture-controller";
import type { AppShellSpeechPlaybackController } from "../global-speech/app-shell-speech-playback-controller";

export function AppShellMasterPaneSurface({
  controller,
  focused,
  onOpenVoiceCredentialSettings,
  platform,
  speechCapture,
  speechPlayback,
}: {
  controller: AppShellMasterController;
  focused: boolean;
  onOpenVoiceCredentialSettings?: () => void;
  platform: DesktopPlatform;
  speechCapture?: AppShellSpeechCaptureController;
  speechPlayback?: AppShellSpeechPlaybackController;
}) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const speechCaptureContext = useSpeechCaptureContextFromController(speechCapture);
  const masterVoiceShortcut = useMasterVoiceShortcut();
  return (
    <MasterSurfaceFrame
      controller={controller}
      focused={focused}
      masterVoiceShortcut={masterVoiceShortcut}
      onOpenVoiceCredentialSettings={onOpenVoiceCredentialSettings}
      platform={platform}
      snapshot={snapshot}
      speechCapture={speechCaptureContext}
      speechPlayback={speechPlayback ?? null}
      variant="pane"
    />
  );
}

export function AppShellMasterPaneUnavailable() {
  return (
    <section
      aria-labelledby="setta-master-pane-title"
      className="setta-master-overlay setta-master-pane"
      data-master-pane-state="unavailable"
      data-testid="master-pane-surface"
      role="region"
    >
      <header className="setta-master-overlay-header">
        <span aria-hidden="true" className="setta-master-overlay-mark">
          <Sparkles />
        </span>
        <div className="min-w-0 flex-1">
          <div className="setta-master-overlay-eyebrow">Global master</div>
          <h1 id="setta-master-pane-title">Setta</h1>
        </div>
      </header>
      <div className="setta-master-overlay-interaction" data-testid="master-active-interaction">
        <div className="setta-master-overlay-empty">
          <span aria-hidden="true" className="setta-master-overlay-empty-icon">
            <CircleAlert />
          </span>
          <h2>Master pane unavailable</h2>
          <p>Setta could not connect this pane to the desktop master controller.</p>
        </div>
      </div>
    </section>
  );
}

function useSpeechCaptureContextFromController(
  controller: AppShellSpeechCaptureController | undefined,
): AppShellSpeechCaptureContextValue | null {
  const snapshot = useSyncExternalStore<AppShellSpeechCaptureSnapshot | null>(
    controller?.subscribe ?? subscribeNoSpeechCapture,
    controller?.getSnapshot ?? nullSpeechCaptureSnapshot,
    controller?.getSnapshot ?? nullSpeechCaptureSnapshot,
  );
  if (!controller || !snapshot) {
    return null;
  }
  return { controller, snapshot };
}

function subscribeNoSpeechCapture(): () => void {
  return () => {};
}

function nullSpeechCaptureSnapshot(): AppShellSpeechCaptureSnapshot | null {
  return null;
}
