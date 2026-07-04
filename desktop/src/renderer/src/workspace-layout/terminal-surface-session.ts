import type { TerminalProfile } from "@generated/backend";

import type { SettaAPI } from "@shared/types";

type TerminalAPI = SettaAPI["terminal"];

export class TerminalStartDeferred extends Error {}
export class TerminalStartCancelled extends Error {}

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
  isCurrent?: () => boolean;
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
    isCurrent,
    workspaceId,
  }: AttachOrCreateTerminalSessionOptions,
) {
  assertTerminalStartCurrent(isCurrent);
  try {
    return await api.attach(workspaceId, paneId);
  } catch (error: unknown) {
    assertTerminalStartCurrent(isCurrent);
    if (sessionId) {
      throw error;
    }
    if (profile && !profile.safeAutoStart && !allowExplicitProfileStart) {
      showDeferredProfileStart(profile);
      throw new TerminalStartDeferred("custom command profile requires explicit start");
    }
    showStartingStatus();
    assertTerminalStartCurrent(isCurrent);
    return api.create(workspaceId, paneId, {
      cols: dimensions.cols,
      cwd: cwdOverride,
      profileId: profile?.id ?? profileId,
      rows: dimensions.rows,
    });
  }
}

function assertTerminalStartCurrent(isCurrent: (() => boolean) | undefined): void {
  if (isCurrent && !isCurrent()) {
    throw new TerminalStartCancelled("terminal surface is no longer current");
  }
}

export function terminalAPI(): TerminalAPI | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.setta?.terminal ?? null;
}
