import type {
  TerminalProfile,
  TerminalProfileInput,
  TerminalProfileList,
} from "@generated/backend";

import {
  defaultTerminalDisplaySettings,
  normalizeTerminalDisplaySettings,
  type TerminalDisplaySettings,
} from "./terminal-display-settings";
import type { WorkspacePane } from "./types";

const terminalProfilesChangedEvent = "setta:terminal-profiles-changed";

export function selectedProfileIdForPane(
  pane: WorkspacePane,
  profiles: TerminalProfileList,
): string {
  const paneProfileId = pane.terminalConfig?.profileId ?? "";
  return paneProfileId || profiles.defaultProfileId;
}

export function profileForPane(
  pane: WorkspacePane,
  profiles: TerminalProfileList,
): TerminalProfile | null {
  const selectedProfileId = selectedProfileIdForPane(pane, profiles);
  return profiles.profiles.find((profile) => profile.id === selectedProfileId) ?? null;
}

export function terminalProfileDisplaySettings(
  profile: TerminalProfile | null,
): TerminalDisplaySettings {
  if (!profile) {
    return defaultTerminalDisplaySettings;
  }
  return normalizeTerminalDisplaySettings({
    fontFamily: profile.fontFamily,
    fontSize: profile.fontSize,
    scrollback: profile.scrollback,
    themeId: profile.themeId,
  });
}

export function terminalProfileInput(profile: TerminalProfile): TerminalProfileInput {
  return {
    args: [...profile.args],
    cwd: profile.cwd,
    cwdMode: profile.cwdMode,
    env: { ...profile.env },
    fontFamily: profile.fontFamily,
    fontSize: profile.fontSize,
    launchMode: profile.launchMode,
    name: profile.name,
    scrollback: profile.scrollback,
    shellPath: profile.shellPath,
    themeId: profile.themeId,
  };
}

export function dispatchTerminalProfilesChanged(profiles: TerminalProfileList): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new window.CustomEvent<TerminalProfileList>(terminalProfilesChangedEvent, {
      detail: profiles,
    }),
  );
}

export function subscribeTerminalProfilesChanged(
  listener: (profiles: TerminalProfileList) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handler = (event: Event) => {
    if (typeof CustomEvent !== "undefined" && event instanceof CustomEvent) {
      listener(event.detail as TerminalProfileList);
    }
  };
  window.addEventListener(terminalProfilesChangedEvent, handler);
  return () => window.removeEventListener(terminalProfilesChangedEvent, handler);
}
