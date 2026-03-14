import {
  invokePluginSettingRevealHandler,
  usePluginRuntimeStore,
} from "plugins/runtime";
import { useProjectState } from "state/definitions";
import type {
  UISettingRevealContent,
  UISettingRevealTarget,
} from "utils/generatedTypes";
import {
  applyRevealHighlight,
  normalizeRevealDurationMs,
  scrollRevealAnchorIntoView,
  sleepForRevealPolling,
  waitForRevealAnchorElement,
} from "./uiSettingRevealDom";
import {
  applyRevealMutationsWithLease,
  finalizeRevealMutationLease,
  rollbackRevealMutationLease,
} from "./uiSettingRevealMutations";
import {
  FIND_TARGET_INTERVAL_MS,
  buildExecutionContextMismatchStatus,
  buildExecutionContextMismatchStatuses,
  buildProjectContextMismatchStatuses,
  buildRevealDeadlineExceededStatus,
  resolveRequestedActiveSectionId,
  resolveRevealExecutionMismatch,
  type UISettingRevealExecutionContext,
  type UISettingRevealResultStatus,
} from "./uiSettingRevealShared";

export type { UISettingRevealExecutionContext } from "./uiSettingRevealShared";

type PluginRevealResult = {
  ok: boolean;
  errorMessage: string | null;
};

type PluginRevealHandlerOutcome =
  | { status: "handled"; message: null }
  | { status: "terminal_failure"; message: string };

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

async function revealSingleSetting({
  target,
  durationMs,
  fallbackProjectConfigId,
  requestedActiveSectionId,
  executionContext,
}: {
  target: UISettingRevealTarget;
  durationMs: number;
  fallbackProjectConfigId: string;
  requestedActiveSectionId: string | null;
  executionContext: UISettingRevealExecutionContext | null;
}): Promise<UISettingRevealResultStatus> {
  const startMismatch = resolveRevealExecutionMismatch(executionContext);
  if (startMismatch !== null) {
    return buildExecutionContextMismatchStatus(
      target.settingId,
      startMismatch.message,
    );
  }

  const mutationResult = await applyRevealMutationsWithLease({
    target,
    fallbackProjectConfigId,
    requestedActiveSectionId,
    executionContext,
  });
  if (!mutationResult.ok) {
    return mutationResult.status;
  }

  const mutationLease = mutationResult.lease;
  let shouldRollbackMutationLease = true;
  try {
    const deadlineMs = Date.now() + durationMs;
    let pluginRevealErrorMessage: string | null = null;
    if (target.strategy === "plugin_handler") {
      const pluginRevealResult = await revealWithPluginHandler(
        target,
        deadlineMs,
        executionContext,
      );
      const postPluginRevealMismatch =
        resolveRevealExecutionMismatch(executionContext);
      if (postPluginRevealMismatch !== null) {
        return buildExecutionContextMismatchStatus(
          target.settingId,
          postPluginRevealMismatch.message,
        );
      }
      if (pluginRevealResult.ok) {
        shouldRollbackMutationLease = false;
        return {
          settingId: target.settingId,
          status: "revealed",
          errorCode: null,
          errorMessage: null,
        };
      }
      pluginRevealErrorMessage = pluginRevealResult.errorMessage;
    }

    if (target.anchorId === null || target.anchorId === undefined) {
      return {
        settingId: target.settingId,
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: pluginRevealErrorMessage
          ? `${pluginRevealErrorMessage} No fallback anchorId is available.`
          : `Setting ${target.settingId} is missing a reveal anchorId.`,
      };
    }

    const remainingMsForAnchor = deadlineMs - Date.now();
    if (remainingMsForAnchor <= 0) {
      return {
        settingId: target.settingId,
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: pluginRevealErrorMessage
          ? `${pluginRevealErrorMessage} Reveal deadline exceeded before fallback anchor lookup.`
          : `Reveal deadline exceeded before locating anchor for ${target.settingId}.`,
      };
    }

    const anchorElement = await waitForRevealAnchorElement({
      side: target.side,
      anchorId: target.anchorId,
      deadlineMs,
      executionContext,
    });
    const postAnchorLookupMismatch =
      resolveRevealExecutionMismatch(executionContext);
    if (postAnchorLookupMismatch !== null) {
      return buildExecutionContextMismatchStatus(
        target.settingId,
        postAnchorLookupMismatch.message,
      );
    }
    if (!anchorElement) {
      return {
        settingId: target.settingId,
        status: "failed",
        errorCode: "mutation_failed",
        errorMessage: pluginRevealErrorMessage
          ? `${pluginRevealErrorMessage} Fallback anchor was not found.`
          : `Could not find anchor ${target.anchorId} for ${target.settingId}.`,
      };
    }

    scrollRevealAnchorIntoView(anchorElement);
    applyRevealHighlight(anchorElement, durationMs);
    shouldRollbackMutationLease = false;
    return {
      settingId: target.settingId,
      status: "revealed",
      errorCode: null,
      errorMessage: null,
    };
  } finally {
    try {
      if (shouldRollbackMutationLease) {
        await rollbackRevealMutationLease(mutationLease);
      }
    } finally {
      await finalizeRevealMutationLease(mutationLease);
    }
  }
}

