import { requestOpenAIVoiceConnectionSettings } from "../stores/settings-navigation-store";
import { workspaceOpenPaneRequestEvent } from "../workspace-layout/open-pane-events";
import type { OpenPaneRequest } from "../workspace-layout/types";

const settingsPaneRequest = {
  surfaceKind: "settings-dom",
  title: "Settings",
  tone: "slate",
} satisfies OpenPaneRequest;

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
