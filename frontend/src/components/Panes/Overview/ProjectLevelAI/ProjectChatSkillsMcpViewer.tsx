import * as Accordion from "@radix-ui/react-accordion";
import CodeMirror from "@uiw/react-codemirror";
import {
  buildChatSlashCommands,
  buildCustomPromptSlashCommandDefinitions,
  normalizeSlashCommandToken,
} from "components/Chat/chatComposerControls";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import {
  getAppGenSkillContent,
  getAppGenSkills,
  getMcpServerRuntimeStatus,
  revealPathInOsFileExplorer,
  upsertAppGenCustomSkill,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FiChevronDown, FiPlus, FiRefreshCw, FiSave } from "react-icons/fi";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadAgentRuns } from "state/actions/ai";
import { postChromeReproEvent } from "state/actions/chromeRepro";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  type ProjectChatCustomSlashCommand,
  useAIStore,
  useLocalStorage,
} from "state/definitions";
import {
  type AppGenerationMode,
  parseAppGenerationMode,
} from "state/types/appGenerationMode";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  AppGenerationModeEnum,
  type BaseChatMessageUnion,
  ChatAppGenerationMessageModeEnum,
  type EngineConfig,
  EngineTypeEnum,
  type SkillContent,
  type SkillEntry,
} from "utils/generatedTypes";
import { getSafeLocalStorageAdapter } from "utils/safeLocalStorage";
import { clamp } from "utils/utils";
import {
  type AgentNativeSlashCommandsEntry,
  type AgentRunsAuthorityState,
  buildReservedSlashCommandTokens,
  buildSkillStatusBySkillId,
  buildSlashCommandsByEngine,
  DEFAULT_AGENT_NATIVE_SLASH_COMMANDS_ENTRY,
  EMPTY_AGENT_NATIVE_COMMANDS,
  filterSkills,
  groupMcpServersByConfigPath,
  groupSkillsByRootPath,
  isAgentRunsAuthorityReady,
  type McpRuntimeServerStatus,
  reconcileCustomSlashCommands,
  resolveAgentNativeSlashCommandsByEngineId,
  resolveMcpServerStatus,
  resolveVisibleAgentNativeSlashCommandsByEngineId,
  toRuntimeStatusByServerId,
} from "./projectChatSkillsMcpViewerUtils";
import { selectCustomProjectChatSlashCommands } from "./projectChatSlashCommandSelectors";
type PathGroupHeaderProps = {
  title: string;
  path: string | null;
  onCopyPath: (path: string | null) => void;
  onRevealPath: (path: string | null) => void;
};
type ProjectChatSkillsMcpViewerProps = {
  projectConfigId: string;
  chatId: string | null | undefined;
  engineConfigId: string | null;
  engineType: EngineConfig["engineType"] | null;
  externalAgentToolType: string | null;
  viewMode: "skills" | "mcp" | "slash_commands";
};
const SKILL_MARKDOWN_VIEWER_STORAGE_KEY =
  "setta.projectChatSkillsMcpViewer.skillMarkdownViewerOpen";
const SKILL_MARKDOWN_VIEW_MODE_STORAGE_KEY =
  "setta.projectChatSkillsMcpViewer.skillMarkdownViewMode";
const SKILL_MARKDOWN_VIEWER_VALUE = "skill-markdown-viewer";
const SKILL_MARKDOWN_VIEW_MODE_RENDERED = "rendered";
const SKILL_MARKDOWN_VIEW_MODE_RAW = "raw";
const DEFAULT_SKILLS_LIST_HEIGHT_PCT = 66;
const MIN_SKILLS_LIST_HEIGHT_PCT = 30;
const MIN_SKILL_MARKDOWN_HEIGHT_PCT = 20;
const SKILL_MARKDOWN_RENDERED_CLASS =
  "prose prose-sm max-w-none dark:prose-invert prose-headings:my-2 prose-headings:font-semibold prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-code:before:hidden prose-code:after:hidden prose-pre:my-2 [&>:first-child]:mt-0 [&>:last-child]:mb-0";
type SkillMarkdownViewMode =
  | typeof SKILL_MARKDOWN_VIEW_MODE_RENDERED
  | typeof SKILL_MARKDOWN_VIEW_MODE_RAW;
type SkillContentLoadStatus = "idle" | "loading" | "loaded" | "error";
type ResizeListenerTarget = Pick<
  Window,
  "addEventListener" | "removeEventListener"
