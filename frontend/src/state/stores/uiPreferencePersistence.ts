import { parseAppGenerationMode } from "state/types/appGenerationMode";
import {
  isOverviewTabKey,
  OverviewNotificationsPaneTabEnum,
  OverviewTabNameEnum,
} from "utils/constants";
import type { ProjectChatCustomSlashCommand } from "./aiStores";
import type { UIPreferenceState } from "./uiPreferenceState";

function isPersistedRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePersistedCustomProjectChatSlashCommandsByProjectConfigId(
  value: unknown,
): Record<string, Array<ProjectChatCustomSlashCommand>> {
  if (!isPersistedRecord(value)) {
    return {};
  }

  const normalized: Record<string, Array<ProjectChatCustomSlashCommand>> = {};
  for (const [projectConfigId, rawCommands] of Object.entries(value)) {
    const normalizedProjectConfigId = projectConfigId.trim();
    if (!normalizedProjectConfigId || !Array.isArray(rawCommands)) {
      continue;
    }

    const normalizedCommands: Array<ProjectChatCustomSlashCommand> = [];
    for (const rawCommand of rawCommands) {
      if (!isPersistedRecord(rawCommand)) {
        continue;
      }

      const commandValue = rawCommand.command;
      const promptValue = rawCommand.prompt;
      const appGenerationModeValue = rawCommand.appGenerationMode;
      if (typeof commandValue !== "string" || typeof promptValue !== "string") {
        continue;
      }

      const command = commandValue.trim();
      const prompt = promptValue.trim();
      if (!command || !prompt) {
        continue;
      }

      normalizedCommands.push({
        command,
        prompt,
        appGenerationMode: parseAppGenerationMode(appGenerationModeValue),
      });
    }

    if (normalizedCommands.length === 0) {
      continue;
    }

    normalized[normalizedProjectConfigId] = normalizedCommands;
  }

  return normalized;
}

function normalizePersistedProjectChatDraftMessageByProjectConfigId(
  value: unknown,
): Record<string, string> {
  if (!isPersistedRecord(value)) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [projectConfigId, rawDraftMessage] of Object.entries(value)) {
    const normalizedProjectConfigId = projectConfigId.trim();
    if (!normalizedProjectConfigId || typeof rawDraftMessage !== "string") {
      continue;
    }
    if (rawDraftMessage === "") {
      continue;
    }

    normalized[normalizedProjectConfigId] = rawDraftMessage;
  }

  return normalized;
}

export function sanitizePersistedUIPreferenceState(
  persistedState: unknown,
  currentState: UIPreferenceState,
): UIPreferenceState {
  const persisted = isPersistedRecord(persistedState) ? persistedState : {};
  const merged = {
    ...currentState,
    ...persisted,
  };

  if (persisted.colorMode === undefined) {
    merged.colorMode = merged.darkMode ? "dark" : "light";
  }
  if (
    merged.homeProjectGalleryViewMode !== "thumbnails" &&
    merged.homeProjectGalleryViewMode !== "list"
  ) {
    merged.homeProjectGalleryViewMode = "thumbnails";
  }
  if (
    merged.chatSharedEdgeMode !== "agentic" &&
    merged.chatSharedEdgeMode !== "workflow"
  ) {
    merged.chatSharedEdgeMode = "agentic";
  }
  if (!Array.isArray(merged.favoriteProjectConfigIds)) {
    merged.favoriteProjectConfigIds = [];
  }
  if (!Array.isArray(merged.overviewProjectConfigOrder)) {
    merged.overviewProjectConfigOrder = [];
  }
  if (typeof merged.homeWorkspacePaneVis !== "boolean") {
    merged.homeWorkspacePaneVis = true;
  }
  if (typeof merged.homeWorkspacePaneWidth !== "number") {
    merged.homeWorkspacePaneWidth = 320;
  }
  if (typeof merged.homeWorkspacePaneTrueWidth !== "number") {
    merged.homeWorkspacePaneTrueWidth = 320;
  }
  if (typeof merged.homeSelectedProjectPaneVis !== "boolean") {
    merged.homeSelectedProjectPaneVis = true;
  }
  if (typeof merged.homeSelectedProjectPaneWidth !== "number") {
    merged.homeSelectedProjectPaneWidth = 280;
  }
  if (typeof merged.homeSelectedProjectPaneTrueWidth !== "number") {
    merged.homeSelectedProjectPaneTrueWidth = 280;
  }
  if (!isOverviewTabKey(merged.overviewTab)) {
    merged.overviewTab = OverviewTabNameEnum.Overview;
  }
  if (
    merged.overviewNotificationsPaneTab !==
      OverviewNotificationsPaneTabEnum.Notifications &&
    merged.overviewNotificationsPaneTab !==
      OverviewNotificationsPaneTabEnum.BackendLogs
  ) {
    merged.overviewNotificationsPaneTab =
      OverviewNotificationsPaneTabEnum.Notifications;
  }

  // Keep transient visibility session-local even though the store itself
  // is persisted for durable preferences.
  merged.watchCodePortalOpen = false;
  merged.customProjectChatSlashCommandsByProjectConfigId =
    normalizePersistedCustomProjectChatSlashCommandsByProjectConfigId(
      merged.customProjectChatSlashCommandsByProjectConfigId,
    );
  merged.projectChatDraftMessageByProjectConfigId =
    normalizePersistedProjectChatDraftMessageByProjectConfigId(
      merged.projectChatDraftMessageByProjectConfigId,
    );
  merged.projectChatAuxViewByProjectConfigId = {};

  if (
    !merged.viewedProjectChatThreadIdsByProjectConfigId ||
    typeof merged.viewedProjectChatThreadIdsByProjectConfigId !== "object" ||
    Array.isArray(merged.viewedProjectChatThreadIdsByProjectConfigId)
  ) {
    merged.viewedProjectChatThreadIdsByProjectConfigId = {};
  }
  if (
    !merged.projectChatThreadGroupsByProjectConfigId ||
    typeof merged.projectChatThreadGroupsByProjectConfigId !== "object" ||
    Array.isArray(merged.projectChatThreadGroupsByProjectConfigId)
  ) {
    merged.projectChatThreadGroupsByProjectConfigId = {};
  }
  if (
    !merged.projectChatThreadAssignmentsByProjectConfigId ||
    typeof merged.projectChatThreadAssignmentsByProjectConfigId !== "object" ||
    Array.isArray(merged.projectChatThreadAssignmentsByProjectConfigId)
  ) {
    merged.projectChatThreadAssignmentsByProjectConfigId = {};
  }
  if (
    !merged.projectChatThreadOrderByProjectConfigId ||
    typeof merged.projectChatThreadOrderByProjectConfigId !== "object" ||
    Array.isArray(merged.projectChatThreadOrderByProjectConfigId)
  ) {
    merged.projectChatThreadOrderByProjectConfigId = {};
  }
  if (
    !merged.pinnedProjectChatThreadIdsByProjectConfigId ||
    typeof merged.pinnedProjectChatThreadIdsByProjectConfigId !== "object" ||
    Array.isArray(merged.pinnedProjectChatThreadIdsByProjectConfigId)
  ) {
    merged.pinnedProjectChatThreadIdsByProjectConfigId = {};
  }
  if (
    !merged.trashedProjectChatThreadIdsByProjectConfigId ||
    typeof merged.trashedProjectChatThreadIdsByProjectConfigId !== "object" ||
    Array.isArray(merged.trashedProjectChatThreadIdsByProjectConfigId)
  ) {
    merged.trashedProjectChatThreadIdsByProjectConfigId = {};
  }

  return merged;
}

