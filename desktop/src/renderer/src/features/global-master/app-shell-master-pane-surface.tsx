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
    />
  );
}

export function AppShellMasterPaneUnavailable() {
  return (
    <section
      aria-label="Setta master"
      className="conversation-presentation-identity easy-button-surface setta-master-pane-surface"
      data-easy-button-state="complete"
      data-easy-button-status="failed"
      data-master-pane-state="unavailable"
      data-testid="master-pane-surface"
      role="region"
    >
      <aside
        className="easy-button-rail easy-button-rail-left setta-master-history-rail"
        data-easy-button-rail-empty="true"
      >
        <p className="easy-button-rail-label">Conversation</p>
      </aside>
      <main className="easy-button-stage setta-master-stage">
        <div className="easy-button-center setta-master-center">
          <div className="easy-button-agent-chip-slot setta-master-agent-chip-slot">
            <span className="easy-button-agent-chip setta-master-agent-chip">Global master</span>
          </div>
          <div className="easy-button-button-well setta-master-button-well">
            <button
              aria-label="Setta master unavailable"
              className="easy-button-control setta-master-control"
              data-master-voice-state="unavailable"
              disabled
              type="button"
            >
              <CircleAlert aria-hidden="true" />
            </button>
          </div>
          <div className="easy-button-caption-slot setta-master-caption-slot">
            <div
              className="setta-master-overlay-interaction"
              data-testid="master-active-interaction"
            >
              <div className="setta-master-overlay-empty" data-master-empty-tone="failed">
                <span aria-hidden="true" className="setta-master-overlay-empty-icon">
                  <Sparkles />
                </span>
                <h2>Master pane unavailable</h2>
                <p>Setta could not connect this pane to the desktop master controller.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <aside className="easy-button-rail easy-button-rail-right setta-master-action-rail">
        <p className="easy-button-rail-label">Topics</p>
      </aside>
      <footer className="easy-button-footer setta-master-footer">
        <form className="easy-button-input-wrap setta-master-input-wrap">
          <textarea
            aria-label="Ask Setta"
            className="easy-button-input setta-master-input"
            disabled
            placeholder="Master pane unavailable"
            readOnly
            rows={1}
            value=""
          />
          <button className="easy-button-enter-chip setta-master-submit" disabled type="submit">
            Send
          </button>
        </form>
      </footer>
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
