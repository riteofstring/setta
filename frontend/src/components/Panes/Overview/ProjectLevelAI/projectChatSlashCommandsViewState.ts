import { type AppGenerationMode } from "state/types/appGenerationMode";
import { EngineTypeEnum, type EngineConfig } from "utils/generatedTypes";

import {
  isAgentRunsAuthorityReady,
  type AgentNativeSlashCommandsEntry,
  type AgentRunsAuthorityState,
} from "./projectChatSkillsMcpViewerUtils";

export type CustomSlashCommandDraft = {
  command: string;
  prompt: string;
  appGenerationMode: AppGenerationMode | null;
};

export const EMPTY_CUSTOM_SLASH_COMMAND_DRAFT: CustomSlashCommandDraft = {
  command: "",
  prompt: "",
  appGenerationMode: null,
};

export const CUSTOM_SLASH_COMMAND_MODE_ITEMS = [
  { id: "plain_chat", name: "Plain chat" },
  { id: "json_render", name: "JSON Render" },
  { id: "json_render_with_image", name: "Image to JSON Render" },
  { id: "prompt_builder", name: "Prompt Builder" },
  { id: "mcp_server", name: "MCP Server" },
] as const;

export function getCustomSlashCommandModeLabel(
  mode: AppGenerationMode | null,
): string | null {
  const resolvedId = mode ?? "plain_chat";
  return (
    CUSTOM_SLASH_COMMAND_MODE_ITEMS.find((item) => item.id === resolvedId)
      ?.name ?? null
  );
}

function areCustomSlashCommandDraftsEqual(
  left: CustomSlashCommandDraft,
  right: CustomSlashCommandDraft,
): boolean {
  return (
    left.command === right.command &&
    left.prompt === right.prompt &&
    left.appGenerationMode === right.appGenerationMode
  );
}

function isEmptyCustomSlashCommandDraft(
  draft: CustomSlashCommandDraft,
): boolean {
  return areCustomSlashCommandDraftsEqual(
    draft,
    EMPTY_CUSTOM_SLASH_COMMAND_DRAFT,
  );
}

type ResolveCustomSlashDraftByProjectConfigIdUpdateInput = {
  customSlashDraftByProjectConfigId: Record<string, CustomSlashCommandDraft>;
  projectConfigId: string;
  nextDraft: CustomSlashCommandDraft;
};

export function resolveCustomSlashDraftByProjectConfigIdUpdate({
  customSlashDraftByProjectConfigId,
  projectConfigId,
  nextDraft,
}: ResolveCustomSlashDraftByProjectConfigIdUpdateInput): Record<
  string,
  CustomSlashCommandDraft
> | null {
  const currentDraft =
    customSlashDraftByProjectConfigId[projectConfigId] ??
    EMPTY_CUSTOM_SLASH_COMMAND_DRAFT;
  if (areCustomSlashCommandDraftsEqual(currentDraft, nextDraft)) {
    return null;
  }
  const nextByProjectConfigId = {
    ...customSlashDraftByProjectConfigId,
  };
  if (isEmptyCustomSlashCommandDraft(nextDraft)) {
    delete nextByProjectConfigId[projectConfigId];
  } else {
    nextByProjectConfigId[projectConfigId] = nextDraft;
  }
  return nextByProjectConfigId;
}

export function resolveAgentNativeSlashCommandsMessage(
  entry: AgentNativeSlashCommandsEntry,
): string {
  if (entry.status === "unknown" && entry.statusDetail) {
    return entry.statusDetail;
  }
  if (entry.status === "not_supported") {
    return (
      entry.statusDetail ??
      "This engine mode does not expose native slash command definitions."
    );
  }
  if (entry.status === "none") {
    return (
      entry.statusDetail ?? "This engine reported no native slash commands."
    );
  }
  if (entry.status === "error") {
    return entry.statusDetail
      ? `Native command metadata unavailable: ${entry.statusDetail}`
      : "Native command metadata unavailable for this engine.";
  }
  return (
    "No native commands discovered yet for this engine. Ask the agent for its " +
    "command list (for example, /help). This view auto-refreshes from agent run " +
    "metadata while this tab is selected."
  );
}

export function resolveAgentNativeSlashAuthorityDetail(
  agentRunsAuthorityState: AgentRunsAuthorityState,
): string | null {
  if (agentRunsAuthorityState === "loading") {
    return "Native command authority is still loading for this project.";
  }
  if (
    agentRunsAuthorityState === "transient_error" ||
    agentRunsAuthorityState === "terminal_error"
  ) {
    return "Native command metadata is unavailable until agent metadata reloads for this project.";
  }
  return null;
}

export function isCustomSlashNamespaceAuthorityReady({
  agentRunsAuthorityState,
  engineConfigsInitialLoadComplete,
  slashCommandsByEngine,
}: {
  agentRunsAuthorityState: AgentRunsAuthorityState;
  engineConfigsInitialLoadComplete: boolean;
  slashCommandsByEngine: Array<{ engineType: EngineConfig["engineType"] }>;
}): boolean {
  if (!engineConfigsInitialLoadComplete) {
    return false;
  }
  const hasExternalAgentEngine = slashCommandsByEngine.some(
    (entry) => entry.engineType === EngineTypeEnum.external_agent,
  );
  if (!hasExternalAgentEngine) {
    return true;
  }
  return isAgentRunsAuthorityReady(agentRunsAuthorityState);
}

export function resolveCanAddCustomSlashCommand({
  customSlashCommandTokens,
  namespaceAuthorityReady,
  newCustomSlashPrompt,
  normalizedNewCustomSlashCommand,
  reservedSlashCommandTokens,
}: {
  customSlashCommandTokens: Set<string>;
  namespaceAuthorityReady: boolean;
  newCustomSlashPrompt: string;
  normalizedNewCustomSlashCommand: string | null;
  reservedSlashCommandTokens: Set<string>;
}): boolean {
  if (!namespaceAuthorityReady) {
    return false;
  }
  if (!normalizedNewCustomSlashCommand) {
    return false;
  }
  if (!newCustomSlashPrompt.trim()) {
    return false;
  }
  if (reservedSlashCommandTokens.has(normalizedNewCustomSlashCommand)) {
    return false;
  }
  if (customSlashCommandTokens.has(normalizedNewCustomSlashCommand)) {
    return false;
  }
  return true;
}