>;
type SkillMarkdownDraftStateEntry = {
  draft: string;
  loadedContent: string;
};
type CustomSlashCommandDraft = {
  command: string;
  prompt: string;
  appGenerationMode: AppGenerationMode | null;
};
const EMPTY_CUSTOM_SLASH_COMMAND_DRAFT: CustomSlashCommandDraft = {
  command: "",
  prompt: "",
  appGenerationMode: null,
};
const CUSTOM_SLASH_COMMAND_MODE_ITEMS = [
  {
    id: ChatAppGenerationMessageModeEnum.plain_chat,
    name: "Plain chat",
  },
  { id: AppGenerationModeEnum.json_render, name: "JSON Render" },
  {
    id: AppGenerationModeEnum.json_render_with_image,
    name: "Image to JSON Render",
  },
  {
    id: AppGenerationModeEnum.prompt_builder,
    name: "Prompt Builder",
  },
  { id: AppGenerationModeEnum.mcp_server, name: "MCP Server" },
] as const;
function getCustomSlashCommandModeLabel(
  mode: AppGenerationMode | null,
): string | null {
  const resolvedId = mode ?? ChatAppGenerationMessageModeEnum.plain_chat;
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
type ResolveSkillMarkdownRawDraftBySkillIdHydrationInput = {
  skillMarkdownDraftStateBySkillId: Record<
    string,
    SkillMarkdownDraftStateEntry
  >;
  skillId: string;
  skillContent: string;
};
type ResolveSkillMarkdownRawDraftBySkillIdUpdateInput = {
  skillMarkdownDraftStateBySkillId: Record<
    string,
    SkillMarkdownDraftStateEntry
  >;
  skillId: string;
  nextRawDraft: string;
};
type ResolveSkillMarkdownRawDraftBySkillIdReplaceInput = {
  skillMarkdownDraftStateBySkillId: Record<
    string,
    SkillMarkdownDraftStateEntry
  >;
  skillId: string;
  nextRawDraft: string;
};
type ResolveCustomSlashDraftByProjectConfigIdUpdateInput = {
  customSlashDraftByProjectConfigId: Record<string, CustomSlashCommandDraft>;
  projectConfigId: string;
  nextDraft: CustomSlashCommandDraft;
};
type SkillContentCacheEntry = {
  content: string;
  truncated: boolean;
  originalSizeBytes: number | null;
};
type SelectedSkillViewState = {
  selectedSkillId: string;
  selectedSkillContent: string;
  selectedSkillContentTruncated: boolean;
  selectedSkillOriginalSizeBytes: number | null;
};
type SkillGroup = ReturnType<typeof groupSkillsByRootPath>[number];
type McpServerGroup = ReturnType<typeof groupMcpServersByConfigPath>[number];
type SlashCommandsByEngineEntry = ReturnType<
  typeof buildSlashCommandsByEngine
>[number];
type SkillStatusBySkillId = ReturnType<typeof buildSkillStatusBySkillId>;
type SkillStatusEntry = SkillStatusBySkillId[string];
type CodeMirrorTheme = ReturnType<typeof useCodeMirrorStyle>;
type CodeMirrorExtensions = ReturnType<typeof getExtensions>;
function compareAppGenSkillEntries(
  first: SkillEntry,
  second: SkillEntry,
): number {
  const rootLabelComparison = first.rootLabel.localeCompare(second.rootLabel);
  if (rootLabelComparison !== 0) {
    return rootLabelComparison;
  }
  const relativePathComparison = first.relativePath.localeCompare(
    second.relativePath,
  );
  if (relativePathComparison !== 0) {
    return relativePathComparison;
  }
  return first.name.localeCompare(second.name);
}
export function upsertAppGenSkillEntry(
  skills: SkillEntry[],
  nextSkill: SkillEntry,
): SkillEntry[] {
  const existingIndex = skills.findIndex(
    (skill) => skill.skillId === nextSkill.skillId,
  );
  const nextSkills =
    existingIndex >= 0
      ? skills.map((skill, index) =>
          index === existingIndex ? nextSkill : skill,
        )
      : [...skills, nextSkill];
  return nextSkills.sort(compareAppGenSkillEntries);
}
export function resolveSkillMarkdownRawDraftBySkillIdHydration({
  skillMarkdownDraftStateBySkillId,
  skillId,
  skillContent,
}: ResolveSkillMarkdownRawDraftBySkillIdHydrationInput): Record<
  string,
  SkillMarkdownDraftStateEntry
> | null {
  const currentEntry = skillMarkdownDraftStateBySkillId[skillId];
  if (currentEntry) {
    if (currentEntry.loadedContent === skillContent) {
      return null;
    }
    if (currentEntry.draft !== currentEntry.loadedContent) {
      return {
        ...skillMarkdownDraftStateBySkillId,
        [skillId]: {
          ...currentEntry,
          loadedContent: skillContent,
        },
      };
    }
  }
  return {
    ...skillMarkdownDraftStateBySkillId,
    [skillId]: {
      draft: skillContent,
      loadedContent: skillContent,
    },
  };
}
export function resolveSkillMarkdownRawDraftBySkillIdReplace({
  skillMarkdownDraftStateBySkillId,
  skillId,
  nextRawDraft,
}: ResolveSkillMarkdownRawDraftBySkillIdReplaceInput): Record<
  string,
  SkillMarkdownDraftStateEntry
> | null {
  const currentEntry = skillMarkdownDraftStateBySkillId[skillId];
  if (
    currentEntry &&
    currentEntry.draft === nextRawDraft &&
    currentEntry.loadedContent === nextRawDraft
  ) {
    return null;
  }
  return {
    ...skillMarkdownDraftStateBySkillId,
    [skillId]: {
      draft: nextRawDraft,
      loadedContent: nextRawDraft,
    },
  };
}
export function resolveSelectedSkillViewStateAfterUpsertedSkillResponse({
  currentSelectedSkillId,
  requestSkillId,
  selectUpdatedSkill,
  skill,
  skillContent,
}: {
  currentSelectedSkillId: string | null;
  requestSkillId: string | null;
  selectUpdatedSkill: boolean;
  skill: SkillEntry;
  skillContent: SkillContent;
}): SelectedSkillViewState | null {
  if (!selectUpdatedSkill && currentSelectedSkillId !== requestSkillId) {
    return null;
  }
  return {
    selectedSkillId: skill.skillId,
    selectedSkillContent: skillContent.content,
    selectedSkillContentTruncated: skillContent.truncated,
    selectedSkillOriginalSizeBytes: skillContent.originalSizeBytes,
  };
}
export function resolveSkillMarkdownRawDraftBySkillIdUpdate({
  skillMarkdownDraftStateBySkillId,
  skillId,
  nextRawDraft,
}: ResolveSkillMarkdownRawDraftBySkillIdUpdateInput): Record<
  string,
  SkillMarkdownDraftStateEntry
> | null {
  const currentEntry = skillMarkdownDraftStateBySkillId[skillId];
  if (currentEntry?.draft === nextRawDraft) {
    return null;
  }
  return {
    ...skillMarkdownDraftStateBySkillId,
    [skillId]: {
      draft: nextRawDraft,
      loadedContent: currentEntry?.loadedContent ?? nextRawDraft,
    },
  };
}
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
function resolveAgentNativeSlashCommandsMessage(
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
function resolveAgentNativeSlashAuthorityDetail(
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
function isActionablePath(path: string | null): path is string {
  if (typeof path !== "string") {
    return false;
  }
  const normalizedPath = path.trim().toLowerCase();
  return normalizedPath !== "";
}
export function canCreateCustomSkill({
  customSkillCreateInFlight,
  customSkillCreateRootPath,
  newCustomSkillRelativePath,
}: {
  customSkillCreateInFlight: boolean;
  customSkillCreateRootPath: string | null;
  newCustomSkillRelativePath: string;
}): boolean {
  if (customSkillCreateInFlight) {
    return false;
  }
  if (!isActionablePath(customSkillCreateRootPath)) {
    return false;
  }
  return newCustomSkillRelativePath.trim() !== "";
}
export function isCustomSlashNamespaceAuthorityReady({
  agentRunsAuthorityState,
  engineConfigsInitialLoadComplete,
  slashCommandsByEngine,
}: {
  agentRunsAuthorityState: AgentRunsAuthorityState;
  engineConfigsInitialLoadComplete: boolean;
  slashCommandsByEngine: Array<{
    engineType: EngineConfig["engineType"];
  }>;
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
export function shouldLoadSlashCommandAgentRuns({
  viewMode,
  hasExternalAgentEngine,
}: {
  viewMode: ProjectChatSkillsMcpViewerProps["viewMode"];
  hasExternalAgentEngine: boolean;
}): boolean {
  if (viewMode !== "slash_commands") {
    return false;
  }
  if (!hasExternalAgentEngine) {
    return false;
  }
  return true;
}
export function resolveSkillPreviewContent({
  skillContentLoading,
  skillsLoading,
  selectedSkillId,
  skillContentLoadStatus,
  selectedSkillContent,
}: {
  skillContentLoading: boolean;
  skillsLoading: boolean;
  selectedSkillId: string | null;
  skillContentLoadStatus: SkillContentLoadStatus;
  selectedSkillContent: string;
}): string {
  if (skillContentLoading || (skillsLoading && !selectedSkillId)) {
    return "Loading skill content...";
  }
  if (skillContentLoadStatus === "error") {
    return "Skill content unavailable.";
  }
  if (selectedSkillId && skillContentLoadStatus === "loaded") {
    return selectedSkillContent;
  }
  return "Select a skill to preview SKILL.md.";
}
export function resolveRenderedSkillPreviewContent({
  skillPreviewContent,
  skillMarkdownRawDraft,
  selectedSkillId,
  skillContentLoadStatus,
}: {
  skillPreviewContent: string;
  skillMarkdownRawDraft: string | null;
  selectedSkillId: string | null;
  skillContentLoadStatus: SkillContentLoadStatus;
}): string {
  if (
    selectedSkillId &&
    skillContentLoadStatus === "loaded" &&
    skillMarkdownRawDraft !== null
  ) {
    return skillMarkdownRawDraft;
  }
  return skillPreviewContent;
}
function attachSkillsListResizeListeners(args: {
  target: ResizeListenerTarget;
  onMove: (event: PointerEvent) => void;
  onUp: (event: PointerEvent) => void;
}): () => void {
  const { target, onMove, onUp } = args;
  target.addEventListener("pointermove", onMove);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
  return () => {
    target.removeEventListener("pointermove", onMove);
    target.removeEventListener("pointerup", onUp);
    target.removeEventListener("pointercancel", onUp);
  };
}
function resolveProjectChatSkillsViewTestId(
  viewMode: ProjectChatSkillsMcpViewerProps["viewMode"],
): string {
  if (viewMode === "skills") {
    return "project-chat-skills-view";
  }
  if (viewMode === "mcp") {
    return "project-chat-mcp-view";
  }
  return "project-chat-slash-commands-view";
}
function selectChatMessagesForChat(args: {
  chatId: string | null | undefined;
  state: ReturnType<typeof useAIStore.getState>;
}): BaseChatMessageUnion[] | null {
  const { chatId, state } = args;
  if (!chatId) {
    return null;
  }
  const details = state.chatDetails[chatId];
  if (!details) {
    return null;
  }
  return details.messages;
}
function resolveMcpRuntimeStatusErrorMessage(detail: string | null): string {
  return detail ?? "Failed to load MCP runtime status.";
}
function resolveCustomSkillsRootDescription(args: {
  customSkillCreateRootActionable: boolean;
  customSkillCreateRootPath: string | null;
  skillsLoading: boolean;
}): string {
  const {
    customSkillCreateRootActionable,
    customSkillCreateRootPath,
    skillsLoading,
  } = args;
  if (!customSkillCreateRootPath) {
    return skillsLoading
      ? "Loading custom skills root..."
      : "Custom skills root unavailable.";
  }
  if (customSkillCreateRootActionable) {
    return `Custom skills root: ${customSkillCreateRootPath}`;
  }
  return `Custom skills root (not created yet): ${customSkillCreateRootPath}`;
}
function resolveSelectedCustomSkillSaveError(args: {
  selectedSkillEditabilityReason: string | null;
  selectedSkillContentTruncated: boolean;
  selectedSkillId: string | null;
  selectedSkillIsEditable: boolean;
  skillContentLoadError: string | null;
  skillContentLoadStatus: SkillContentLoadStatus;
  skillMarkdownRawDraft: string | null;
}): string | null {
  const {
    selectedSkillEditabilityReason,
    selectedSkillContentTruncated,
    selectedSkillId,
    selectedSkillIsEditable,
    skillContentLoadError,
    skillContentLoadStatus,
    skillMarkdownRawDraft,
  } = args;
  if (!selectedSkillId) {
    return null;
  }
  if (skillContentLoadStatus === "error") {
    return skillContentLoadError
      ? `Cannot save while skill content failed to load: ${skillContentLoadError}`
      : "Cannot save while skill content failed to load.";
  }
  if (skillContentLoadStatus !== "loaded" || skillMarkdownRawDraft === null) {
    return "Skill content is still loading.";
  }
  if (!selectedSkillIsEditable) {
    return (
      selectedSkillEditabilityReason ??
      "Selected skill is read-only. Create or pick a custom skill to edit."
    );
  }
  if (selectedSkillContentTruncated) {
    return "Cannot save while this skill preview is truncated.";
  }
  return null;
}
function resolveInitialSkillMarkdownViewerOpen(
  storageAdapter: ReturnType<typeof getSafeLocalStorageAdapter>,
): boolean {
  return storageAdapter.getItem(SKILL_MARKDOWN_VIEWER_STORAGE_KEY) === "true";
}
function resolveInitialSkillMarkdownViewMode(
  storageAdapter: ReturnType<typeof getSafeLocalStorageAdapter>,
): SkillMarkdownViewMode {
  return storageAdapter.getItem(SKILL_MARKDOWN_VIEW_MODE_STORAGE_KEY) ===
    SKILL_MARKDOWN_VIEW_MODE_RAW
    ? SKILL_MARKDOWN_VIEW_MODE_RAW
    : SKILL_MARKDOWN_VIEW_MODE_RENDERED;
}
function resolveSelectedSlashEngine(args: {
  selectedSlashEngineId: string | null;
  slashCommandsByEngine: SlashCommandsByEngineEntry[];
}): SlashCommandsByEngineEntry | null {
  const { selectedSlashEngineId, slashCommandsByEngine } = args;
  if (!selectedSlashEngineId) {
    return slashCommandsByEngine[0] ?? null;
  }
  return (
    slashCommandsByEngine.find(
      (entry) => entry.engineId === selectedSlashEngineId,
    ) ??
    slashCommandsByEngine[0] ??
    null
  );
}
function resolveSelectedAgentNativeSlashCommands(args: {
  selectedSlashEngine: SlashCommandsByEngineEntry | null;
  visibleAgentNativeSlashCommandsByEngineId: Record<
    string,
    AgentNativeSlashCommandsEntry
  >;
}): string[] {
  const { selectedSlashEngine, visibleAgentNativeSlashCommandsByEngineId } =
    args;
  if (
    !selectedSlashEngine ||
    selectedSlashEngine.engineType !== "external_agent"
  ) {
    return EMPTY_AGENT_NATIVE_COMMANDS;
  }
  return (
    visibleAgentNativeSlashCommandsByEngineId[selectedSlashEngine.engineId]
      ?.commands ?? EMPTY_AGENT_NATIVE_COMMANDS
  );
}
function resolveSelectedAgentNativeSlashStatus(args: {
  agentRunsAuthorityState: AgentRunsAuthorityState;
  selectedSlashEngine: SlashCommandsByEngineEntry | null;
  visibleAgentNativeSlashCommandsByEngineId: Record<
    string,
    AgentNativeSlashCommandsEntry
  >;
}): AgentNativeSlashCommandsEntry {
  const {
    agentRunsAuthorityState,
    selectedSlashEngine,
    visibleAgentNativeSlashCommandsByEngineId,
  } = args;
  if (
    !selectedSlashEngine ||
    selectedSlashEngine.engineType !== "external_agent"
  ) {
    return DEFAULT_AGENT_NATIVE_SLASH_COMMANDS_ENTRY;
  }
  const authorityDetail = resolveAgentNativeSlashAuthorityDetail(
    agentRunsAuthorityState,
  );
  if (authorityDetail) {
    return {
      ...DEFAULT_AGENT_NATIVE_SLASH_COMMANDS_ENTRY,
      statusDetail: authorityDetail,
    };
  }
  return (
    visibleAgentNativeSlashCommandsByEngineId[selectedSlashEngine.engineId] ??
    DEFAULT_AGENT_NATIVE_SLASH_COMMANDS_ENTRY
  );
}
function resolveSelectedSkill(
  skills: SkillEntry[],
  selectedSkillId: string | null,
): SkillEntry | null {
  if (!selectedSkillId) {
    return null;
  }
  return skills.find((skill) => skill.skillId === selectedSkillId) ?? null;
}
function resolveRawMarkdownModeHint(args: {
  selectedSkillContentTruncated: boolean;
  selectedSkillEditabilityReason: string | null;
  selectedSkillId: string | null;
  selectedSkillIsEditable: boolean;
  skillContentLoadStatus: SkillContentLoadStatus;
}): string {
  const {
    selectedSkillContentTruncated,
    selectedSkillEditabilityReason,
    selectedSkillId,
    selectedSkillIsEditable,
    skillContentLoadStatus,
  } = args;
  if (!selectedSkillId) {
    return "Read-only preview. Select a skill to edit.";
  }
  if (skillContentLoadStatus === "error") {
    return "Read-only preview. Resolve content loading errors before editing.";
  }
  if (skillContentLoadStatus !== "loaded") {
    return "Read-only preview. Skill content is still loading.";
  }
  if (!selectedSkillIsEditable) {
    return (
      selectedSkillEditabilityReason ??
      "Read-only preview. Select or create a custom skill to edit."
    );
  }
  if (selectedSkillContentTruncated) {
    return (
      "Preview is truncated. Full content loading is required before editing " +
      "or saving."
    );
  }
  return "Editing mode for custom skills.";
}
function resolveSaveSelectedSkillButtonTitle(args: {
  selectedSkillContentTruncated: boolean;
  selectedSkillEditabilityReason: string | null;
  selectedSkillId: string | null;
  selectedSkillIsEditable: boolean;
  skillContentLoadStatus: SkillContentLoadStatus;
}): string {
  const {
    selectedSkillContentTruncated,
    selectedSkillEditabilityReason,
    selectedSkillId,
    selectedSkillIsEditable,
    skillContentLoadStatus,
  } = args;
  if (!selectedSkillId) {
    return "Select a skill to edit.";
  }
  if (skillContentLoadStatus === "error") {
    return "Cannot save while skill content failed to load.";
  }
  if (skillContentLoadStatus !== "loaded") {
    return "Skill content is still loading.";
  }
  if (!selectedSkillIsEditable) {
    return (
      selectedSkillEditabilityReason ?? "Only custom skills can be edited."
    );
  }
  if (selectedSkillContentTruncated) {
    return "Cannot save a truncated preview.";
  }
  return "Save selected custom skill";
}
function resolveSkillPreviewTruncationNotice(args: {
  selectedSkillContentTruncated: boolean;
  selectedSkillOriginalSizeBytes: number | null;
}): string | null {
  const { selectedSkillContentTruncated, selectedSkillOriginalSizeBytes } =
    args;
  if (
    !selectedSkillContentTruncated ||
    selectedSkillOriginalSizeBytes === null
  ) {
    return null;
  }
  return `Preview truncated from ${selectedSkillOriginalSizeBytes.toLocaleString()} bytes.`;
}
function resolveCurrentCustomSlashDraft(args: {
  customSlashDraftByProjectConfigId: Record<string, CustomSlashCommandDraft>;
  projectConfigId: string;
}): CustomSlashCommandDraft {
  const { customSlashDraftByProjectConfigId, projectConfigId } = args;
  return (
    customSlashDraftByProjectConfigId[projectConfigId] ??
    EMPTY_CUSTOM_SLASH_COMMAND_DRAFT
  );
}
function resolveSkillMarkdownRawDraft(args: {
  selectedSkillId: string | null;
  skillMarkdownDraftStateBySkillId: Record<
    string,
    SkillMarkdownDraftStateEntry
  >;
}): string | null {
  const { selectedSkillId, skillMarkdownDraftStateBySkillId } = args;
  if (!selectedSkillId) {
    return null;
  }
  return skillMarkdownDraftStateBySkillId[selectedSkillId]?.draft ?? null;
}
function applySelectedSkillViewState(args: {
  nextSelectedSkillViewState: SelectedSkillViewState | null;
  setSelectedSkillContent: (value: string) => void;
  setSelectedSkillContentTruncated: (value: boolean) => void;
  setSelectedSkillId: (value: string | null) => void;
  setSelectedSkillOriginalSizeBytes: (value: number | null) => void;
  setSkillContentLoadError: (value: string | null) => void;
  setSkillContentLoadStatus: (value: SkillContentLoadStatus) => void;
}): void {
  const {
    nextSelectedSkillViewState,
    setSelectedSkillContent,
    setSelectedSkillContentTruncated,
    setSelectedSkillId,
    setSelectedSkillOriginalSizeBytes,
    setSkillContentLoadError,
    setSkillContentLoadStatus,
  } = args;
  if (!nextSelectedSkillViewState) {
    return;
  }
  setSelectedSkillId(nextSelectedSkillViewState.selectedSkillId);
  setSkillContentLoadStatus("loaded");
  setSkillContentLoadError(null);
  setSelectedSkillContent(nextSelectedSkillViewState.selectedSkillContent);
  setSelectedSkillContentTruncated(
    nextSelectedSkillViewState.selectedSkillContentTruncated,
  );
  setSelectedSkillOriginalSizeBytes(
    nextSelectedSkillViewState.selectedSkillOriginalSizeBytes,
  );
}
function resolveProjectChatViewerLoadingState(args: {
  allLLMConfigsInitialLoadComplete: boolean;
  mcpRuntimeStatusLoading: boolean;
  skillsCount: number;
  skillsLoading: boolean;
}): {
  mcpServersLoading: boolean;
  showSkillsLoadingState: boolean;
} {
  const {
    allLLMConfigsInitialLoadComplete,
    mcpRuntimeStatusLoading,
    skillsCount,
    skillsLoading,
  } = args;
  return {
    mcpServersLoading:
      !allLLMConfigsInitialLoadComplete || mcpRuntimeStatusLoading,
    showSkillsLoadingState: skillsLoading && skillsCount === 0,
  };
}
function resolveNextSelectedSlashEngineId(args: {
  selectedSlashEngineId: string | null;
  slashCommandsByEngine: SlashCommandsByEngineEntry[];
}): string | null {
  const { selectedSlashEngineId, slashCommandsByEngine } = args;
  if (slashCommandsByEngine.length === 0) {
    return null;
  }
  if (
    selectedSlashEngineId &&
    slashCommandsByEngine.some(
      (entry) => entry.engineId === selectedSlashEngineId,
    )
  ) {
    return selectedSlashEngineId;
  }
  return slashCommandsByEngine[0]?.engineId ?? null;
}
function runSkillsRefreshEffect(args: {
  refreshSkillsBrowser: () => Promise<void>;
  showSkillsSection: boolean;
}): void {
  const { refreshSkillsBrowser, showSkillsSection } = args;
  if (!showSkillsSection) {
    return;
  }
  void refreshSkillsBrowser();
}
function canEditSelectedSkillMarkdown(args: {
  selectedSkillContentTruncated: boolean;
  selectedSkillId: string | null;
  selectedSkillIsEditable: boolean;
  skillContentLoadStatus: SkillContentLoadStatus;
}): boolean {
  const {
    selectedSkillContentTruncated,
    selectedSkillId,
    selectedSkillIsEditable,
    skillContentLoadStatus,
  } = args;
  if (!selectedSkillId) {
    return false;
  }
  if (!selectedSkillIsEditable) {
    return false;
  }
  if (selectedSkillContentTruncated) {
    return false;
  }
  return skillContentLoadStatus === "loaded";
}
function resolveCanSaveSelectedSkill(args: {
  customSkillSaveInFlight: boolean;
  isRawMarkdownView: boolean;
  saveSelectedCustomSkillError: string | null;
  skillContentLoading: boolean;
  skillMarkdownEditable: boolean;
  skillMarkdownRawDraft: string | null;
}): boolean {
  const {
    customSkillSaveInFlight,
    isRawMarkdownView,
    saveSelectedCustomSkillError,
    skillContentLoading,
    skillMarkdownEditable,
    skillMarkdownRawDraft,
  } = args;
  return (
    skillMarkdownEditable &&
    isRawMarkdownView &&
    skillMarkdownRawDraft !== null &&
    !skillContentLoading &&
    !customSkillSaveInFlight &&
    saveSelectedCustomSkillError === null
  );
}
function PathGroupHeader({
  title,
  path,
  onCopyPath,
  onRevealPath,
}: PathGroupHeaderProps) {
  const actionablePath = isActionablePath(path);
  const displayPath = path && path.trim() ? path : "Unavailable";
  const iconButtonClassName =
    "grid h-5 w-5 place-items-center rounded text-setta-500 opacity-0 transition-all duration-150 group-hover/header:opacity-100 group-focus-within/header:opacity-100 hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200";
  return (
    <div className="group/header flex min-w-0 items-start justify-between gap-2 px-1 pb-1">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-setta-700 dark:text-setta-200">
          {title}
        </div>
        <div
          className="truncate font-mono text-[10px] text-setta-400 dark:text-setta-500"
          title={displayPath}
        >
          {displayPath}
        </div>
      </div>
      <div className="flex flex-none items-center gap-1">
        <button
          aria-label={`Copy path for ${title}`}
          title="Copy path"
          className={`${iconButtonClassName} cursor-pointer`}
          disabled={!actionablePath}
          onClick={() => onCopyPath(path)}
        >
          <i className="gg-file !scale-[0.55]" />
        </button>
        <button
          aria-label={`Reveal path for ${title}`}
          title="Reveal in OS file explorer"
          className={`${iconButtonClassName} cursor-pointer`}
          disabled={!actionablePath}
          onClick={() => onRevealPath(path)}
        >
          <i className="gg-folder !scale-[0.55]" />
        </button>
      </div>
    </div>
  );
}
type SkillListItemProps = {
  onSelectSkill: (skillId: string) => void;
  selectedSkillId: string | null;
  skill: SkillEntry;
  status: SkillStatusEntry;
};
type SkillStatusBadgesProps = {
  status: SkillStatusEntry;
};
function SkillApplicabilityBadge({ status }: SkillStatusBadgesProps) {
  if (!status?.isApplicable) {
    return null;
  }
  return (
    <span
      className="rounded border border-emerald-300 bg-emerald-50 px-1 py-[1px] text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      title={status.applicabilityReason ?? undefined}
    >
      Applicable
    </span>
  );
}
function SkillActivityBadge({ status }: SkillStatusBadgesProps) {
  if (status?.activityState === "active") {
    return (
      <span
        className="rounded border border-blue-300 bg-blue-50 px-1 py-[1px] text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
        title={
          status.activitySource
            ? `Detected from ${status.activitySource}`
            : "Skill invocation observed."
        }
      >
        Active
      </span>
    );
  }
  if (status?.activityState === "unknown") {
    return (
      <span
        className="rounded border border-amber-300 bg-amber-50 px-1 py-[1px] text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        title="Skill activity metadata is unavailable for this thread."
      >
        Unknown
      </span>
    );
  }
  return null;
}
function SkillStatusBadges({ status }: SkillStatusBadgesProps) {
  if (!status?.isApplicable && !status?.activityState) {
    return null;
  }
  return (
    <span className="mt-0.5 flex w-full min-w-0 items-center gap-1 text-[10px] font-semibold">
      <SkillApplicabilityBadge status={status} />
      <SkillActivityBadge status={status} />
    </span>
  );
}
function SkillListItem({
  onSelectSkill,
  selectedSkillId,
  skill,
  status,
}: SkillListItemProps) {
  const selected = skill.skillId === selectedSkillId;
  return (
    <button
      className={`flex w-full min-w-0 cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded py-1 pl-1 pr-2 text-left transition-colors ${
        selected
          ? "bg-setta-100 text-blue-700 dark:bg-setta-800/80 dark:text-blue-300"
          : "hover:bg-setta-100 dark:hover:bg-setta-800"
      }`}
      data-selected={selected ? "true" : "false"}
      onClick={() => onSelectSkill(skill.skillId)}
      type="button"
    >
      <span
        className="block w-full min-w-0 truncate font-semibold"
        data-testid="skills-mcp-skill-name"
        title={skill.name}
      >
        {skill.name}
      </span>
      <span
        className="block w-full min-w-0 truncate text-[11px] opacity-80"
        data-testid="skills-mcp-skill-path"
        title={skill.relativePath}
      >
        {skill.relativePath}
      </span>
      <SkillStatusBadges status={status} />
    </button>
  );
}
type McpSectionProps = {
  mcpServerGroups: McpServerGroup[];
  mcpRuntimeStatusByServerId: Record<string, McpRuntimeServerStatus> | null;
  mcpRuntimeStatusError: string | null;
  mcpRuntimeStatusLoading: boolean;
  mcpServersLoading: boolean;
  onCopyPath: (path: string | null) => void;
  onRevealPath: (path: string | null) => void;
};
function McpSection({
  mcpServerGroups,
  mcpRuntimeStatusByServerId,
  mcpRuntimeStatusError,
  mcpRuntimeStatusLoading,
  mcpServersLoading,
  onCopyPath,
  onRevealPath,
}: McpSectionProps) {
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      data-testid="project-chat-mcp-content"
    >
      <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-md p-2 text-[11px]">
        {mcpServersLoading ? (
          <div className="text-setta-500 dark:text-setta-400">
            Loading MCP servers...
          </div>
        ) : mcpServerGroups.length === 0 ? (
          <div className="text-setta-500 dark:text-setta-400">
            No MCP servers configured.
          </div>
        ) : (
          mcpServerGroups.map((group, groupIndex) => (
            <div
              key={`${group.configLabel}:${group.configPath ?? "unavailable"}`}
              className={groupIndex === 0 ? "" : "pt-2"}
            >
              <PathGroupHeader
                title={group.configLabel}
                path={group.configPath}
                onCopyPath={onCopyPath}
                onRevealPath={onRevealPath}
              />
              {mcpRuntimeStatusError ? (
                <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                  Runtime status check unavailable: {mcpRuntimeStatusError}
                </div>
              ) : null}
              <div className="mt-1 grid gap-1 border-t border-setta-200/80 px-1 pt-1 dark:border-setta-800">
                {group.servers.map((server) => {
                  const serverEndpointDisplay = `${server.transport} · ${server.endpoint}`;
                  const status = resolveMcpServerStatus({
                    serverId: server.serverId,
                    endpoint: server.endpoint,
                    runtimeStatusByServerId: mcpRuntimeStatusByServerId,
                    runtimeStatusLoading: mcpRuntimeStatusLoading,
                    runtimeStatusError: mcpRuntimeStatusError,
                  });
                  const statusDotClassName =
                    status.color === "green"
                      ? "bg-emerald-500"
                      : status.color === "yellow"
                        ? "bg-amber-500"
                        : "bg-red-500";
                  return (
                    <div
                      key={server.serverId}
                      className="min-w-0 pb-1 last:pb-0"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          aria-label={status.quickInfo}
                          className={`h-2 w-2 rounded-full ${statusDotClassName}`}
                          title={status.quickInfo}
                        />
                        <div
                          className="truncate font-semibold"
                          data-testid="skills-mcp-server-id"
                          title={`${server.serverId} - ${status.quickInfo}`}
                        >
                          {server.serverId}
                        </div>
                      </div>
                      <div
                        className="truncate font-mono text-setta-500 dark:text-setta-400"
                        data-testid="skills-mcp-server-endpoint"
                        title={serverEndpointDisplay}
                      >
                        {serverEndpointDisplay}
                      </div>
                      <div
                        className="truncate text-[10px] text-setta-500 dark:text-setta-400"
                        data-testid="skills-mcp-server-status"
                        title={status.quickInfo}
                      >
                        {status.quickInfo}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
type SkillGroupsPanelProps = {
  groupedSkills: SkillGroup[];
  isSkillMarkdownViewerOpen: boolean;
  onCopyPath: (path: string | null) => void;
  onRevealPath: (path: string | null) => void;
  onResetSkillsListHeight: () => void;
  onSelectSkill: (skillId: string) => void;
  selectedSkillId: string | null;
  showSkillsLoadingState: boolean;
  skillStatusBySkillId: SkillStatusBySkillId;
  skillsError: string | null;
  skillsListHeightPct: number;
  skillsSectionRef: RefObject<HTMLDivElement | null>;
  beginSkillsListResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
};
function SkillGroupsPanel({
  beginSkillsListResize,
  groupedSkills,
  isSkillMarkdownViewerOpen,
  onCopyPath,
  onRevealPath,
  onResetSkillsListHeight,
  onSelectSkill,
  selectedSkillId,
  showSkillsLoadingState,
  skillStatusBySkillId,
  skillsError,
  skillsListHeightPct,
  skillsSectionRef,
}: SkillGroupsPanelProps) {
  return (
    <div
      ref={skillsSectionRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <div
        className="min-h-0 min-w-0 overflow-auto rounded-md p-2 text-xs"
        data-testid="project-chat-skills-list-pane"
        style={
          isSkillMarkdownViewerOpen
            ? { flexBasis: `${skillsListHeightPct}%` }
            : undefined
        }
      >
        {skillsError ? (
          <div className="mb-2 rounded bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            Skills unavailable ({skillsError}).
          </div>
        ) : null}
        {showSkillsLoadingState ? (
          <div className="text-setta-500 dark:text-setta-400">
            Loading skills...
          </div>
        ) : groupedSkills.length === 0 ? (
          <div className="text-setta-500 dark:text-setta-400">
            No skills found.
          </div>
        ) : (
          groupedSkills.map((group, groupIndex) => (
            <div
              key={group.rootPath}
              className={groupIndex === 0 ? "" : "pt-2"}
            >
              <PathGroupHeader
                title={group.rootLabel}
                path={group.rootPath}
                onCopyPath={onCopyPath}
                onRevealPath={onRevealPath}
              />
              <div className="mt-1 grid gap-1 border-t border-setta-200/80 px-1 pt-1 dark:border-setta-800">
                {group.skills.map((skill) => (
                  <SkillListItem
                    key={skill.skillId}
                    onSelectSkill={onSelectSkill}
                    selectedSkillId={selectedSkillId}
                    skill={skill}
                    status={skillStatusBySkillId[skill.skillId]}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      {isSkillMarkdownViewerOpen ? (
        <div
          aria-label="Resize skill list and markdown viewer"
          className="group/resize relative flex h-3 cursor-row-resize items-center justify-center"
          data-testid="project-chat-skills-resize-handle"
          onDoubleClick={onResetSkillsListHeight}
          onPointerDown={beginSkillsListResize}
          role="separator"
        >
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-setta-200 group-hover/resize:bg-blue-400 dark:bg-setta-800 dark:group-hover/resize:bg-blue-400" />
          <div className="relative z-[1] h-1 w-10 rounded-full bg-setta-300/90 transition-colors group-hover/resize:bg-blue-400 dark:bg-setta-600 dark:group-hover/resize:bg-blue-400" />
        </div>
      ) : null}
    </div>
  );
}
type SkillMarkdownViewerPanelProps = {
  canSaveSelectedSkill: boolean;
  codeMirrorTheme: CodeMirrorTheme;
  editableMarkdownViewerExtensions: CodeMirrorExtensions;
  isOpen: boolean;
  isRawMarkdownView: boolean;
  onSaveSelectedCustomSkill: () => void;
  onSetSkillMarkdownViewerOpen: (isOpen: boolean) => void;
  onSelectSkillMarkdownViewMode: (mode: SkillMarkdownViewMode) => void;
  onSkillMarkdownDraftChange: (value: string) => void;
  rawMarkdownModeHint: string;
  readonlyMarkdownViewerExtensions: CodeMirrorExtensions;
  renderedSkillPreviewContent: string;
  saveSelectedSkillButtonTitle: string;
  skillContentLoadError: string | null;
  skillContentLoadStatus: SkillContentLoadStatus;
  skillMarkdownEditable: boolean;
  skillMarkdownRawDraft: string | null;
  skillPreviewContent: string;
  skillPreviewTruncationNotice: string | null;
};
type SkillMarkdownToolbarProps = {
  canSaveSelectedSkill: boolean;
  isRawMarkdownView: boolean;
  onSaveSelectedCustomSkill: () => void;
  onSelectSkillMarkdownViewMode: (mode: SkillMarkdownViewMode) => void;
  saveSelectedSkillButtonTitle: string;
};
function SkillMarkdownToolbar({
  canSaveSelectedSkill,
  isRawMarkdownView,
  onSaveSelectedCustomSkill,
  onSelectSkillMarkdownViewMode,
  saveSelectedSkillButtonTitle,
}: SkillMarkdownToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-setta-200/80 px-2 py-1 dark:border-setta-700/80">
      <div className="inline-flex items-center gap-1 rounded bg-setta-100/70 p-0.5 dark:bg-setta-900/80">
        <button
          className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
            !isRawMarkdownView
              ? "bg-setta-200 text-setta-800 dark:bg-setta-700 dark:text-setta-100"
              : "text-setta-500 hover:bg-setta-200 hover:text-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
          }`}
          data-testid="project-chat-skill-markdown-view-rendered"
          onClick={() =>
            onSelectSkillMarkdownViewMode(SKILL_MARKDOWN_VIEW_MODE_RENDERED)
          }
          type="button"
        >
          Rendered
        </button>
        <button
          className={`rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
            isRawMarkdownView
              ? "bg-setta-200 text-setta-800 dark:bg-setta-700 dark:text-setta-100"
              : "text-setta-500 hover:bg-setta-200 hover:text-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
          }`}
          data-testid="project-chat-skill-markdown-view-raw"
          onClick={() =>
            onSelectSkillMarkdownViewMode(SKILL_MARKDOWN_VIEW_MODE_RAW)
          }
          type="button"
        >
          Raw text
        </button>
      </div>
      <button
        className="inline-flex h-6 items-center gap-1 rounded px-2 text-[10px] font-semibold text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
        data-testid="project-chat-custom-skill-save"
        disabled={!canSaveSelectedSkill}
        onClick={onSaveSelectedCustomSkill}
        title={saveSelectedSkillButtonTitle}
        type="button"
      >
        <FiSave className="h-3 w-3" />
        Save
      </button>
    </div>
  );
}
type SkillMarkdownBodyProps = {
  codeMirrorTheme: CodeMirrorTheme;
  editableMarkdownViewerExtensions: CodeMirrorExtensions;
  isRawMarkdownView: boolean;
  onSkillMarkdownDraftChange: (value: string) => void;
  rawMarkdownModeHint: string;
  readonlyMarkdownViewerExtensions: CodeMirrorExtensions;
  renderedSkillPreviewContent: string;
  skillMarkdownEditable: boolean;
  skillMarkdownRawDraft: string | null;
  skillPreviewContent: string;
};
function SkillMarkdownBody({
  codeMirrorTheme,
  editableMarkdownViewerExtensions,
  isRawMarkdownView,
  onSkillMarkdownDraftChange,
  rawMarkdownModeHint,
  readonlyMarkdownViewerExtensions,
  renderedSkillPreviewContent,
  skillMarkdownEditable,
  skillMarkdownRawDraft,
  skillPreviewContent,
}: SkillMarkdownBodyProps) {
  if (!isRawMarkdownView) {
    return (
      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        <ReactMarkdown
          className={SKILL_MARKDOWN_RENDERED_CLASS}
          remarkPlugins={[remarkGfm]}
        >
          {renderedSkillPreviewContent}
        </ReactMarkdown>
      </div>
    );
  }
  return (
    <>
      <div className="px-2 py-1 text-[10px] text-setta-500 dark:text-setta-400">
        {rawMarkdownModeHint}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <CodeMirror
          aria-label="Skill Markdown Content"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            tabSize: 4,
          }}
          className="h-full text-xs [&_.cm-content]:text-xs [&_.cm-gutters]:text-xs"
          extensions={
            skillMarkdownEditable
              ? editableMarkdownViewerExtensions
              : readonlyMarkdownViewerExtensions
          }
          height="100%"
          onChange={onSkillMarkdownDraftChange}
          theme={codeMirrorTheme}
          value={skillMarkdownRawDraft ?? skillPreviewContent}
        />
      </div>
    </>
  );
}
function SkillMarkdownViewerPanel({
  canSaveSelectedSkill,
  codeMirrorTheme,
  editableMarkdownViewerExtensions,
  isOpen,
  isRawMarkdownView,
  onSaveSelectedCustomSkill,
  onSetSkillMarkdownViewerOpen,
  onSelectSkillMarkdownViewMode,
  onSkillMarkdownDraftChange,
  rawMarkdownModeHint,
  readonlyMarkdownViewerExtensions,
  renderedSkillPreviewContent,
  saveSelectedSkillButtonTitle,
  skillContentLoadError,
  skillContentLoadStatus,
  skillMarkdownEditable,
  skillMarkdownRawDraft,
  skillPreviewContent,
  skillPreviewTruncationNotice,
}: SkillMarkdownViewerPanelProps) {
  return (
    <div
      className={
        isOpen ? "min-h-[140px] min-w-0 flex-1 overflow-hidden" : "min-w-0"
      }
    >
      <Accordion.Root
        className={isOpen ? "h-full min-h-0" : ""}
        collapsible
        onValueChange={(value) =>
          onSetSkillMarkdownViewerOpen(value === SKILL_MARKDOWN_VIEWER_VALUE)
        }
        type="single"
        value={isOpen ? SKILL_MARKDOWN_VIEWER_VALUE : ""}
      >
        <Accordion.Item
          className={`rounded-lg border border-setta-200 bg-white/90 dark:border-setta-700 dark:bg-setta-950 ${isOpen ? "flex h-full min-h-0 flex-col" : ""}`}
          value={SKILL_MARKDOWN_VIEWER_VALUE}
        >
          <Accordion.Header>
            <Accordion.Trigger className="group box-border flex w-full cursor-pointer items-center justify-between gap-2 px-2 py-1 text-left">
              <span className="min-w-0 text-[11px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
                Skill Markdown Viewer
              </span>
              <FiChevronDown
                aria-hidden="true"
                className="h-3 w-3 shrink-0 text-setta-500 transition-transform duration-150 group-data-[state=open]:rotate-180 dark:text-setta-400"
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content
            className={`overflow-hidden data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown ${isOpen ? "min-h-0 flex-1" : ""}`}
          >
            {isOpen ? (
              <div className="flex h-full min-h-0 flex-col">
                {skillContentLoadStatus === "error" && skillContentLoadError ? (
                  <div
                    className="bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                    data-testid="project-chat-skill-content-error"
                  >
                    Failed to load skill content: {skillContentLoadError}
                  </div>
                ) : null}
                {skillPreviewTruncationNotice ? (
                  <div className="bg-amber-50 px-2 py-1 text-[11px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                    {skillPreviewTruncationNotice}
                  </div>
                ) : null}
                <SkillMarkdownToolbar
                  canSaveSelectedSkill={canSaveSelectedSkill}
                  isRawMarkdownView={isRawMarkdownView}
                  onSaveSelectedCustomSkill={onSaveSelectedCustomSkill}
                  onSelectSkillMarkdownViewMode={onSelectSkillMarkdownViewMode}
                  saveSelectedSkillButtonTitle={saveSelectedSkillButtonTitle}
                />
                <SkillMarkdownBody
                  codeMirrorTheme={codeMirrorTheme}
                  editableMarkdownViewerExtensions={
                    editableMarkdownViewerExtensions
                  }
                  isRawMarkdownView={isRawMarkdownView}
                  onSkillMarkdownDraftChange={onSkillMarkdownDraftChange}
                  rawMarkdownModeHint={rawMarkdownModeHint}
                  readonlyMarkdownViewerExtensions={
                    readonlyMarkdownViewerExtensions
                  }
                  renderedSkillPreviewContent={renderedSkillPreviewContent}
                  skillMarkdownEditable={skillMarkdownEditable}
                  skillMarkdownRawDraft={skillMarkdownRawDraft}
                  skillPreviewContent={skillPreviewContent}
                />
              </div>
            ) : null}
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    </div>
  );
}
type SkillsSectionProps = {
  beginSkillsListResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  canCreateCustomSkillButton: boolean;
  canSaveSelectedSkill: boolean;
  codeMirrorTheme: CodeMirrorTheme;
  customSkillCreateRootActionable: boolean;
  customSkillCreateRootPath: string | null;
  editableMarkdownViewerExtensions: CodeMirrorExtensions;
  groupedSkills: SkillGroup[];
  isRawMarkdownView: boolean;
  isSkillMarkdownViewerOpen: boolean;
  newCustomSkillRelativePath: string;
  onCopyPath: (path: string | null) => void;
  onCreateCustomSkill: () => void;
  onRefreshSkills: () => void;
  onRevealPath: (path: string | null) => void;
  onRevealCustomSkillRoot: () => void;
  onSelectSkill: (skillId: string) => void;
  onSetSkillMarkdownViewerOpen: (isOpen: boolean) => void;
  onSelectSkillMarkdownViewMode: (mode: SkillMarkdownViewMode) => void;
  onSetNewCustomSkillRelativePath: (value: string) => void;
  onSkillFilterChange: (value: string) => void;
  onSkillMarkdownDraftChange: (value: string) => void;
  onResetSkillsListHeight: () => void;
  onSaveSelectedCustomSkill: () => void;
  rawMarkdownModeHint: string;
  readonlyMarkdownViewerExtensions: CodeMirrorExtensions;
  renderedSkillPreviewContent: string;
  saveSelectedSkillButtonTitle: string;
  selectedSkillId: string | null;
  showSkillsLoadingState: boolean;
  skillContentLoadError: string | null;
  skillContentLoadStatus: SkillContentLoadStatus;
  skillFilter: string;
  skillMarkdownEditable: boolean;
  skillMarkdownRawDraft: string | null;
  skillPreviewContent: string;
  skillPreviewTruncationNotice: string | null;
  skillStatusBySkillId: SkillStatusBySkillId;
  skillsError: string | null;
  skillsListHeightPct: number;
  skillsLoading: boolean;
  skillsSectionRef: RefObject<HTMLDivElement | null>;
};
function SkillsSection({
  beginSkillsListResize,
  canCreateCustomSkillButton,
  canSaveSelectedSkill,
  codeMirrorTheme,
  customSkillCreateRootActionable,
  customSkillCreateRootPath,
  editableMarkdownViewerExtensions,
  groupedSkills,
  isRawMarkdownView,
  isSkillMarkdownViewerOpen,
  newCustomSkillRelativePath,
  onCopyPath,
  onCreateCustomSkill,
  onRefreshSkills,
  onRevealPath,
  onRevealCustomSkillRoot,
  onSelectSkill,
  onSetSkillMarkdownViewerOpen,
  onSelectSkillMarkdownViewMode,
  onSetNewCustomSkillRelativePath,
  onSkillFilterChange,
  onSkillMarkdownDraftChange,
  onResetSkillsListHeight,
  onSaveSelectedCustomSkill,
  rawMarkdownModeHint,
  readonlyMarkdownViewerExtensions,
  renderedSkillPreviewContent,
  saveSelectedSkillButtonTitle,
  selectedSkillId,
  showSkillsLoadingState,
  skillContentLoadError,
  skillContentLoadStatus,
  skillFilter,
  skillMarkdownEditable,
  skillMarkdownRawDraft,
  skillPreviewContent,
  skillPreviewTruncationNotice,
  skillStatusBySkillId,
  skillsError,
  skillsListHeightPct,
  skillsLoading,
  skillsSectionRef,
}: SkillsSectionProps) {
  const customSkillsRootDescription = resolveCustomSkillsRootDescription({
    customSkillCreateRootActionable,
    customSkillCreateRootPath,
    skillsLoading,
  });
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
      data-testid="project-chat-skills-content"
    >
      <div className="grid gap-2">
        <search className="relative flex min-w-0 items-center gap-1">
          <div className="absolute left-0 grid select-none place-items-center pl-1">
            <i className="gg-sort-az !scale-75 text-setta-600 dark:text-setta-400" />
          </div>
          <input
            aria-label="Filter skills"
            className="min-w-0 flex-grow cursor-text truncate rounded bg-setta-100/70 py-1 pl-5 text-sm text-setta-700 placeholder-setta-400 outline-0 focus-visible:ring-1 focus-visible:ring-blue-300 dark:bg-setta-900/80 dark:text-setta-200 dark:placeholder-setta-700 dark:focus-visible:ring-blue-500"
            onChange={(event) => onSkillFilterChange(event.target.value)}
            placeholder="Filter"
            value={skillFilter}
          />
          <button
            aria-label="Refresh"
            className="grid h-7 w-7 shrink-0 place-items-center rounded text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
            data-testid="project-chat-skills-refresh"
            disabled={skillsLoading}
            onClick={onRefreshSkills}
            title="Refresh skills"
            type="button"
          >
            <FiRefreshCw
              className={`h-3.5 w-3.5 ${skillsLoading ? "animate-spin" : ""}`}
            />
          </button>
        </search>
        <div className="flex min-w-0 items-center gap-1">
          <input
            aria-label="New custom skill name"
            className="min-w-0 flex-1 cursor-text truncate rounded bg-setta-100/70 px-2 py-1 text-xs text-setta-700 placeholder-setta-400 outline-0 focus-visible:ring-1 focus-visible:ring-blue-300 dark:bg-setta-900/80 dark:text-setta-200 dark:placeholder-setta-700 dark:focus-visible:ring-blue-500"
            data-testid="project-chat-custom-skill-relative-path-input"
            onChange={(event) =>
              onSetNewCustomSkillRelativePath(event.target.value)
            }
            placeholder="new-custom-skill"
            value={newCustomSkillRelativePath}
          />
          <button
            aria-label="Create custom skill"
            className="grid h-7 w-7 shrink-0 place-items-center rounded text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-200"
            data-testid="project-chat-custom-skill-create"
            disabled={!canCreateCustomSkillButton}
            onClick={onCreateCustomSkill}
            title="Create custom skill"
            type="button"
          >
            <FiPlus className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2 px-1 text-[10px] text-setta-500 dark:text-setta-400">
          <span
            className="truncate"
            data-testid="project-chat-custom-skill-root-path"
            title={
              customSkillCreateRootPath ??
              "Custom skill create root unavailable."
            }
          >
            {customSkillsRootDescription}
          </span>
          <button
            className="shrink-0 rounded px-1 py-0.5 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-setta-800 dark:hover:text-setta-200"
            data-testid="project-chat-custom-skill-root-reveal"
            disabled={
              !customSkillCreateRootActionable ||
              !isActionablePath(customSkillCreateRootPath)
            }
            onClick={onRevealCustomSkillRoot}
            type="button"
          >
            Open
          </button>
        </div>
      </div>
      <SkillGroupsPanel
        beginSkillsListResize={beginSkillsListResize}
        groupedSkills={groupedSkills}
        isSkillMarkdownViewerOpen={isSkillMarkdownViewerOpen}
        onCopyPath={onCopyPath}
        onRevealPath={onRevealPath}
        onResetSkillsListHeight={onResetSkillsListHeight}
        onSelectSkill={onSelectSkill}
        selectedSkillId={selectedSkillId}
        showSkillsLoadingState={showSkillsLoadingState}
        skillStatusBySkillId={skillStatusBySkillId}
        skillsError={skillsError}
        skillsListHeightPct={skillsListHeightPct}
        skillsSectionRef={skillsSectionRef}
      />
      <SkillMarkdownViewerPanel
        canSaveSelectedSkill={canSaveSelectedSkill}
        codeMirrorTheme={codeMirrorTheme}
        editableMarkdownViewerExtensions={editableMarkdownViewerExtensions}
        isOpen={isSkillMarkdownViewerOpen}
        isRawMarkdownView={isRawMarkdownView}
        onSaveSelectedCustomSkill={onSaveSelectedCustomSkill}
        onSetSkillMarkdownViewerOpen={onSetSkillMarkdownViewerOpen}
        onSelectSkillMarkdownViewMode={onSelectSkillMarkdownViewMode}
        onSkillMarkdownDraftChange={onSkillMarkdownDraftChange}
        rawMarkdownModeHint={rawMarkdownModeHint}
        readonlyMarkdownViewerExtensions={readonlyMarkdownViewerExtensions}
        renderedSkillPreviewContent={renderedSkillPreviewContent}
        saveSelectedSkillButtonTitle={saveSelectedSkillButtonTitle}
        skillContentLoadError={skillContentLoadError}
        skillContentLoadStatus={skillContentLoadStatus}
        skillMarkdownEditable={skillMarkdownEditable}
        skillMarkdownRawDraft={skillMarkdownRawDraft}
        skillPreviewContent={skillPreviewContent}
        skillPreviewTruncationNotice={skillPreviewTruncationNotice}
      />
    </section>
  );
}
type CustomSlashCommandsPanelProps = {
  addCustomProjectChatSlashCommand: () => void;
  canAddCustomSlashCommand: boolean;
  conflictingCustomSlashCommandTokens: Set<string>;
  customSlashCommandDefinitions: ReturnType<
    typeof buildCustomPromptSlashCommandDefinitions
  >;
  customSlashNamespaceAuthorityReady: boolean;
  newCustomSlashAppGenerationMode: AppGenerationMode | null;
  newCustomSlashCommand: string;
  newCustomSlashPrompt: string;
  onRemoveCustomProjectChatSlashCommand: (commandToken: string) => void;
  onSetNewCustomSlashAppGenerationMode: (mode: string | null) => void;
  onSetNewCustomSlashCommand: (value: string) => void;
  onSetNewCustomSlashPrompt: (value: string) => void;
};
function CustomSlashCommandsPanel({
  addCustomProjectChatSlashCommand,
  canAddCustomSlashCommand,
  conflictingCustomSlashCommandTokens,
  customSlashCommandDefinitions,
  customSlashNamespaceAuthorityReady,
  newCustomSlashAppGenerationMode,
  newCustomSlashCommand,
  newCustomSlashPrompt,
  onRemoveCustomProjectChatSlashCommand,
  onSetNewCustomSlashAppGenerationMode,
  onSetNewCustomSlashCommand,
  onSetNewCustomSlashPrompt,
}: CustomSlashCommandsPanelProps) {
  return (
    <div className="grid min-w-0 gap-2 rounded bg-setta-50/60 p-2 dark:bg-setta-950/40">
      <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
        Custom Commands
      </div>
      <div className="grid min-w-0 gap-2 px-1">
        <input
          type="text"
          value={newCustomSlashCommand}
          onChange={(event) => onSetNewCustomSlashCommand(event.target.value)}
          placeholder="/my-command"
          className="w-full rounded border border-setta-300 bg-transparent px-2 py-1 text-[11px] text-setta-700 outline-none transition-colors focus:border-blue-500 dark:border-setta-700 dark:text-setta-100 dark:focus:border-blue-400"
          data-testid="project-chat-custom-slash-command-input"
        />
        <IdNameCombobox
          allItems={[
            {
              groupName: "Submission mode",
              items: CUSTOM_SLASH_COMMAND_MODE_ITEMS.map((item) => ({
                id: item.id,
                name: item.name,
              })),
            },
          ]}
          value={
            newCustomSlashAppGenerationMode ??
            ChatAppGenerationMessageModeEnum.plain_chat
          }
          small={false}
          onSelectedItemChange={onSetNewCustomSlashAppGenerationMode}
          placeholder="Select a submission mode"
          outerDivClasses="w-full"
          inputDivId="project-chat-custom-slash-mode-input"
        />
        <textarea
          value={newCustomSlashPrompt}
          onChange={(event) => onSetNewCustomSlashPrompt(event.target.value)}
          placeholder="Prompt text to send when this command runs."
          className="min-h-20 w-full resize-y rounded border border-setta-300 bg-transparent px-2 py-1 text-[11px] text-setta-700 outline-none transition-colors focus:border-blue-500 dark:border-setta-700 dark:text-setta-100 dark:focus:border-blue-400"
          data-testid="project-chat-custom-slash-prompt-input"
        />
        <button
          type="button"
          className="inline-flex w-fit cursor-pointer items-center rounded border border-setta-300 px-2 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:border-setta-500 hover:text-setta-800 disabled:cursor-not-allowed disabled:opacity-40 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
          data-testid="project-chat-custom-slash-add"
          onClick={addCustomProjectChatSlashCommand}
          disabled={!canAddCustomSlashCommand}
        >
          Add slash command
        </button>
        <div className="text-[10px] text-setta-500 dark:text-setta-400">
          {customSlashNamespaceAuthorityReady
            ? "Command names must be unique and cannot collide with built-in or discovered agent-native commands."
            : "Command names stay disabled until native command authority is loaded for this project."}
        </div>
      </div>
      {customSlashCommandDefinitions.length > 0 ? (
        <div className="grid min-w-0 gap-1">
          {customSlashCommandDefinitions.map((command) => {
            const hasCollision = conflictingCustomSlashCommandTokens.has(
              command.command,
            );
            const modeLabel = getCustomSlashCommandModeLabel(
              command.appGenerationMode ?? null,
            );
            return (
              <div
                key={command.command}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded px-1 py-1 hover:bg-setta-100 dark:hover:bg-setta-800"
              >
                <div className="min-w-0">
                  <div
                    className="truncate font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300"
                    data-testid="project-chat-custom-slash-command"
                  >
                    {command.command}
                  </div>
                  <div className="min-w-0 break-words text-[10px] text-setta-600 dark:text-setta-300">
                    {command.promptTemplate}
                  </div>
                  {modeLabel ? (
                    <div className="mt-0.5 text-[10px] text-setta-500 dark:text-setta-400">
                      Submits as {modeLabel}.
                    </div>
                  ) : null}
                  {hasCollision ? (
                    <div
                      className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-300"
                      data-testid="project-chat-custom-slash-command-conflict"
                    >
                      Disabled due to command collision.
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="inline-flex h-6 cursor-pointer items-center rounded border border-setta-300 px-2 text-[10px] font-semibold text-setta-600 transition-colors hover:border-setta-500 hover:text-setta-800 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100"
                  data-testid="project-chat-custom-slash-remove"
                  onClick={() =>
                    onRemoveCustomProjectChatSlashCommand(command.command)
                  }
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-1 text-[10px] text-setta-500 dark:text-setta-400">
          No custom slash commands yet.
        </div>
      )}
    </div>
  );
}
type SlashEngineCommandsPanelProps = {
  engineConfigsInitialLoadComplete: boolean;
  onSelectSlashEngine: (engineId: string) => void;
  selectedAgentNativeSlashCommands: string[];
  selectedAgentNativeSlashStatus: AgentNativeSlashCommandsEntry;
  selectedSlashEngine: SlashCommandsByEngineEntry | null;
  slashCommandsByEngine: SlashCommandsByEngineEntry[];
};
function SlashEngineCommandsPanel({
  engineConfigsInitialLoadComplete,
  onSelectSlashEngine,
  selectedAgentNativeSlashCommands,
  selectedAgentNativeSlashStatus,
  selectedSlashEngine,
  slashCommandsByEngine,
}: SlashEngineCommandsPanelProps) {
  if (!engineConfigsInitialLoadComplete) {
    return (
      <div className="p-1 text-[11px] text-setta-500 dark:text-setta-400">
        Loading engine commands...
      </div>
    );
  }
  if (slashCommandsByEngine.length === 0) {
    return (
      <div className="rounded bg-setta-100/70 px-2 py-1 text-[10px] text-setta-600 dark:bg-setta-900/80 dark:text-setta-300">
        No engines configured.
      </div>
    );
  }
  return (
    <>
      <div className="flex min-w-0 gap-1 overflow-x-auto">
        {slashCommandsByEngine.map((engine) => {
          const selected = selectedSlashEngine?.engineId === engine.engineId;
          return (
            <button
              key={engine.engineId}
              type="button"
              data-testid="skills-mcp-slash-tab"
              className={`box-border min-w-0 cursor-pointer rounded px-2 py-1 text-left transition-colors ${
                selected
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/35 dark:text-blue-300"
                  : "text-setta-600 hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800"
              }`}
              title={engine.engineName}
              onClick={() => onSelectSlashEngine(engine.engineId)}
            >
              <span className="block truncate font-semibold">
                {engine.engineName}
              </span>
              <span className="block truncate text-[10px] uppercase tracking-wide opacity-80">
                {engine.engineType === "external_agent"
                  ? "External Agent"
                  : "Setta LLM"}
              </span>
            </button>
          );
        })}
      </div>
      <div
        className="min-h-0 min-w-0 flex-1 overflow-auto p-1 text-[11px]"
        data-testid="skills-mcp-slash-list-pane"
      >
        <div className="grid min-w-0 gap-3">
          <div className="grid min-w-0 gap-1">
            <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
              Setta Chat Commands
            </div>
            {selectedSlashEngine?.commands.map((command) => (
              <div
                key={`${selectedSlashEngine.engineId}:${command.command}`}
                className="min-w-0 rounded px-1 py-1 hover:bg-setta-100 dark:hover:bg-setta-800"
              >
                <div
                  className="font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300"
                  data-testid="skills-mcp-slash-command"
                >
                  {command.command}
                </div>
                <div className="min-w-0 text-setta-600 dark:text-setta-300">
                  {command.summary}
                </div>
              </div>
            ))}
          </div>
          {selectedSlashEngine?.engineType === "external_agent" ? (
            <div className="grid min-w-0 gap-2">
              <div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
                Agent-Native Commands
              </div>
              {selectedAgentNativeSlashCommands.length > 0 ? (
                <div className="grid min-w-0 gap-1">
                  {selectedAgentNativeSlashCommands.map((command) => (
                    <div
                      key={`${selectedSlashEngine.engineId}:agent:${command}`}
                      className="min-w-0 rounded px-1 py-1 hover:bg-setta-100 dark:hover:bg-setta-800"
                      data-testid="skills-mcp-agent-slash-command"
                    >
                      <div className="truncate font-mono text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                        {command}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded bg-setta-100/70 px-2 py-1 text-[10px] text-setta-600 dark:bg-setta-900/80 dark:text-setta-300">
                  {resolveAgentNativeSlashCommandsMessage(
                    selectedAgentNativeSlashStatus,
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded bg-setta-100/70 px-2 py-1 text-[10px] text-setta-600 dark:bg-setta-900/80 dark:text-setta-300">
              Agent-native slash commands apply to external agents. Select an
              external engine tab to view discovered metadata.
            </div>
          )}
        </div>
      </div>
      <div className="text-[10px] text-setta-500 dark:text-setta-400">
        Setta command availability is defined by this app. Native agent command
        lists are sourced from current external-agent run metadata.
      </div>
    </>
  );
}
type SlashCommandsSectionProps = {
  addCustomProjectChatSlashCommand: () => void;
  canAddCustomSlashCommand: boolean;
  conflictingCustomSlashCommandTokens: Set<string>;
  customSlashCommandDefinitions: ReturnType<
    typeof buildCustomPromptSlashCommandDefinitions
  >;
  customSlashNamespaceAuthorityReady: boolean;
  engineConfigsInitialLoadComplete: boolean;
  newCustomSlashAppGenerationMode: AppGenerationMode | null;
  newCustomSlashCommand: string;
  newCustomSlashPrompt: string;
  onRemoveCustomProjectChatSlashCommand: (commandToken: string) => void;
  onSelectSlashEngine: (engineId: string) => void;
  onSetNewCustomSlashAppGenerationMode: (mode: string | null) => void;
  onSetNewCustomSlashCommand: (value: string) => void;
  onSetNewCustomSlashPrompt: (value: string) => void;
  selectedAgentNativeSlashCommands: string[];
  selectedAgentNativeSlashStatus: AgentNativeSlashCommandsEntry;
  selectedSlashEngine: SlashCommandsByEngineEntry | null;
  slashCommandsByEngine: SlashCommandsByEngineEntry[];
};
function SlashCommandsSection({
  addCustomProjectChatSlashCommand,
  canAddCustomSlashCommand,
  conflictingCustomSlashCommandTokens,
  customSlashCommandDefinitions,
  customSlashNamespaceAuthorityReady,
  engineConfigsInitialLoadComplete,
  newCustomSlashAppGenerationMode,
  newCustomSlashCommand,
  newCustomSlashPrompt,
  onRemoveCustomProjectChatSlashCommand,
  onSelectSlashEngine,
  onSetNewCustomSlashAppGenerationMode,
  onSetNewCustomSlashCommand,
  onSetNewCustomSlashPrompt,
  selectedAgentNativeSlashCommands,
  selectedAgentNativeSlashStatus,
  selectedSlashEngine,
  slashCommandsByEngine,
}: SlashCommandsSectionProps) {
  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
      data-testid="skills-mcp-slash-commands-content"
    >
      <CustomSlashCommandsPanel
        addCustomProjectChatSlashCommand={addCustomProjectChatSlashCommand}
        canAddCustomSlashCommand={canAddCustomSlashCommand}
        conflictingCustomSlashCommandTokens={
          conflictingCustomSlashCommandTokens
        }
        customSlashCommandDefinitions={customSlashCommandDefinitions}
        customSlashNamespaceAuthorityReady={customSlashNamespaceAuthorityReady}
        newCustomSlashAppGenerationMode={newCustomSlashAppGenerationMode}
        newCustomSlashCommand={newCustomSlashCommand}
        newCustomSlashPrompt={newCustomSlashPrompt}
        onRemoveCustomProjectChatSlashCommand={
          onRemoveCustomProjectChatSlashCommand
        }
        onSetNewCustomSlashAppGenerationMode={
          onSetNewCustomSlashAppGenerationMode
        }
        onSetNewCustomSlashCommand={onSetNewCustomSlashCommand}
        onSetNewCustomSlashPrompt={onSetNewCustomSlashPrompt}
      />
      <SlashEngineCommandsPanel
        engineConfigsInitialLoadComplete={engineConfigsInitialLoadComplete}
        onSelectSlashEngine={onSelectSlashEngine}
        selectedAgentNativeSlashCommands={selectedAgentNativeSlashCommands}
        selectedAgentNativeSlashStatus={selectedAgentNativeSlashStatus}
        selectedSlashEngine={selectedSlashEngine}
        slashCommandsByEngine={slashCommandsByEngine}
      />
    </section>
  );
}
export function ProjectChatSkillsMcpViewer({
  projectConfigId,
  chatId,
  engineConfigId,
  engineType,
  externalAgentToolType,
  viewMode,
}: ProjectChatSkillsMcpViewerProps) {
  const chatMessages = useAIStore((state): BaseChatMessageUnion[] | null =>
    selectChatMessagesForChat({ chatId, state }),
  );
  const apiKeys = useAIStore((state) => state.apiKeys);
  const engineConfigs = useAIStore((state) => state.engineConfigs);
  const engineConfigsInitialLoadComplete = useAIStore(
    (state) => state.engineConfigsInitialLoadComplete,
  );
  const externalAgentHealth = useAIStore((state) => state.externalAgentHealth);
  const externalAgentHealthInitialLoadComplete = useAIStore(
    (state) => state.externalAgentHealthInitialLoadComplete,
  );
  const agentRuns = useAIStore((state) => state.agentRuns);
  const agentRunsInitialLoadComplete = useAIStore(
    (state) => state.agentRunsInitialLoadComplete,
  );
  const agentRunsAuthorityState = useAIStore(
    (state) => state.agentRunsAuthorityState,
  );
  const allLLMConfigs = useAIStore((state) => state.allLLMConfigs);
  const allLLMConfigsInitialLoadComplete = useAIStore(
    (state) => state.allLLMConfigsInitialLoadComplete,
  );
  const codeMirrorTheme = useCodeMirrorStyle();
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [skillFilter, setSkillFilter] = useState("");
  const [selectedSkillId, setSelectedSkillIdState] = useState<string | null>(
    null,
  );
  const [selectedSkillContent, setSelectedSkillContent] = useState("");
  const [selectedSkillContentTruncated, setSelectedSkillContentTruncated] =
    useState(false);
  const [selectedSkillOriginalSizeBytes, setSelectedSkillOriginalSizeBytes] =
    useState<number | null>(null);
  const [skillsListHeightPct, setSkillsListHeightPct] = useState(
    DEFAULT_SKILLS_LIST_HEIGHT_PCT,
  );
  const [skillContentLoadStatus, setSkillContentLoadStatus] =
    useState<SkillContentLoadStatus>("idle");
  const [skillContentLoadError, setSkillContentLoadError] = useState<
    string | null
  >(null);
  const storageAdapter = useMemo(
    () => getSafeLocalStorageAdapter("project-chat-skills-mcp-viewer"),
    [],
  );
  const [isSkillMarkdownViewerOpen, setIsSkillMarkdownViewerOpen] = useState(
    () => resolveInitialSkillMarkdownViewerOpen(storageAdapter),
  );
  const [skillMarkdownViewMode, setSkillMarkdownViewMode] =
    useState<SkillMarkdownViewMode>(() =>
      resolveInitialSkillMarkdownViewMode(storageAdapter),
    );
  const [
    skillMarkdownDraftStateBySkillId,
    setSkillMarkdownDraftStateBySkillId,
  ] = useState<Record<string, SkillMarkdownDraftStateEntry>>({});
  const [newCustomSkillRelativePath, setNewCustomSkillRelativePath] =
    useState("");
  const [customSkillCreateInFlight, setCustomSkillCreateInFlight] =
    useState(false);
  const [customSkillSaveInFlight, setCustomSkillSaveInFlight] = useState(false);
  const [customSkillCreateRootPath, setCustomSkillCreateRootPath] = useState<
    string | null
  >(null);
  const [customSkillCreateRootActionable, setCustomSkillCreateRootActionable] =
    useState(false);
  const [mcpConfigPath, setMcpConfigPath] = useState<string | null>(null);
  const [settaFilesLocation, setSettaFilesLocation] = useState<string | null>(
    null,
  );
  const [mcpRuntimeStatusLoading, setMcpRuntimeStatusLoading] = useState(true);
  const [mcpRuntimeStatusError, setMcpRuntimeStatusError] = useState<
    string | null
  >(null);
  const [mcpRuntimeStatusByServerId, setMcpRuntimeStatusByServerId] =
    useState<Record<string, McpRuntimeServerStatus> | null>(null);
  const [runtimeServers, setRuntimeServers] = useState<
    Array<{
      serverId: string;
      transport: string;
      endpoint: string;
    }>
  >([]);
  const [selectedSlashEngineId, setSelectedSlashEngineId] = useState<
    string | null
  >(null);
  const [
    customSlashDraftByProjectConfigId,
    setCustomSlashDraftByProjectConfigId,
  ] = useState<Record<string, CustomSlashCommandDraft>>({});
  const [skillsRevision, setSkillsRevision] = useState(0);
  const customProjectChatSlashCommands = useLocalStorage(
    (state): ProjectChatCustomSlashCommand[] =>
      selectCustomProjectChatSlashCommands(
        state.customProjectChatSlashCommandsByProjectConfigId,
        projectConfigId,
      ),
  );
  const skillsRefreshInFlight = useRef(false);
  const skillContentRequestSequence = useRef(0);
  const selectedSkillIdRef = useRef<string | null>(null);
  const setSelectedSkillId = useCallback(
    (
      nextSelectedSkillId:
        | string
        | null
        | ((currentSelectedSkillId: string | null) => string | null),
    ) => {
      if (typeof nextSelectedSkillId !== "function") {
        selectedSkillIdRef.current = nextSelectedSkillId;
        setSelectedSkillIdState(nextSelectedSkillId);
        return;
      }
      setSelectedSkillIdState((currentSelectedSkillId) => {
        const resolvedSelectedSkillId = nextSelectedSkillId(
          currentSelectedSkillId,
        );
        selectedSkillIdRef.current = resolvedSelectedSkillId;
        return resolvedSelectedSkillId;
      });
    },
    [],
  );
  const skillsSectionRef = useRef<HTMLDivElement | null>(null);
  const skillsResizeCleanupRef = useRef<(() => void) | null>(null);
  const skillContentCache = useRef(new Map<string, SkillContentCacheEntry>());
  const showSkillsSection = viewMode === "skills";
  const showMcpSection = viewMode === "mcp";
  const refreshSkillsBrowser = useCallback(
    async function refreshSkillsBrowserImpl() {
      if (skillsRefreshInFlight.current) {
        return;
      }
      skillsRefreshInFlight.current = true;
      setSkillsLoading(true);
      setSkillsError(null);
      setCustomSkillCreateRootPath(null);
      setCustomSkillCreateRootActionable(false);
      try {
        const res = await callOpenAPI(getAppGenSkills());
        if (!res200(res)) {
          const detail = getErrorDetail(res.data);
          setSkillsError(detail ?? "Failed to load skills.");
          return;
        }
        const nextSkills = res.data.skills;
        skillContentCache.current.clear();
        setSkills(nextSkills);
        setCustomSkillCreateRootPath(res.data.customSkillCreateRootPath);
        setCustomSkillCreateRootActionable(
          res.data.customSkillCreateRootActionable,
        );
        setSkillsRevision((value) => value + 1);
        setSelectedSkillId((current) => {
          if (nextSkills.length === 0) {
            return null;
          }
          return nextSkills.some((skill) => skill.skillId === current)
            ? current
            : nextSkills[0].skillId;
        });
      } finally {
        setSkillsLoading(false);
        skillsRefreshInFlight.current = false;
      }
    },
    [],
  );
  useEffect(() => {
    return () => {
      skillsResizeCleanupRef.current?.();
      skillsResizeCleanupRef.current = null;
    };
  }, []);
  useEffect(() => {
    runSkillsRefreshEffect({
      refreshSkillsBrowser,
      showSkillsSection,
    });
  }, [refreshSkillsBrowser, showSkillsSection]);
  useEffect(() => {
    async function loadSkillContent() {
      if (!showSkillsSection) {
        return;
      }
      if (!selectedSkillId) {
        skillContentRequestSequence.current += 1;
        setSkillContentLoadStatus("idle");
        setSkillContentLoadError(null);
        setSelectedSkillContent("");
        setSelectedSkillContentTruncated(false);
        setSelectedSkillOriginalSizeBytes(null);
        return;
      }
      if (!isSkillMarkdownViewerOpen) {
        skillContentRequestSequence.current += 1;
        setSkillContentLoadStatus("idle");
        setSkillContentLoadError(null);
        setSelectedSkillContent("");
        setSelectedSkillContentTruncated(false);
        setSelectedSkillOriginalSizeBytes(null);
        return;
      }
      const cacheKey = `${skillsRevision}:${selectedSkillId}`;
      const cached = skillContentCache.current.get(cacheKey) ?? null;
      if (cached) {
        setSkillContentLoadStatus("loaded");
        setSkillContentLoadError(null);
        setSelectedSkillContent(cached.content);
        setSelectedSkillContentTruncated(cached.truncated);
        setSelectedSkillOriginalSizeBytes(cached.originalSizeBytes);
        return;
      }
      const requestedSkillId = selectedSkillId;
      const requestSequence = skillContentRequestSequence.current + 1;
      skillContentRequestSequence.current = requestSequence;
      setSkillContentLoadStatus("loading");
      setSkillContentLoadError(null);
      const res = await callOpenAPI(
        getAppGenSkillContent({
          body: {
            skillId: requestedSkillId,
          },
        } as Parameters<typeof getAppGenSkillContent>[0]),
      );
      if (
        requestSequence !== skillContentRequestSequence.current ||
        requestedSkillId !== selectedSkillIdRef.current
      ) {
        return;
      }
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        setSkillContentLoadStatus("error");
        setSkillContentLoadError(
          detail ?? "Failed to load selected skill content.",
        );
        setSelectedSkillContent("");
        setSelectedSkillContentTruncated(false);
        setSelectedSkillOriginalSizeBytes(null);
        return;
      }
      setSkillContentLoadStatus("loaded");
      setSkillContentLoadError(null);
      setSelectedSkillContent(res.data.content);
      setSelectedSkillContentTruncated(res.data.truncated);
      setSelectedSkillOriginalSizeBytes(res.data.originalSizeBytes);
      skillContentCache.current.set(cacheKey, {
        content: res.data.content,
        truncated: res.data.truncated,
        originalSizeBytes: res.data.originalSizeBytes,
      });
    }
    void loadSkillContent();
  }, [
    isSkillMarkdownViewerOpen,
    selectedSkillId,
    showSkillsSection,
    skillsRevision,
  ]);
  useEffect(() => {
    let cancelled = false;
    const runtimeStatusChatId = chatId ?? null;
    const runtimeStatusEngineConfigId = engineConfigId ?? null;
    async function loadMcpRuntimeStatus() {
      if (!showMcpSection || !allLLMConfigsInitialLoadComplete) {
        return;
      }
      setMcpRuntimeStatusLoading(true);
      setMcpRuntimeStatusError(null);
      const res = await callOpenAPI(
        getMcpServerRuntimeStatus({
          body: {
            chatId: runtimeStatusChatId,
            engineConfigId: runtimeStatusEngineConfigId,
          },
        } as Parameters<typeof getMcpServerRuntimeStatus>[0]),
      );
      if (cancelled) {
        return;
      }
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        const errorMessage = resolveMcpRuntimeStatusErrorMessage(detail);
        postChromeReproEvent("mcp-runtime-status", {
          projectConfigId,
          chatId: runtimeStatusChatId,
          engineConfigId: runtimeStatusEngineConfigId,
          error: errorMessage,
        });
        setMcpRuntimeStatusError(errorMessage);
        setMcpRuntimeStatusByServerId(null);
        setRuntimeServers([]);
        setMcpConfigPath(null);
        setSettaFilesLocation(null);
        setMcpRuntimeStatusLoading(false);
        return;
      }
      const resolvedStatuses = res.data.resolvedServers;
      const runtimeStatusesByServerId =
        toRuntimeStatusByServerId(resolvedStatuses);
      postChromeReproEvent("mcp-runtime-status", {
        projectConfigId,
        chatId: runtimeStatusChatId,
        engineConfigId: runtimeStatusEngineConfigId,
        response: res.data,
        derivedRuntimeStatusByServerId: runtimeStatusesByServerId,
      });
      setMcpRuntimeStatusByServerId(runtimeStatusesByServerId);
      setRuntimeServers(
        resolvedStatuses.map((status) => ({
          serverId: status.serverId,
          transport: status.transport,
          endpoint: status.endpoint,
        })),
      );
      setMcpConfigPath(res.data.llmConfigPath);
      setSettaFilesLocation(res.data.activeSettaFilesLocation);
      setMcpRuntimeStatusLoading(false);
    }
    void loadMcpRuntimeStatus();
    return () => {
      cancelled = true;
    };
  }, [
    allLLMConfigsInitialLoadComplete,
    chatId,
    engineConfigId,
    allLLMConfigs?.mcpServers,
    showMcpSection,
  ]);
  useEffect(() => {
    storageAdapter.setItem(
      SKILL_MARKDOWN_VIEWER_STORAGE_KEY,
      isSkillMarkdownViewerOpen ? "true" : "false",
    );
  }, [isSkillMarkdownViewerOpen, storageAdapter]);
  useEffect(() => {
    storageAdapter.setItem(
      SKILL_MARKDOWN_VIEW_MODE_STORAGE_KEY,
      skillMarkdownViewMode,
    );
  }, [skillMarkdownViewMode, storageAdapter]);
  useEffect(() => {
    if (!selectedSkillId || skillContentLoadStatus !== "loaded") {
      return;
    }
    setSkillMarkdownDraftStateBySkillId((current) => {
      const next = resolveSkillMarkdownRawDraftBySkillIdHydration({
        skillMarkdownDraftStateBySkillId: current,
        skillId: selectedSkillId,
        skillContent: selectedSkillContent,
      });
      return next ?? current;
    });
  }, [selectedSkillContent, selectedSkillId, skillContentLoadStatus]);
  const filteredSkills = useMemo(() => {
    return filterSkills(skills, skillFilter);
  }, [skillFilter, skills]);
  const skillStatusBySkillId = useMemo(() => {
    return buildSkillStatusBySkillId({
      skills,
      engineType,
      externalAgentToolType,
      messages: chatMessages,
    });
  }, [chatMessages, engineType, externalAgentToolType, skills]);
  const groupedSkills = useMemo(() => {
    return groupSkillsByRootPath(filteredSkills);
  }, [filteredSkills]);
  const mcpServerGroups = useMemo(() => {
    return groupMcpServersByConfigPath({
      mcpServers: allLLMConfigs?.mcpServers,
      mcpConfigPath,
      settaFilesLocation,
      runtimeServers,
    });
  }, [
    allLLMConfigs?.mcpServers,
    runtimeServers,
    mcpConfigPath,
    settaFilesLocation,
  ]);
  const slashCommandsByEngine = useMemo(() => {
    return buildSlashCommandsByEngine({
      engineConfigs,
      allLLMConfigs,
      apiKeys,
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete,
    });
  }, [
    allLLMConfigs,
    apiKeys,
    engineConfigs,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
  ]);
  const slashCommandEngineIds = useMemo(() => {
    return slashCommandsByEngine.map((entry) => entry.engineId);
  }, [slashCommandsByEngine]);
  const runtimeAgentNativeSlashCommandsByEngineId = useMemo(() => {
    return resolveAgentNativeSlashCommandsByEngineId({
      runs: agentRuns,
      projectConfigId,
      engineConfigIds: slashCommandEngineIds,
    });
  }, [agentRuns, projectConfigId, slashCommandEngineIds]);
  const visibleAgentNativeSlashCommandsByEngineId = useMemo(() => {
    return resolveVisibleAgentNativeSlashCommandsByEngineId({
      agentRunsAuthorityState,
      runtimeEntries: runtimeAgentNativeSlashCommandsByEngineId,
    });
  }, [agentRunsAuthorityState, runtimeAgentNativeSlashCommandsByEngineId]);
  const selectedSlashEngine = useMemo(() => {
    return resolveSelectedSlashEngine({
      selectedSlashEngineId,
      slashCommandsByEngine,
    });
  }, [selectedSlashEngineId, slashCommandsByEngine]);
  const hasExternalAgentSlashEngine = useMemo(() => {
    return slashCommandsByEngine.some(
      (entry) => entry.engineType === EngineTypeEnum.external_agent,
    );
  }, [slashCommandsByEngine]);
  const shouldLoadSlashRuns = useMemo(() => {
    return shouldLoadSlashCommandAgentRuns({
      viewMode,
      hasExternalAgentEngine: hasExternalAgentSlashEngine,
    });
  }, [hasExternalAgentSlashEngine, viewMode]);
  const selectedAgentNativeSlashCommands = useMemo(() => {
    return resolveSelectedAgentNativeSlashCommands({
      selectedSlashEngine,
      visibleAgentNativeSlashCommandsByEngineId,
    });
  }, [selectedSlashEngine, visibleAgentNativeSlashCommandsByEngineId]);
  const selectedAgentNativeSlashStatus = useMemo(() => {
    return resolveSelectedAgentNativeSlashStatus({
      agentRunsAuthorityState,
      selectedSlashEngine,
      visibleAgentNativeSlashCommandsByEngineId,
    });
  }, [
    agentRunsAuthorityState,
    selectedSlashEngine,
    visibleAgentNativeSlashCommandsByEngineId,
  ]);
  const managedSlashCommandDefinitions = useMemo(() => {
    return buildChatSlashCommands({
      model: true,
      permissions: true,
      search: true,
      appGenerationModes: true,
    });
  }, []);
  const customSlashCommandDefinitions = useMemo(() => {
    return buildCustomPromptSlashCommandDefinitions(
      customProjectChatSlashCommands,
    );
  }, [customProjectChatSlashCommands]);
  const customSlashCommandTokens = useMemo(() => {
    return new Set(customSlashCommandDefinitions.map((entry) => entry.command));
  }, [customSlashCommandDefinitions]);
  const discoveredAgentNativeSlashCommands = useMemo(() => {
    return Object.values(visibleAgentNativeSlashCommandsByEngineId).flatMap(
      (entry) => entry.commands,
    );
  }, [visibleAgentNativeSlashCommandsByEngineId]);
  const reservedSlashCommandTokens = useMemo(() => {
    return buildReservedSlashCommandTokens({
      managedCommands: managedSlashCommandDefinitions,
      engineCommandGroups: slashCommandsByEngine,
      discoveredNativeSlashCommands: discoveredAgentNativeSlashCommands,
    });
  }, [
    discoveredAgentNativeSlashCommands,
    managedSlashCommandDefinitions,
    slashCommandsByEngine,
  ]);
  const { conflictingCommandTokens: conflictingCustomSlashCommandTokens } =
    useMemo(() => {
      return reconcileCustomSlashCommands({
        customCommands: customSlashCommandDefinitions,
        reservedTokens: reservedSlashCommandTokens,
      });
    }, [customSlashCommandDefinitions, reservedSlashCommandTokens]);
  useEffect(() => {
    const nextSelectedSlashEngineId = resolveNextSelectedSlashEngineId({
      selectedSlashEngineId,
      slashCommandsByEngine,
    });
    setSelectedSlashEngineId(nextSelectedSlashEngineId);
  }, [selectedSlashEngineId, slashCommandsByEngine]);
  useEffect(() => {
    if (shouldLoadSlashRuns && !agentRunsInitialLoadComplete) {
      void loadAgentRuns();
    }
  }, [agentRunsInitialLoadComplete, shouldLoadSlashRuns]);
  const readonlyMarkdownViewerExtensions = useMemo(() => {
    return getExtensions({
      language: "markdown",
      wrapLines: true,
      isDisabled: true,
      tabToAutocomplete: false,
      indentWithTab: false,
    });
  }, []);
  const editableMarkdownViewerExtensions = useMemo(() => {
    return getExtensions({
      language: "markdown",
      wrapLines: true,
      isDisabled: false,
      tabToAutocomplete: false,
      indentWithTab: false,
    });
  }, []);
  const { mcpServersLoading, showSkillsLoadingState } =
    resolveProjectChatViewerLoadingState({
      allLLMConfigsInitialLoadComplete,
      mcpRuntimeStatusLoading,
      skillsCount: skills.length,
      skillsLoading,
    });
  const skillContentLoading = skillContentLoadStatus === "loading";
  const skillMarkdownRawDraft = resolveSkillMarkdownRawDraft({
    selectedSkillId,
    skillMarkdownDraftStateBySkillId,
  });
  const currentCustomSlashDraft = resolveCurrentCustomSlashDraft({
    customSlashDraftByProjectConfigId,
    projectConfigId,
  });
  const newCustomSlashCommand = currentCustomSlashDraft.command;
  const newCustomSlashPrompt = currentCustomSlashDraft.prompt;
  const newCustomSlashAppGenerationMode =
    currentCustomSlashDraft.appGenerationMode;
  const setNewCustomSlashCommand = useCallback(
    (nextCommand: string) => {
      setCustomSlashDraftByProjectConfigId((current) => {
        const currentDraft =
          current[projectConfigId] ?? EMPTY_CUSTOM_SLASH_COMMAND_DRAFT;
        const next = resolveCustomSlashDraftByProjectConfigIdUpdate({
          customSlashDraftByProjectConfigId: current,
          projectConfigId,
          nextDraft: {
            ...currentDraft,
            command: nextCommand,
          },
        });
        return next ?? current;
      });
    },
    [projectConfigId],
  );
  const setNewCustomSlashPrompt = useCallback(
    (nextPrompt: string) => {
      setCustomSlashDraftByProjectConfigId((current) => {
        const currentDraft =
          current[projectConfigId] ?? EMPTY_CUSTOM_SLASH_COMMAND_DRAFT;
        const next = resolveCustomSlashDraftByProjectConfigIdUpdate({
          customSlashDraftByProjectConfigId: current,
          projectConfigId,
          nextDraft: {
            ...currentDraft,
            prompt: nextPrompt,
          },
        });
        return next ?? current;
      });
    },
    [projectConfigId],
  );
  const setNewCustomSlashAppGenerationMode = useCallback(
    (nextMode: string | null) => {
      setCustomSlashDraftByProjectConfigId((current) => {
        const currentDraft =
          current[projectConfigId] ?? EMPTY_CUSTOM_SLASH_COMMAND_DRAFT;
        const next = resolveCustomSlashDraftByProjectConfigIdUpdate({
          customSlashDraftByProjectConfigId: current,
          projectConfigId,
          nextDraft: {
            ...currentDraft,
            appGenerationMode: parseAppGenerationMode(nextMode),
          },
        });
        return next ?? current;
      });
    },
    [projectConfigId],
  );
  const normalizedNewCustomSlashCommand = useMemo(() => {
    return normalizeSlashCommandToken(newCustomSlashCommand);
  }, [newCustomSlashCommand]);
  const customSlashNamespaceAuthorityReady = useMemo(() => {
    return isCustomSlashNamespaceAuthorityReady({
      agentRunsAuthorityState,
      engineConfigsInitialLoadComplete,
      slashCommandsByEngine,
    });
  }, [
    agentRunsAuthorityState,
    engineConfigsInitialLoadComplete,
    slashCommandsByEngine,
  ]);
  const canAddCustomSlashCommand = useMemo(() => {
    return resolveCanAddCustomSlashCommand({
      customSlashCommandTokens,
      namespaceAuthorityReady: customSlashNamespaceAuthorityReady,
      newCustomSlashPrompt,
      normalizedNewCustomSlashCommand,
      reservedSlashCommandTokens,
    });
  }, [
    customSlashNamespaceAuthorityReady,
    customSlashCommandTokens,
    newCustomSlashPrompt,
    normalizedNewCustomSlashCommand,
    reservedSlashCommandTokens,
  ]);
  const canCreateCustomSkillButton = useMemo(() => {
    return canCreateCustomSkill({
      customSkillCreateInFlight,
      customSkillCreateRootPath,
      newCustomSkillRelativePath,
    });
  }, [
    customSkillCreateInFlight,
    customSkillCreateRootPath,
    newCustomSkillRelativePath,
  ]);
  const selectedSkill = useMemo(() => {
    return resolveSelectedSkill(skills, selectedSkillId);
  }, [selectedSkillId, skills]);
  const selectedSkillIsEditable = selectedSkill?.isEditable === true;
  const selectedSkillEditabilityReason =
    selectedSkill?.editabilityReason ?? null;
  const skillPreviewContent = useMemo(() => {
    return resolveSkillPreviewContent({
      skillContentLoading,
      skillsLoading,
      selectedSkillId,
      skillContentLoadStatus,
      selectedSkillContent,
    });
  }, [
    selectedSkillContent,
    selectedSkillId,
    skillContentLoadStatus,
    skillContentLoading,
    skillsLoading,
  ]);
  const renderedSkillPreviewContent = useMemo(() => {
    return resolveRenderedSkillPreviewContent({
      skillPreviewContent,
      skillMarkdownRawDraft,
      selectedSkillId,
      skillContentLoadStatus,
    });
  }, [
    skillContentLoadStatus,
    skillMarkdownRawDraft,
    skillPreviewContent,
    selectedSkillId,
  ]);
  const skillPreviewTruncationNotice = resolveSkillPreviewTruncationNotice({
    selectedSkillContentTruncated,
    selectedSkillOriginalSizeBytes,
  });
  const isRawMarkdownView =
    skillMarkdownViewMode === SKILL_MARKDOWN_VIEW_MODE_RAW;
  const rawMarkdownModeHint = useMemo(() => {
    return resolveRawMarkdownModeHint({
      selectedSkillContentTruncated,
      selectedSkillEditabilityReason,
      selectedSkillId,
      selectedSkillIsEditable,
      skillContentLoadStatus,
    });
  }, [
    selectedSkillId,
    selectedSkillContentTruncated,
    selectedSkillEditabilityReason,
    selectedSkillIsEditable,
    skillContentLoadStatus,
  ]);
  const saveSelectedSkillButtonTitle = useMemo(() => {
    return resolveSaveSelectedSkillButtonTitle({
      selectedSkillContentTruncated,
      selectedSkillEditabilityReason,
      selectedSkillId,
      selectedSkillIsEditable,
      skillContentLoadStatus,
    });
  }, [
    selectedSkillId,
    selectedSkillContentTruncated,
    selectedSkillEditabilityReason,
    selectedSkillIsEditable,
    skillContentLoadStatus,
  ]);
  const skillMarkdownEditable = canEditSelectedSkillMarkdown({
    selectedSkillContentTruncated,
    selectedSkillId,
    selectedSkillIsEditable,
    skillContentLoadStatus,
  });
  const saveSelectedCustomSkillError = useMemo(() => {
    return resolveSelectedCustomSkillSaveError({
      selectedSkillEditabilityReason,
      selectedSkillContentTruncated,
      selectedSkillId,
      selectedSkillIsEditable,
      skillContentLoadError,
      skillContentLoadStatus,
      skillMarkdownRawDraft,
    });
  }, [
    selectedSkillEditabilityReason,
    selectedSkillContentTruncated,
    selectedSkillId,
    selectedSkillIsEditable,
    skillContentLoadError,
    skillContentLoadStatus,
    skillMarkdownRawDraft,
  ]);
  const canSaveSelectedSkill = resolveCanSaveSelectedSkill({
    customSkillSaveInFlight,
    isRawMarkdownView,
    saveSelectedCustomSkillError,
    skillContentLoading,
    skillMarkdownEditable,
    skillMarkdownRawDraft,
  });
  const copyPathToClipboard = useCallback((path: string | null) => {
    if (!isActionablePath(path)) {
      return;
    }
    void (async () => {
      try {
        await navigator.clipboard.writeText(path);
        addTemporaryNotification("Copied path to clipboard.");
      } catch (error) {
        const detail =
          getErrorDetail(error) ??
          (error instanceof Error ? error.message : null);
        addTemporaryNotification(
          detail
            ? `Failed to copy path: ${detail}`
            : "Failed to copy path to clipboard.",
        );
      }
    })();
  }, []);
  const revealPathInFileExplorer = useCallback(async (path: string | null) => {
    if (!isActionablePath(path)) {
      return;
    }
    const res = await callOpenAPI(
      revealPathInOsFileExplorer({
        body: { path },
      } as Parameters<typeof revealPathInOsFileExplorer>[0]),
    );
    if (!res200(res)) {
      const detail = getErrorDetail(res.data);
      addTemporaryNotification(
        detail
          ? `Failed to reveal path: ${detail}`
          : "Failed to reveal path in file explorer.",
      );
      return;
    }
  }, []);
  const handleRefreshSkills = useCallback(() => {
    void refreshSkillsBrowser();
  }, [refreshSkillsBrowser]);
  const handleRevealPathInFileExplorer = useCallback(
    (path: string | null) => {
      void revealPathInFileExplorer(path);
    },
    [revealPathInFileExplorer],
  );
  const handleRevealCustomSkillRoot = useCallback(() => {
    void revealPathInFileExplorer(customSkillCreateRootPath);
  }, [customSkillCreateRootPath, revealPathInFileExplorer]);
  const handleResetSkillsListHeight = useCallback(() => {
    setSkillsListHeightPct(DEFAULT_SKILLS_LIST_HEIGHT_PCT);
  }, []);
  const handleSkillMarkdownDraftChange = useCallback(
    (value: string) => {
      if (!skillMarkdownEditable || !selectedSkillId) {
        return;
      }
      setSkillMarkdownDraftStateBySkillId((current) => {
        const next = resolveSkillMarkdownRawDraftBySkillIdUpdate({
          skillMarkdownDraftStateBySkillId: current,
          skillId: selectedSkillId,
          nextRawDraft: value,
        });
        return next ?? current;
      });
    },
    [selectedSkillId, skillMarkdownEditable],
  );
  const addCustomProjectChatSlashCommand = useCallback(
    function addCustomProjectChatSlashCommandImpl() {
      const normalizedCommand = normalizeSlashCommandToken(
        newCustomSlashCommand,
      );
      if (!normalizedCommand) {
        addTemporaryNotification(
          "Provide a valid slash command (example: /triage-bugs).",
        );
        return;
      }
      const trimmedPrompt = newCustomSlashPrompt.trim();
      if (!trimmedPrompt) {
        addTemporaryNotification("Provide prompt text for the custom command.");
        return;
      }
      if (
        reservedSlashCommandTokens.has(normalizedCommand) ||
        customSlashCommandTokens.has(normalizedCommand)
      ) {
        addTemporaryNotification(
          `${normalizedCommand} collides with an existing slash command.`,
        );
        return;
      }
      useLocalStorage.setState((state) => {
        const currentByProject =
          state.customProjectChatSlashCommandsByProjectConfigId;
        const currentCommands = currentByProject[projectConfigId] ?? [];
        if (
          currentCommands.some(
            (entry) =>
              normalizeSlashCommandToken(entry.command) === normalizedCommand,
          )
        ) {
          return state;
        }
        return {
          customProjectChatSlashCommandsByProjectConfigId: {
            ...currentByProject,
            [projectConfigId]: [
              ...currentCommands,
              {
                command: normalizedCommand,
                prompt: trimmedPrompt,
                appGenerationMode: newCustomSlashAppGenerationMode,
              },
            ],
          },
        };
      });
      setCustomSlashDraftByProjectConfigId((current) => {
        const next = resolveCustomSlashDraftByProjectConfigIdUpdate({
          customSlashDraftByProjectConfigId: current,
          projectConfigId,
          nextDraft: EMPTY_CUSTOM_SLASH_COMMAND_DRAFT,
        });
        return next ?? current;
      });
      addTemporaryNotification(`Added ${normalizedCommand}.`);
    },
    [
      customSlashCommandTokens,
      newCustomSlashAppGenerationMode,
      newCustomSlashCommand,
      newCustomSlashPrompt,
      projectConfigId,
      reservedSlashCommandTokens,
    ],
  );
  const removeCustomProjectChatSlashCommand = useCallback(
    function removeCustomProjectChatSlashCommandImpl(commandToken: string) {
      const normalizedCommand = normalizeSlashCommandToken(commandToken);
      if (!normalizedCommand) {
        return;
      }
      useLocalStorage.setState((state) => {
        const currentByProject =
          state.customProjectChatSlashCommandsByProjectConfigId;
        const currentCommands = currentByProject[projectConfigId] ?? [];
        const nextCommands = currentCommands.filter(
          (entry) =>
            normalizeSlashCommandToken(entry.command) !== normalizedCommand,
        );
        if (nextCommands.length === currentCommands.length) {
          return state;
        }
        const nextByProject = { ...currentByProject };
        if (nextCommands.length === 0) {
          delete nextByProject[projectConfigId];
        } else {
          nextByProject[projectConfigId] = nextCommands;
        }
        return {
          customProjectChatSlashCommandsByProjectConfigId: nextByProject,
        };
      });
      addTemporaryNotification(`Removed ${normalizedCommand}.`);
    },
    [projectConfigId],
  );
  const applyUpsertedSkillResponse = useCallback(
    ({
      requestSkillId,
      selectUpdatedSkill,
      skill,
      skillContent,
    }: {
      requestSkillId: string | null;
      selectUpdatedSkill: boolean;
      skill: SkillEntry;
      skillContent: SkillContent;
    }) => {
      const cacheEntry: SkillContentCacheEntry = {
        content: skillContent.content,
        truncated: skillContent.truncated,
        originalSizeBytes: skillContent.originalSizeBytes,
      };
      for (const key of skillContentCache.current.keys()) {
        if (key.endsWith(`:${skill.skillId}`)) {
          skillContentCache.current.set(key, cacheEntry);
        }
      }
      skillContentCache.current.set(
        `${skillsRevision}:${skill.skillId}`,
        cacheEntry,
      );
      setSkills((current) => upsertAppGenSkillEntry(current, skill));
      setSkillMarkdownDraftStateBySkillId((current) => {
        const next = resolveSkillMarkdownRawDraftBySkillIdReplace({
          skillMarkdownDraftStateBySkillId: current,
          skillId: skill.skillId,
          nextRawDraft: skillContent.content,
        });
        return next ?? current;
      });
      const nextSelectedSkillViewState =
        resolveSelectedSkillViewStateAfterUpsertedSkillResponse({
          currentSelectedSkillId: selectedSkillIdRef.current,
          requestSkillId,
          selectUpdatedSkill,
          skill,
          skillContent,
        });
      applySelectedSkillViewState({
        nextSelectedSkillViewState,
        setSelectedSkillContent,
        setSelectedSkillContentTruncated,
        setSelectedSkillId,
        setSelectedSkillOriginalSizeBytes,
        setSkillContentLoadError,
        setSkillContentLoadStatus,
      });
    },
    [skillsRevision],
  );
  const createCustomSkill = useCallback(
    async function createCustomSkillImpl() {
      const relativePath = newCustomSkillRelativePath.trim();
      if (!relativePath) {
        addTemporaryNotification("Provide a custom skill name first.");
        return;
      }
      setCustomSkillCreateInFlight(true);
      const initialContent = `# ${relativePath}\n\nDescribe what this skill helps with.\n`;
      const res = await callOpenAPI(
        upsertAppGenCustomSkill({
          body: {
            skillId: null,
            relativePath,
            content: initialContent,
          },
        } as Parameters<typeof upsertAppGenCustomSkill>[0]),
      );
      setCustomSkillCreateInFlight(false);
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        addTemporaryNotification(
          detail
            ? `Failed to create custom skill: ${detail}`
            : "Failed to create custom skill.",
        );
        return;
      }
      setCustomSkillCreateRootPath(res.data.rootPath);
      setCustomSkillCreateRootActionable(true);
      setNewCustomSkillRelativePath("");
      setIsSkillMarkdownViewerOpen(true);
      setSkillMarkdownViewMode(SKILL_MARKDOWN_VIEW_MODE_RAW);
      applyUpsertedSkillResponse({
        requestSkillId: null,
        selectUpdatedSkill: true,
        skill: res.data.skill,
        skillContent: res.data.skillContent,
      });
      addTemporaryNotification(`Created custom skill ${relativePath}.`);
    },
    [applyUpsertedSkillResponse, newCustomSkillRelativePath],
  );
  const handleCreateCustomSkill = useCallback(() => {
    void createCustomSkill();
  }, [createCustomSkill]);
  const saveSelectedCustomSkill = useCallback(
    async function saveSelectedCustomSkillImpl() {
      if (!selectedSkillId) {
        return;
      }
      const requestSkillId = selectedSkillId;
      if (saveSelectedCustomSkillError) {
        addTemporaryNotification(saveSelectedCustomSkillError);
        return;
      }
      const nextContent = skillMarkdownRawDraft;
      if (nextContent === null) {
        return;
      }
      setCustomSkillSaveInFlight(true);
      const res = await callOpenAPI(
        upsertAppGenCustomSkill({
          body: {
            skillId: requestSkillId,
            relativePath: null,
            content: nextContent,
          },
        } as Parameters<typeof upsertAppGenCustomSkill>[0]),
      );
      setCustomSkillSaveInFlight(false);
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        addTemporaryNotification(
          detail
            ? `Failed to save custom skill: ${detail}`
            : "Failed to save custom skill.",
        );
        return;
      }
      applyUpsertedSkillResponse({
        requestSkillId,
        selectUpdatedSkill: false,
        skill: res.data.skill,
        skillContent: res.data.skillContent,
      });
      addTemporaryNotification("Saved custom skill.");
    },
    [
      applyUpsertedSkillResponse,
      selectedSkillId,
      skillMarkdownRawDraft,
      saveSelectedCustomSkillError,
    ],
  );
  const handleSaveSelectedCustomSkill = useCallback(() => {
    void saveSelectedCustomSkill();
  }, [saveSelectedCustomSkill]);
  const beginSkillsListResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isSkillMarkdownViewerOpen) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const container = skillsSectionRef.current;
      if (!container) {
        return;
      }
      const bounds = container.getBoundingClientRect();
      if (bounds.height <= 0) {
        return;
      }
      const pointerId = event.pointerId;
      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return;
        }
        const offsetY = moveEvent.clientY - bounds.top;
        const rawListHeightPct = (offsetY / bounds.height) * 100;
        setSkillsListHeightPct(
          clamp(
            rawListHeightPct,
            MIN_SKILLS_LIST_HEIGHT_PCT,
            100 - MIN_SKILL_MARKDOWN_HEIGHT_PCT,
          ),
        );
      };
      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) {
          return;
        }
        cleanup();
        skillsResizeCleanupRef.current = null;
      };
      skillsResizeCleanupRef.current?.();
      const cleanup = attachSkillsListResizeListeners({
        target: window,
        onMove,
        onUp,
      });
      skillsResizeCleanupRef.current = cleanup;
    },
    [isSkillMarkdownViewerOpen],
  );
  const contentByViewMode: Record<
    ProjectChatSkillsMcpViewerProps["viewMode"],
    ReactNode
  > = {
    mcp: (
      <McpSection
        mcpServerGroups={mcpServerGroups}
        mcpRuntimeStatusByServerId={mcpRuntimeStatusByServerId}
        mcpRuntimeStatusError={mcpRuntimeStatusError}
        mcpRuntimeStatusLoading={mcpRuntimeStatusLoading}
        mcpServersLoading={mcpServersLoading}
        onCopyPath={copyPathToClipboard}
        onRevealPath={handleRevealPathInFileExplorer}
      />
    ),
    skills: (
      <SkillsSection
        beginSkillsListResize={beginSkillsListResize}
        canCreateCustomSkillButton={canCreateCustomSkillButton}
        canSaveSelectedSkill={canSaveSelectedSkill}
        codeMirrorTheme={codeMirrorTheme}
        customSkillCreateRootActionable={customSkillCreateRootActionable}
        customSkillCreateRootPath={customSkillCreateRootPath}
        editableMarkdownViewerExtensions={editableMarkdownViewerExtensions}
        groupedSkills={groupedSkills}
        isRawMarkdownView={isRawMarkdownView}
        isSkillMarkdownViewerOpen={isSkillMarkdownViewerOpen}
        newCustomSkillRelativePath={newCustomSkillRelativePath}
        onCopyPath={copyPathToClipboard}
        onCreateCustomSkill={handleCreateCustomSkill}
        onRefreshSkills={handleRefreshSkills}
        onRevealPath={handleRevealPathInFileExplorer}
        onRevealCustomSkillRoot={handleRevealCustomSkillRoot}
        onSelectSkill={setSelectedSkillId}
        onSetSkillMarkdownViewerOpen={setIsSkillMarkdownViewerOpen}
        onSelectSkillMarkdownViewMode={setSkillMarkdownViewMode}
        onSetNewCustomSkillRelativePath={setNewCustomSkillRelativePath}
        onSkillFilterChange={setSkillFilter}
        onSkillMarkdownDraftChange={handleSkillMarkdownDraftChange}
        onResetSkillsListHeight={handleResetSkillsListHeight}
        onSaveSelectedCustomSkill={handleSaveSelectedCustomSkill}
        rawMarkdownModeHint={rawMarkdownModeHint}
        readonlyMarkdownViewerExtensions={readonlyMarkdownViewerExtensions}
        renderedSkillPreviewContent={renderedSkillPreviewContent}
        saveSelectedSkillButtonTitle={saveSelectedSkillButtonTitle}
        selectedSkillId={selectedSkillId}
        showSkillsLoadingState={showSkillsLoadingState}
        skillContentLoadError={skillContentLoadError}
        skillContentLoadStatus={skillContentLoadStatus}
        skillFilter={skillFilter}
        skillMarkdownEditable={skillMarkdownEditable}
        skillMarkdownRawDraft={skillMarkdownRawDraft}
        skillPreviewContent={skillPreviewContent}
        skillPreviewTruncationNotice={skillPreviewTruncationNotice}
        skillStatusBySkillId={skillStatusBySkillId}
        skillsError={skillsError}
        skillsListHeightPct={skillsListHeightPct}
        skillsLoading={skillsLoading}
        skillsSectionRef={skillsSectionRef}
      />
    ),
    slash_commands: (
      <SlashCommandsSection
        addCustomProjectChatSlashCommand={addCustomProjectChatSlashCommand}
        canAddCustomSlashCommand={canAddCustomSlashCommand}
        conflictingCustomSlashCommandTokens={
          conflictingCustomSlashCommandTokens
        }
        customSlashCommandDefinitions={customSlashCommandDefinitions}
        customSlashNamespaceAuthorityReady={customSlashNamespaceAuthorityReady}
        engineConfigsInitialLoadComplete={engineConfigsInitialLoadComplete}
        newCustomSlashAppGenerationMode={newCustomSlashAppGenerationMode}
        newCustomSlashCommand={newCustomSlashCommand}
        newCustomSlashPrompt={newCustomSlashPrompt}
        onRemoveCustomProjectChatSlashCommand={
          removeCustomProjectChatSlashCommand
        }
        onSelectSlashEngine={setSelectedSlashEngineId}
        onSetNewCustomSlashAppGenerationMode={
          setNewCustomSlashAppGenerationMode
        }
        onSetNewCustomSlashCommand={setNewCustomSlashCommand}
        onSetNewCustomSlashPrompt={setNewCustomSlashPrompt}
        selectedAgentNativeSlashCommands={selectedAgentNativeSlashCommands}
        selectedAgentNativeSlashStatus={selectedAgentNativeSlashStatus}
        selectedSlashEngine={selectedSlashEngine}
        slashCommandsByEngine={slashCommandsByEngine}
      />
    ),
  };
  return (
    <div
      className="-mr-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-scroll pr-1 pt-4 text-sm text-setta-600 dark:text-setta-300"
      data-testid={resolveProjectChatSkillsViewTestId(viewMode)}
    >
      {contentByViewMode[viewMode]}
    </div>
  );
}
