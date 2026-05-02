import { getExtensions } from "components/Utils/CodeMirror/getExtensions";

import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";

import { useAIStore } from "state/definitions";

import { type AppGenerationMode } from "state/types/appGenerationMode";

import {
  type BaseChatMessageUnion,
  type EngineConfig,
  EngineTypeEnum,
  type SkillContent,
  type SkillEntry,
} from "utils/generatedTypes";

import { getSafeLocalStorageAdapter } from "utils/safeLocalStorage";

import {
  type AgentNativeSlashCommandsEntry,
  type AgentRunsAuthorityState,
  buildSkillStatusBySkillId,
  buildSlashCommandsByEngine,
  DEFAULT_AGENT_NATIVE_SLASH_COMMANDS_ENTRY,
  EMPTY_AGENT_NATIVE_COMMANDS,
  groupMcpServersByConfigPath,
  groupSkillsByRootPath,
  isAgentRunsAuthorityReady,
} from "../projectChatSkillsMcpViewerUtils";

export type PathGroupHeaderProps = {
  title: string;
  path: string | null;
  onCopyPath: (path: string | null) => void;
  onRevealPath: (path: string | null) => void;
};

export type ProjectChatSkillsMcpViewerProps = {
  projectConfigId: string;
  chatId: string | null | undefined;
  engineConfigId: string | null;
  engineType: EngineConfig["engineType"] | null;
  externalAgentToolType: string | null;
  viewMode: "skills" | "mcp" | "slash_commands";
};

export const SKILL_MARKDOWN_VIEWER_STORAGE_KEY =
  "setta.projectChatSkillsMcpViewer.skillMarkdownViewerOpen";

export const SKILL_MARKDOWN_VIEW_MODE_STORAGE_KEY =
  "setta.projectChatSkillsMcpViewer.skillMarkdownViewMode";

export const SKILL_MARKDOWN_VIEWER_VALUE = "skill-markdown-viewer";

export const SKILL_MARKDOWN_VIEW_MODE_RENDERED = "rendered";

export const SKILL_MARKDOWN_VIEW_MODE_RAW = "raw";

export const DEFAULT_SKILLS_LIST_HEIGHT_PCT = 66;

export const MIN_SKILLS_LIST_HEIGHT_PCT = 30;

export const MIN_SKILL_MARKDOWN_HEIGHT_PCT = 20;

export const SKILL_MARKDOWN_RENDERED_CLASS =
  "prose prose-sm max-w-none dark:prose-invert prose-headings:my-2 prose-headings:font-semibold prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-code:before:hidden prose-code:after:hidden prose-pre:my-2 [&>:first-child]:mt-0 [&>:last-child]:mb-0";

export type SkillMarkdownViewMode =
  | typeof SKILL_MARKDOWN_VIEW_MODE_RENDERED
  | typeof SKILL_MARKDOWN_VIEW_MODE_RAW;

export type SkillContentLoadStatus = "idle" | "loading" | "loaded" | "error";

export type ResizeListenerTarget = Pick<
  Window,
  "addEventListener" | "removeEventListener"
>;

export type SkillMarkdownDraftStateEntry = {
  draft: string;
  loadedContent: string;
};

export type CustomSlashCommandDraft = {
  command: string;
  prompt: string;
  appGenerationMode: AppGenerationMode | null;
};

export type CustomSlashCommandModeItem = {
  id: string;
  name: string;
};

export const EMPTY_CUSTOM_SLASH_COMMAND_DRAFT: CustomSlashCommandDraft = {
  command: "",
  prompt: "",
  appGenerationMode: null,
};

export function getCustomSlashCommandModeLabel(
  mode: AppGenerationMode | null,
  modeItems: CustomSlashCommandModeItem[],
  defaultMode: string,
): string | null {
  const resolvedId = mode ?? defaultMode;
  return modeItems.find((item) => item.id === resolvedId)?.name ?? null;
}

export function areCustomSlashCommandDraftsEqual(
  left: CustomSlashCommandDraft,
  right: CustomSlashCommandDraft,
): boolean {
  return (
    left.command === right.command &&
    left.prompt === right.prompt &&
    left.appGenerationMode === right.appGenerationMode
  );
}

export function isEmptyCustomSlashCommandDraft(
  draft: CustomSlashCommandDraft,
): boolean {
  return areCustomSlashCommandDraftsEqual(
    draft,
    EMPTY_CUSTOM_SLASH_COMMAND_DRAFT,
  );
}

export type ResolveSkillMarkdownRawDraftBySkillIdHydrationInput = {
  skillMarkdownDraftStateBySkillId: Record<
    string,
    SkillMarkdownDraftStateEntry
  >;
  skillId: string;
  skillContent: string;
};

export type ResolveSkillMarkdownRawDraftBySkillIdUpdateInput = {
  skillMarkdownDraftStateBySkillId: Record<
    string,
    SkillMarkdownDraftStateEntry
  >;
  skillId: string;
  nextRawDraft: string;
};

export type ResolveSkillMarkdownRawDraftBySkillIdReplaceInput = {
  skillMarkdownDraftStateBySkillId: Record<
    string,
    SkillMarkdownDraftStateEntry
  >;
  skillId: string;
  nextRawDraft: string;
};

export type ResolveCustomSlashDraftByProjectConfigIdUpdateInput = {
  customSlashDraftByProjectConfigId: Record<string, CustomSlashCommandDraft>;
  projectConfigId: string;
  nextDraft: CustomSlashCommandDraft;
};

export type SkillContentCacheEntry = {
  content: string;
  truncated: boolean;
  originalSizeBytes: number | null;
};

