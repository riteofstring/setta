import type {
  PluginListEntry,
  PluginRestartCapability,
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
