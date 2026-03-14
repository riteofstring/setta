import {
  EngineConfig,
  EngineTypeEnum,
  ExternalAgentPreflightStatus,
} from "utils/generatedTypes";

type IdNameItem = { id: string; name: string };

type IdNameGroup = { group: string; items: Array<IdNameItem> };

export type ExternalEngineStatus = {
  status: "loading" | "missing" | "available" | "unavailable";
  issues: Array<string>;
  name: string | null;
};

type ChatPlaceholderOptions = {
  engineType: EngineTypeEnum | null;
  hasEngineConfig: boolean;
  hasLLMConfig: boolean;
  noLLMConfigsAvailable: boolean;
};

export function buildEngineGroups(
  engineConfigs: Array<EngineConfig>,
): Array<IdNameGroup> {
  const settaItems = engineConfigs
    .filter((config) => config.engineType === EngineTypeEnum.setta_llm)
    .map((config) => ({
      id: config.id,
      name: config.name?.trim() || "Setta LLM",
    }));
  const externalItems = engineConfigs
    .filter((config) => config.engineType === EngineTypeEnum.external_agent)
    .map((config) => ({
      id: config.id,
      name: config.name?.trim() || "External Agent",
    }));
  const groups: Array<IdNameGroup> = [];
  if (settaItems.length > 0) {
    groups.push({ group: "Setta Engines", items: settaItems });
  }
  if (externalItems.length > 0) {
    groups.push({ group: "External Agents", items: externalItems });
  }
  return groups;
}

export function getExternalEngineStatus(
  engineConfig: EngineConfig | null,
  health: Array<ExternalAgentPreflightStatus>,
  healthLoaded: boolean,
): ExternalEngineStatus | null {
  if (
    !engineConfig ||
    engineConfig.engineType !== EngineTypeEnum.external_agent
  ) {
    return null;
  }
  if (!healthLoaded) {
    return { status: "loading", issues: [], name: null };
  }
  const externalConfigId = engineConfig.externalAgentConfigId;
  if (!externalConfigId) {
    return {
      status: "missing",
      issues: ["Missing external agent config id"],
      name: null,
    };
  }
  const status =
    health.find((entry) => entry.configId === externalConfigId) ?? null;
  if (!status) {
    return {
      status: "missing",
      issues: ["External agent config not found"],
      name: null,
    };
  }
  const issues = [...status.issues];
  if (!status.supported) {
    issues.unshift("External agent is not supported");
  }
  if (!status.available || !status.supported) {
    return {
      status: "unavailable",
      issues,
      name: status.name ?? null,
    };
  }
  return { status: "available", issues, name: status.name ?? null };
}

export function getExternalEngineIssueMessage(
  externalEngineStatus: ExternalEngineStatus | null,
): string | null {
  if (!externalEngineStatus) {
    return null;
  }
  if (
    externalEngineStatus.status === "available" ||
    externalEngineStatus.status === "loading"
  ) {
    return null;
  }
  const unavailableLabel = externalEngineStatus.name
    ? `External engine "${externalEngineStatus.name}" unavailable`
    : "External engine unavailable";
  if (externalEngineStatus.issues.length === 0) {
    return unavailableLabel;
  }
  return `${unavailableLabel}: ${externalEngineStatus.issues.join("; ")}`;
}

export function getChatPlaceholderText(
  options: ChatPlaceholderOptions,
): string {
  if (!options.hasEngineConfig) {
    return "Select an engine";
  }
  if (options.engineType === EngineTypeEnum.external_agent) {
    return "Type a message...";
  }
  if (options.noLLMConfigsAvailable) {
    return "Add API key!";
  }
  if (!options.hasLLMConfig) {
    return "Select an LLM";
  }
  return "Type a message...";
}
