import { useProjectState } from "state/definitions";
import type { UISettingRevealContent } from "utils/generatedTypes";

import { normalizeRevealDurationMs } from "./uiSettingRevealDom";
import { revealSingleSetting } from "./uiSettingRevealExecution";
import {
  buildExecutionContextMismatchStatuses,
  buildProjectContextMismatchStatuses,
  buildRevealDeadlineExceededStatus,
  resolveRequestedActiveSectionId,
  resolveRevealExecutionMismatch,
  type UISettingRevealExecutionContext,
  type UISettingRevealResultStatus,
} from "./uiSettingRevealShared";

export type { UISettingRevealExecutionContext } from "./uiSettingRevealShared";

export async function receiveUISettingReveal(
  content: UISettingRevealContent,
  executionContext: UISettingRevealExecutionContext | null = null,
): Promise<Array<UISettingRevealResultStatus>> {
  const requestedActiveSectionId = resolveRequestedActiveSectionId(
    content.activeSectionId,
  );
  const requestedProjectConfigId = content.projectConfigId.trim();
  const activeProjectConfigId = useProjectState
    .getState()
    .projectConfig.id.trim();
  if (requestedProjectConfigId !== activeProjectConfigId) {
    return buildProjectContextMismatchStatuses({
      reveals: content.reveals,
      requestedProjectConfigId,
      activeProjectConfigId,
    });
  }

  const initialExecutionMismatch =
    resolveRevealExecutionMismatch(executionContext);
  if (initialExecutionMismatch !== null) {
    return buildExecutionContextMismatchStatuses({
      reveals: content.reveals,
      errorMessage: initialExecutionMismatch.message,
    });
  }

  const durationMs = normalizeRevealDurationMs(content.durationMs);
  const deadlineMs = Date.now() + durationMs;
  const statuses: Array<UISettingRevealResultStatus> = [];
  for (const revealTarget of content.reveals) {
    const revealExecutionMismatch =
      resolveRevealExecutionMismatch(executionContext);
    if (revealExecutionMismatch !== null) {
      return [
        ...statuses,
        ...buildExecutionContextMismatchStatuses({
          reveals: content.reveals.slice(statuses.length),
          errorMessage: revealExecutionMismatch.message,
        }),
      ];
    }

    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) {
      statuses.push(buildRevealDeadlineExceededStatus(revealTarget.settingId));
      continue;
    }

    statuses.push(
      await revealSingleSetting({
        target: revealTarget,
        durationMs: remainingMs,
        fallbackProjectConfigId: content.projectConfigId,
        requestedActiveSectionId,
        executionContext,
      }),
    );
  }
  return statuses;
}
