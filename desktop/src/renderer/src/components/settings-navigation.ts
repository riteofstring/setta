import { requestOpenAIVoiceConnectionSettings } from "../stores/settings-navigation-store";
import {
  workspaceOpenPaneRequestEvent,
  type WorkspaceSurfaceOpenPaneRequest,
} from "../workspace-layout/open-pane-events";
import { settingsPaneRequest } from "../workspace-layout/settings-pane-request";

export function openAIVoiceConnectionSettings(): void {
  requestOpenAIVoiceConnectionSettings();
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<WorkspaceSurfaceOpenPaneRequest>(workspaceOpenPaneRequestEvent, {
      detail: settingsPaneRequest,
    }),
  );
}