export type SelectedSkillViewState = {
  selectedSkillId: string;
  selectedSkillContent: string;
  selectedSkillContentTruncated: boolean;
  selectedSkillOriginalSizeBytes: number | null;
};

export type SkillGroup = ReturnType<typeof groupSkillsByRootPath>[number];

export type McpServerGroup = ReturnType<
  typeof groupMcpServersByConfigPath
>[number];

export type SlashCommandsByEngineEntry = ReturnType<
  typeof buildSlashCommandsByEngine
>[number];

export type SkillStatusBySkillId = ReturnType<typeof buildSkillStatusBySkillId>;

export type SkillStatusEntry = SkillStatusBySkillId[string];

export type CodeMirrorTheme = ReturnType<typeof useCodeMirrorStyle>;

export type CodeMirrorExtensions = ReturnType<typeof getExtensions>;

export function compareAppGenSkillEntries(
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

export function isActionablePath(path: string | null): path is string {
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

export function attachSkillsListResizeListeners(args: {
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

export function resolveProjectChatSkillsViewTestId(
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

export function selectChatMessagesForChat(args: {
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

export function resolveMcpRuntimeStatusErrorMessage(
  detail: string | null,
): string {
  return detail ?? "Failed to load MCP runtime status.";
}

export function resolveCustomSkillsRootDescription(args: {
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

export function resolveSelectedCustomSkillSaveError(args: {
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

export function resolveInitialSkillMarkdownViewerOpen(
  storageAdapter: ReturnType<typeof getSafeLocalStorageAdapter>,
): boolean {
  return storageAdapter.getItem(SKILL_MARKDOWN_VIEWER_STORAGE_KEY) === "true";
}

export function resolveInitialSkillMarkdownViewMode(
  storageAdapter: ReturnType<typeof getSafeLocalStorageAdapter>,
): SkillMarkdownViewMode {
  return storageAdapter.getItem(SKILL_MARKDOWN_VIEW_MODE_STORAGE_KEY) ===
    SKILL_MARKDOWN_VIEW_MODE_RAW
    ? SKILL_MARKDOWN_VIEW_MODE_RAW
    : SKILL_MARKDOWN_VIEW_MODE_RENDERED;
}

export function resolveSelectedSlashEngine(args: {
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

export function resolveNextSelectedSlashEngineId(args: {
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

export function resolveSelectedAgentNativeSlashCommands(args: {
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

export function resolveSelectedAgentNativeSlashStatus(args: {
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

export function resolveSelectedSkill(
  skills: SkillEntry[],
  selectedSkillId: string | null,
): SkillEntry | null {
  if (!selectedSkillId) {
    return null;
  }
  return skills.find((skill) => skill.skillId === selectedSkillId) ?? null;
}

export function resolveRawMarkdownModeHint(args: {
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

export function resolveSaveSelectedSkillButtonTitle(args: {
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

export function resolveSkillPreviewTruncationNotice(args: {
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

export function resolveCurrentCustomSlashDraft(args: {
  customSlashDraftByProjectConfigId: Record<string, CustomSlashCommandDraft>;
  projectConfigId: string;
}): CustomSlashCommandDraft {
  const { customSlashDraftByProjectConfigId, projectConfigId } = args;
  return (
    customSlashDraftByProjectConfigId[projectConfigId] ??
    EMPTY_CUSTOM_SLASH_COMMAND_DRAFT
  );
}

export function resolveSkillMarkdownRawDraft(args: {
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

export function applySelectedSkillViewState(args: {
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

export type SkillContentViewStateSetters = {
  setSelectedSkillContent: (value: string) => void;
  setSelectedSkillContentTruncated: (value: boolean) => void;
  setSelectedSkillOriginalSizeBytes: (value: number | null) => void;
  setSkillContentLoadError: (value: string | null) => void;
  setSkillContentLoadStatus: (value: SkillContentLoadStatus) => void;
};

export function resetSelectedSkillContentViewState(
  setters: SkillContentViewStateSetters,
): void {
  setters.setSkillContentLoadStatus("idle");
  setters.setSkillContentLoadError(null);
  setters.setSelectedSkillContent("");
  setters.setSelectedSkillContentTruncated(false);
  setters.setSelectedSkillOriginalSizeBytes(null);
}

export function applyCachedSkillContentViewState(args: {
  cached: SkillContentCacheEntry;
  setters: SkillContentViewStateSetters;
}): void {
  const { cached, setters } = args;
  setters.setSkillContentLoadStatus("loaded");
  setters.setSkillContentLoadError(null);
  setters.setSelectedSkillContent(cached.content);
  setters.setSelectedSkillContentTruncated(cached.truncated);
  setters.setSelectedSkillOriginalSizeBytes(cached.originalSizeBytes);
}

export function applyLoadedSkillContentViewState(args: {
  skillContent: SkillContent;
  setters: SkillContentViewStateSetters;
}): void {
  const { skillContent, setters } = args;
  setters.setSkillContentLoadStatus("loaded");
  setters.setSkillContentLoadError(null);
  setters.setSelectedSkillContent(skillContent.content);
  setters.setSelectedSkillContentTruncated(skillContent.truncated);
  setters.setSelectedSkillOriginalSizeBytes(skillContent.originalSizeBytes);
}

export function applySkillContentLoadErrorViewState(args: {
  detail: string | null;
  setters: SkillContentViewStateSetters;
}): void {
  const { detail, setters } = args;
  setters.setSkillContentLoadStatus("error");
  setters.setSkillContentLoadError(
    detail ?? "Failed to load selected skill content.",
  );
  setters.setSelectedSkillContent("");
  setters.setSelectedSkillContentTruncated(false);
  setters.setSelectedSkillOriginalSizeBytes(null);
}
