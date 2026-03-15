import { useProjectState } from "state/definitions";
import type {
  UISettingRevealContent,
  UISettingRevealTarget,
} from "utils/generatedTypes";

export const DEFAULT_DURATION_MS = 3000;
export const MAX_DURATION_MS = 10000;
export const FIND_TARGET_INTERVAL_MS = 50;
export const WATCH_CODE_REVEAL_SETTING_IDS = new Set<string>([
  "core.watch_code.enabled",
  "core.watch_code.folders",
  "core.watch_code.files",
]);

export type UISettingRevealResultStatus = {
  settingId: string;
  status: "revealed" | "failed";
  errorCode: string | null;
  errorMessage: string | null;
};

export type UISettingRevealExecutionContext = {
  requestId: string;
  requestedProjectConfigId: string;
  socketGeneration: number;
  isSocketGenerationActive: () => boolean;
};

export function resolveRequestedActiveSectionId(
  requestedActiveSectionId: string | null | undefined,
): string | null {
  if (typeof requestedActiveSectionId !== "string") {
    return null;
  }
  const normalizedRequestedActiveSectionId = requestedActiveSectionId.trim();
  if (normalizedRequestedActiveSectionId === "") {
    return null;
  }
  return normalizedRequestedActiveSectionId;
}

export function buildProjectContextMismatchStatuses({
  reveals,
  requestedProjectConfigId,
  activeProjectConfigId,
}: {
  reveals: UISettingRevealContent["reveals"];
  requestedProjectConfigId: string;
  activeProjectConfigId: string;
}): Array<UISettingRevealResultStatus> {
  return reveals.map((target) => ({
    settingId: target.settingId,
    status: "failed",
    errorCode: "mutation_failed",
    errorMessage:
      "UI setting reveal project mismatch: requested project " +
      `${requestedProjectConfigId} but active project is ${activeProjectConfigId}.`,
  }));
}

export function buildExecutionContextMismatchStatuses({
  reveals,
  errorMessage,
}: {
  reveals: Array<UISettingRevealTarget>;
  errorMessage: string;
}): Array<UISettingRevealResultStatus> {
  return reveals.map((target) =>
    buildExecutionContextMismatchStatus(target.settingId, errorMessage),
  );
}

export function buildExecutionContextMismatchStatus(
  settingId: string,
  errorMessage: string,
): UISettingRevealResultStatus {
  return {
    settingId,
    status: "failed",
    errorCode: "mutation_failed",
    errorMessage,
  };
}

export function resolveRevealExecutionMismatch(
  executionContext: UISettingRevealExecutionContext | null,
): { message: string } | null {
  if (executionContext === null) {
    return null;
  }
  if (!executionContext.isSocketGenerationActive()) {
    return {
      message:
        "UI setting reveal execution context mismatch: websocket generation changed " +
        `before request ${executionContext.requestId} completed.`,
    };
  }
  const activeProjectConfigId = useProjectState
    .getState()
    .projectConfig.id.trim();
  if (activeProjectConfigId !== executionContext.requestedProjectConfigId) {
    return {
      message:
        "UI setting reveal execution context mismatch: requested project " +
        `${executionContext.requestedProjectConfigId} but active project is ` +
        `${activeProjectConfigId}.`,
    };
  }
  return null;
}

export function buildRevealDeadlineExceededStatus(
  settingId: string,
): UISettingRevealResultStatus {
  return {
    settingId,
    status: "failed",
    errorCode: "mutation_failed",
    errorMessage: `Reveal deadline exceeded before processing ${settingId}.`,
  };
}
