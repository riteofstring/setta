import type { HttpapiExternalAgentPreflightStatus } from "openapi/http";
import { EngineConfig, EngineTypeEnum } from "utils/generatedTypes";

type IdNameItem = { id: string; name: string };

type IdNameGroup = { group: string; items: Array<IdNameItem> };

type ExternalEngineStatus = {
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

function buildMissingExternalEngineStatus(issue: string): ExternalEngineStatus {
  return {
    status: "missing",
    issues: [issue],
    name: null,
  };
}

function buildResolvedExternalEngineStatus(
  status: HttpapiExternalAgentPreflightStatus,
): ExternalEngineStatus {
  const issues = status.supported
    ? [...status.issues]
    : ["External agent is not supported", ...status.issues];
  return {
    status: status.available && status.supported ? "available" : "unavailable",
    issues,
    name: status.name ?? null,
  };
}

function getLoadedExternalEngineStatus(
  externalConfigId: string,
  health: Array<HttpapiExternalAgentPreflightStatus>,
): ExternalEngineStatus {
  const status = health.find((entry) => entry.configId === externalConfigId);
  if (!status) {
    return buildMissingExternalEngineStatus("External agent config not found");
  }
  return buildResolvedExternalEngineStatus(status);
}

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
  health: Array<HttpapiExternalAgentPreflightStatus>,
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
    return buildMissingExternalEngineStatus("Missing external agent config id");
  }
  return getLoadedExternalEngineStatus(externalConfigId, health);
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

export function supportsThinkingExecutionControl(
  engineConfig: EngineConfig | null,
): boolean {
  if (!engineConfig) {
    return false;
  }
  if (engineConfig.engineType === EngineTypeEnum.external_agent) {
    return true;
  }
  return Boolean(engineConfig.runtimeSupport?.thinking);
}

export function resolveEffectiveThinking({
  engineConfig,
  requestedThinking,
}: {
  engineConfig: EngineConfig | null;
  requestedThinking: boolean;
}): boolean {
  if (!supportsThinkingExecutionControl(engineConfig)) {
    return false;
  }
  return requestedThinking;
}
