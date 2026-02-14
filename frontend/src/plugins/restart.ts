import type {
  PluginListEntry,
  PluginRestartCapability,
} from "utils/generatedTypes";

export type PluginRestartActionPlan =
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

export function getRestartRequiredPluginIds(
  pluginListEntries: PluginListEntry[],
): string[] {
  const ids = pluginListEntries
    .filter((plugin) => plugin.restartRequired)
    .map((plugin) => plugin.pluginId);
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

  const mode = String(restartCapability.mode);
  if (mode === "programmatic") {
    return {
      mode: "programmatic",
      command: null,
      reason: null,
      message: null,
    };
  }

  const commandRaw = restartCapability.command?.trim();
  const command = commandRaw && commandRaw !== "" ? commandRaw : "setta";
  const reasonRaw = restartCapability.reason?.trim();
  const reason = reasonRaw && reasonRaw !== "" ? reasonRaw : null;
  const message = reason
    ? `Manual restart required: ${command}. ${reason}`
    : `Manual restart required: ${command}`;

  return {
    mode: "manual",
    command,
    reason,
    message,
  };
}
