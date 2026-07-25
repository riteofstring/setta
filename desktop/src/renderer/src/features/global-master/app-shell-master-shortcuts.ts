import type { AppearanceMasterVoiceShortcut } from "@generated/backend";
import type { DesktopPlatform, WorkspaceBrowserViewKeyEvent } from "@shared/types";
import { useEffect } from "react";

import { cancelMasterCaptureIfActive, executeMasterVoiceCommand } from "./master-voice-controls";
import { isMasterVoiceShortcut } from "./master-shortcuts";
import type { AppShellSpeechCaptureController } from "../global-speech/app-shell-speech-capture-controller";
import {
  isMasterPaneFocusShortcut,
  requestMasterPaneFocus,
} from "../../workspace-layout/master-pane-focus";

export function useAppShellMasterShortcuts({
  masterVoiceShortcut,
  openVoiceCredentialSettingsFromMaster,
  platform,
  speechCaptureController,
}: {
  masterVoiceShortcut: AppearanceMasterVoiceShortcut;
  openVoiceCredentialSettingsFromMaster: () => void;
  platform: DesktopPlatform;
  speechCaptureController: AppShellSpeechCaptureController | null;
}) {
  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) {
        return;
      }
      if (isMasterVoiceShortcut(event, platform, masterVoiceShortcut)) {
        event.preventDefault();
        executeMasterVoiceCommand(speechCaptureController, openVoiceCredentialSettingsFromMaster);
        return;
      }
      if (isMasterPaneFocusShortcut(event)) {
        event.preventDefault();
        requestMasterPaneFocus("keyboard");
        return;
      }
      if (event.key === "Escape" && cancelMasterCaptureIfActive(speechCaptureController)) {
        event.preventDefault();
        return;
      }
    };
    const handleNativeViewKey = (event: WorkspaceBrowserViewKeyEvent) => {
      if (isMasterVoiceShortcut(event, platform, masterVoiceShortcut)) {
        executeMasterVoiceCommand(speechCaptureController, openVoiceCredentialSettingsFromMaster);
        return;
      }
      if (isMasterPaneFocusShortcut(event)) {
        requestMasterPaneFocus("native-key");
      }
    };
    const unsubscribeNativeViewKey =
      window.setta.workspaceNativeViews?.onBrowserViewKey(handleNativeViewKey) ?? (() => {});
    window.addEventListener("keydown", handleWindowKeyDown, { capture: true });
    return () => {
      unsubscribeNativeViewKey();
      window.removeEventListener("keydown", handleWindowKeyDown, { capture: true });
    };
  }, [
    masterVoiceShortcut,
    openVoiceCredentialSettingsFromMaster,
    platform,
    speechCaptureController,
  ]);
}
