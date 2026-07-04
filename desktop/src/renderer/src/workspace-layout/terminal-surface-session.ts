import type { TerminalProfile } from "@generated/backend";

import type { SettaAPI } from "@shared/types";

type TerminalAPI = SettaAPI["terminal"];

export class TerminalStartDeferred extends Error {}

interface AttachOrCreateTerminalSessionOptions {
  allowExplicitProfileStart: boolean;
  cwdOverride: string;
  dimensions: { cols: number; rows: number };
  paneId: string;
  profile: TerminalProfile | null;
  profileId: string;
  sessionId: string | null;
  showDeferredProfileStart: (profile: TerminalProfile) => void;
  showStartingStatus: () => void;
  workspaceId: string;
}

export async function attachOrCreateTerminalSession(
  api: TerminalAPI,
  {
    allowExplicitProfileStart,
    cwdOverride,
    dimensions,
    paneId,
    profile,
    profileId,
    sessionId,
    showDeferredProfileStart,
    showStartingStatus,
    workspaceId,
  }: AttachOrCreateTerminalSessionOptions,
) {
  try {
    return await api.attach(workspaceId, paneId);
  } catch (error: unknown) {
    if (sessionId) {
      throw error;
    }
    if (profile && !profile.safeAutoStart && !allowExplicitProfileStart) {
      showDeferredProfileStart(profile);
      throw new TerminalStartDeferred("custom command profile requires explicit start");
    }
    showStartingStatus();
    return api.create(workspaceId, paneId, {
      cols: dimensions.cols,
      cwd: cwdOverride,
      profileId: profile?.id ?? profileId,
      rows: dimensions.rows,
    });
  }
}

export function terminalAPI(): TerminalAPI | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.setta?.terminal ?? null;
}