export function partializeUIPreferenceState(state: UIPreferenceState) {
  return {
    snapToGrid: state.snapToGrid,
    showAgenticEdges: state.showAgenticEdges,
    showArgEdges: state.showArgEdges,
    chatSharedEdgeMode: state.chatSharedEdgeMode,
    darkMode: state.darkMode,
    colorMode: state.colorMode,
    showMinimap: state.showMinimap,
    projectConfigPreviewEnabled: state.projectConfigPreviewEnabled,
    homeProjectGalleryViewMode: state.homeProjectGalleryViewMode,
    favoriteProjectConfigIds: state.favoriteProjectConfigIds,
    overviewProjectConfigOrder: state.overviewProjectConfigOrder,
    homeWorkspacePaneVis: state.homeWorkspacePaneVis,
    homeWorkspacePaneWidth: state.homeWorkspacePaneWidth,
    homeWorkspacePaneTrueWidth: state.homeWorkspacePaneTrueWidth,
    homeSelectedProjectPaneVis: state.homeSelectedProjectPaneVis,
    homeSelectedProjectPaneWidth: state.homeSelectedProjectPaneWidth,
    homeSelectedProjectPaneTrueWidth: state.homeSelectedProjectPaneTrueWidth,
    overviewVis: state.overviewVis,
    overviewWidth: state.overviewWidth,
    overviewTrueWidth: state.overviewTrueWidth,
    overviewTab: state.overviewTab,
    overviewNotificationsPaneTab: state.overviewNotificationsPaneTab,
    gitGraphSplitPct: state.gitGraphSplitPct,
    gitGraphColWidthPx: state.gitGraphColWidthPx,
    gitGraphAuthorWidthPx: state.gitGraphAuthorWidthPx,
    gitGraphDateWidthPx: state.gitGraphDateWidthPx,
    gitGraphHashWidthPx: state.gitGraphHashWidthPx,
    uiEditorVis: state.uiEditorVis,
    uiEditorWidth: state.uiEditorWidth,
    uiEditorTrueWidth: state.uiEditorTrueWidth,
    uiEditorTab: state.uiEditorTab,
    showNavBarHelpMessage: state.showNavBarHelpMessage,
    tooltipWidth: state.tooltipWidth,
    customRunsByProjectConfigId: state.customRunsByProjectConfigId,
    customProjectChatSlashCommandsByProjectConfigId:
      state.customProjectChatSlashCommandsByProjectConfigId,
    projectChatDraftMessageByProjectConfigId:
      state.projectChatDraftMessageByProjectConfigId,
    runSnapshotModeByProjectConfigId: state.runSnapshotModeByProjectConfigId,
    runInstructionsAccordionOpenValuesByProjectConfigId:
      state.runInstructionsAccordionOpenValuesByProjectConfigId,
    projectAiSettingsAccordionOpenValuesByProjectConfigId:
      state.projectAiSettingsAccordionOpenValuesByProjectConfigId,
    viewedProjectChatThreadIdsByProjectConfigId:
      state.viewedProjectChatThreadIdsByProjectConfigId,
    projectChatThreadGroupsByProjectConfigId:
      state.projectChatThreadGroupsByProjectConfigId,
    projectChatThreadAssignmentsByProjectConfigId:
      state.projectChatThreadAssignmentsByProjectConfigId,
    projectChatThreadOrderByProjectConfigId:
      state.projectChatThreadOrderByProjectConfigId,
    pinnedProjectChatThreadIdsByProjectConfigId:
      state.pinnedProjectChatThreadIdsByProjectConfigId,
    trashedProjectChatThreadIdsByProjectConfigId:
      state.trashedProjectChatThreadIdsByProjectConfigId,
  };
}
