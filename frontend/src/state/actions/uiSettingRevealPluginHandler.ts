import {
  invokePluginSettingRevealHandler,
  usePluginRuntimeStore,
} from "plugins/runtime";
import type { UISettingRevealTarget } from "utils/generatedTypes";

import { sleepForRevealPolling } from "./uiSettingRevealDom";
import {
  FIND_TARGET_INTERVAL_MS,
  resolveRevealExecutionMismatch,
  type UISettingRevealExecutionContext,
} from "./uiSettingRevealShared";

export type PluginRevealResult = {
  ok: boolean;
  errorMessage: string | null;
};

type PluginRevealHandlerOutcome =
  | { status: "handled"; message: null }
  | { status: "terminal_failure"; message: string };

export async function revealWithPluginHandler(
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

export async function invokePluginRevealHandlerWithinDeadline({
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
