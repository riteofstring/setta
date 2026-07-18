import { requestOpenAIVoiceConnectionSettings } from "../stores/settings-navigation-store";
import { workspaceOpenPaneRequestEvent } from "../workspace-layout/open-pane-events";
import { settingsPaneRequest } from "../workspace-layout/settings-pane-request";
import type { OpenPaneRequest } from "../workspace-layout/types";

export function openAIVoiceConnectionSettings(): void {
  requestOpenAIVoiceConnectionSettings();
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<OpenPaneRequest>(workspaceOpenPaneRequestEvent, {
      detail: settingsPaneRequest,
    }),
  );
}
