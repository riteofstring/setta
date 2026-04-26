import {
  callOpenAPI,
  getErrorDetail,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import { restartPlugins } from "openapi/http";
import type {
  PluginListEntry,
  PluginRestartCapability,
  PluginRestartResponse,
  PluginStatusEntry,
} from "utils/generatedTypes";

type PluginRestartActionPlan =
  | {
      mode: "programmatic";
      command: null;
      reason: null;
      message: null;
    }
  | {
      mode: "manual";
      command: string;
      reason: string | null;
      message: string;
    }
  | {
      mode: "unavailable";
      command: null;
      reason: null;
      message: string;
    };

type PluginRestartRequestResult =
  | {
      kind: "accepted";
    }
  | {
      kind: "manual_required";
      command: string;
      reason: string | null;
      message: string;
    }
  | {
      kind: "request_failed";
      message: string;
    };

export function getRestartRequiredPluginIds(
  pluginListEntries: PluginListEntry[],
  pluginStatusEntries: PluginStatusEntry[] = [],
): string[] {
  const idSet = new Set<string>();
  for (const plugin of pluginListEntries) {
    if (plugin.restartRequired) {
      idSet.add(plugin.pluginId);
    }
  }
  for (const plugin of pluginStatusEntries) {
    if (plugin.restartRequired) {
      idSet.add(plugin.pluginId);
    }
  }
  const ids = [...idSet];
  ids.sort((a, b) => a.localeCompare(b));
  return ids;
}

export function buildPluginRestartActionPlan(
  restartCapability: PluginRestartCapability | null,
): PluginRestartActionPlan {
  if (!restartCapability) {
    return {
      mode: "unavailable",
      command: null,
      reason: null,
      message: "Restart capability is unavailable. Run restart manually.",
    };
  }

  switch (restartCapability.mode) {
    case "programmatic":
      return {
        mode: "programmatic",
        command: null,
        reason: null,
        message: null,
      };
    case "manual": {
      const manualPlan = buildManualRestartPlan(
        restartCapability.command,
        restartCapability.reason,
      );

      return {
        mode: "manual",
        command: manualPlan.command,
        reason: manualPlan.reason,
        message: manualPlan.message,
      };
    }
    default:
      return assertUnexpectedRestartCapabilityMode(restartCapability.mode);
  }
}

function mapPluginRestartResponse(
  response: ResponseDataAndStatus<PluginRestartResponse>,
): PluginRestartRequestResult {
  if (!res200(response) || !response.data) {
    const detail =
      getErrorDetail(response.data) ?? getErrorDetail(response) ?? "";
    const message =
      detail.length > 0
        ? `Restart request failed: ${detail}`
        : "Restart request failed.";
    return {
      kind: "request_failed",
      message,
    };
  }
  if (response.data.accepted) {
    return {
      kind: "accepted",
    };
  }
  const manualPlan = buildManualRestartPlan(
    response.data.command,
    response.data.reason,
  );
  return {
    kind: "manual_required",
    command: manualPlan.command,
    reason: manualPlan.reason,
    message: manualPlan.message,
  };
}

export async function requestPluginRestart(
  runRestartRequest: () => Promise<
    ResponseDataAndStatus<PluginRestartResponse>
  > = () =>
    callOpenAPI(restartPlugins()) as Promise<
      ResponseDataAndStatus<PluginRestartResponse>
    >,
): Promise<PluginRestartRequestResult> {
  const response = await runRestartRequest();
  return mapPluginRestartResponse(response);
}

function assertUnexpectedRestartCapabilityMode(mode: never): never {
  throw new Error(`Unexpected plugin restart capability mode: ${mode}`);
}

function buildManualRestartPlan(
  commandRaw: string | null | undefined,
  reasonRaw: string | null | undefined,
): {
  command: string;
  reason: string | null;
  message: string;
} {
  const command = commandRaw?.trim() ? commandRaw : "setta";
  const reason = reasonRaw?.trim() ? reasonRaw : null;
  const message = reason
    ? `Manual restart required: ${command}. ${reason}`
    : `Manual restart required: ${command}`;
  return {
    command,
    reason,
    message,
  };
}