async function revealWithPluginHandler(
  target: UISettingRevealTarget,
  deadlineMs: number,
  executionContext: UISettingRevealExecutionContext | null,
): Promise<PluginRevealResult> {
  if (!target.pluginId || !target.pluginRevealKey) {
    return {
      ok: false,
      errorMessage: null,
    };
  }

  let latestErrorMessage: string | null = null;
  while (Date.now() <= deadlineMs) {
    const revealExecutionMismatch =
      resolveRevealExecutionMismatch(executionContext);
    if (revealExecutionMismatch !== null) {
      return {
        ok: false,
        errorMessage: revealExecutionMismatch.message,
      };
    }

    const remainingMs = deadlineMs - Date.now();
    if (remainingMs <= 0) {
      break;
    }

    const tabExists = usePluginRuntimeStore
      .getState()
      .sortedPaneTabs.some((tab) => tab.tabKey === target.overviewTabKey);
    if (tabExists) {
      const handlerResult = await invokePluginRevealHandlerWithinDeadline({
        target,
        durationMs: remainingMs,
      });
      if (handlerResult.status === "handled") {
        return {
          ok: true,
          errorMessage: null,
        };
      }
      latestErrorMessage = handlerResult.message;
      if (handlerResult.status === "terminal_failure") {
        break;
      }
    }

    const postIterationMismatch =
      resolveRevealExecutionMismatch(executionContext);
    if (postIterationMismatch !== null) {
      return {
        ok: false,
        errorMessage: postIterationMismatch.message,
      };
    }
    if (Date.now() >= deadlineMs) {
      break;
    }
    await sleepForRevealPolling(
      Math.min(FIND_TARGET_INTERVAL_MS, deadlineMs - Date.now()),
    );
  }

  if (latestErrorMessage === null) {
    latestErrorMessage = `Plugin pane for ${target.settingId} did not become available before reveal timeout.`;
  }
  return {
    ok: false,
    errorMessage: latestErrorMessage,
  };
}

async function invokePluginRevealHandlerWithinDeadline({
  target,
  durationMs,
}: {
  target: UISettingRevealTarget;
  durationMs: number;
}): Promise<PluginRevealHandlerOutcome> {
  const abortController = new AbortController();
  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<PluginRevealHandlerOutcome>((resolve) => {
    timeoutId = window.setTimeout(() => {
      abortController.abort();
      resolve({
        status: "terminal_failure",
        message: `Plugin reveal handler timed out for ${target.settingId}.`,
      });
    }, durationMs);
  });

  const handlerPromise = invokePluginSettingRevealHandler({
    pluginId: target.pluginId ?? "",
    revealKey: target.pluginRevealKey ?? "",
    settingId: target.settingId,
    paneId: target.paneId ?? null,
    durationMs,
    abortSignal: abortController.signal,
  })
    .then((result) => {
      if (result.ok) {
        return {
          status: "handled",
          message: null,
        } satisfies PluginRevealHandlerOutcome;
      }
      return {
        status: "terminal_failure",
        message: result.message ?? "Plugin reveal handler failed.",
      } satisfies PluginRevealHandlerOutcome;
    })
    .catch(() => ({
      status: "terminal_failure",
      message: "Plugin reveal handler failed.",
    }));

  const result = await Promise.race([handlerPromise, timeoutPromise]);
  if (timeoutId !== null) {
    window.clearTimeout(timeoutId);
  }
  return result;
}
