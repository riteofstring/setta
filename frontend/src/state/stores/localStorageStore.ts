import type { AppGenerationMode } from "state/types/appGenerationMode";
import type {
  OverviewNotificationsPaneTab,
  OverviewTabKey,
} from "utils/constants/panes";
import {
  CLOSED_PANE_WIDTH,
  INITIAL_OVERVIEW_WIDTH,
  INITIAL_UI_EDITOR_WIDTH,
  isOverviewTabKey,
  OverviewNotificationsPaneTabEnum,
  OverviewTabNameEnum,
  UIEditorTabLocalStorage,
} from "utils/constants/panes";
import type { SettingsState } from "utils/generatedTypes";
import {
  DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX,
  DEFAULT_GIT_GRAPH_COL_WIDTH_PX,
  DEFAULT_GIT_GRAPH_DATE_WIDTH_PX,
  DEFAULT_GIT_GRAPH_HASH_WIDTH_PX,
  DEFAULT_GIT_GRAPH_SPLIT_PCT,
} from "utils/gitGraphLayoutDefaults";
import { persist } from "zustand/middleware";
import { createWithEqualityFn } from "zustand/traditional";
import { getPersistStorage } from "./persistStorage";

export type ColorModePreference = "dark" | "light" | "auto";
export type HomeProjectGalleryViewMode = "thumbnails" | "list";
type MiniMapSide = "left" | "right";
type RunMode = "once" | "continuous";
type RunSnapshotMode = SettingsState["backend"]["runSnapshotMode"];

export type CustomRunAction =
  | { type: "runCodeBlock"; sectionId: string | null }
  | { type: "triggerListenerForceRefresh" };

export type CustomRunItem = {
  id: string;
  name: string;
  includeInRunDropdown: boolean;
  runMode: RunMode;
  action: CustomRunAction;
};

export type ProjectChatCustomSlashCommand = {
  command: string;
  prompt: string;
};

export type ProjectChatAuxView =
  | "none"
  | "skills"
  | "mcp"
  | "slash_commands"
  | "ai_settings";

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
      });
    }
    if (normalizedCommands.length === 0) {
      continue;
    }
    normalized[normalizedProjectConfigId] = normalizedCommands;
  }
  return normalized;
}

type ZustandLocalStorage = {
  snapToGrid: boolean;
  showAgenticEdges: boolean;
  showArgEdges: boolean;
  darkMode: boolean;
  colorMode: ColorModePreference;
  showMinimap: boolean;
  minimapSide: MiniMapSide;
  projectConfigPreviewEnabled: boolean;
  appSpecStreamingEnabled: boolean;
  homeProjectGalleryViewMode: HomeProjectGalleryViewMode;
  favoriteProjectConfigIds: string[];
  overviewProjectConfigOrder: string[];
  homeWorkspacePaneVis: boolean;
  homeWorkspacePaneWidth: number;
  homeWorkspacePaneTrueWidth: number;
  homeSelectedProjectPaneVis: boolean;
  homeSelectedProjectPaneWidth: number;
  homeSelectedProjectPaneTrueWidth: number;
  appGenerationMode: AppGenerationMode;
  appGenerationPrompt: string;
  appGenerationReferenceImageUrl: string;
  appGenerationReferenceImageNotes: string;
  overviewVis: boolean;
  overviewWidth: number;
  overviewTrueWidth: number;
  overviewTab: OverviewTabKey;
  overviewNotificationsPaneTab: OverviewNotificationsPaneTab;
  watchCodePortalOpen: boolean;
  gitGraphSplitPct: number;
  gitGraphColWidthPx: number;
  gitGraphAuthorWidthPx: number;
  gitGraphDateWidthPx: number;
  gitGraphHashWidthPx: number;
  uiEditorVis: boolean;
  uiEditorWidth: number;
  uiEditorTrueWidth: number;
  uiEditorTab: UIEditorTabLocalStorage;
  showNavBarHelpMessage: boolean;
  tooltipWidth: number;
  customRunsByProjectConfigId: Record<string, Array<CustomRunItem>>;
  customProjectChatSlashCommandsByProjectConfigId: Record<
    string,
    Array<ProjectChatCustomSlashCommand>
  >;
  projectChatAuxViewByProjectConfigId: Record<string, ProjectChatAuxView>;
  runSnapshotModeByProjectConfigId: Record<string, RunSnapshotMode>;
  runInstructionsAccordionOpenValuesByProjectConfigId: Record<
    string,
    Array<string>
  >;
  projectAiSettingsAccordionOpenValuesByProjectConfigId: Record<
    string,
    Array<string>
  >;
  viewedProjectChatThreadIdsByProjectConfigId: Record<string, Array<string>>;
  projectChatThreadGroupsByProjectConfigId: Record<
    string,
    Array<{
      id: string;
      name: string;
      collapsed: boolean;
      pinned?: boolean;
    }>
  >;
  projectChatThreadAssignmentsByProjectConfigId: Record<
    string,
    Record<string, string>
  >;
  projectChatThreadOrderByProjectConfigId: Record<string, Array<string>>;
  pinnedProjectChatThreadIdsByProjectConfigId: Record<string, Array<string>>;
  trashedProjectChatThreadIdsByProjectConfigId: Record<string, Array<string>>;
};

export const useLocalStorage = createWithEqualityFn(
  persist<ZustandLocalStorage>(
    () => ({
      snapToGrid: true,
      showAgenticEdges: true,
      showArgEdges: true,
      darkMode: true,
      colorMode: "dark",
      showMinimap: true,
      minimapSide: "left",
      projectConfigPreviewEnabled: true,
      appSpecStreamingEnabled: false,
      homeProjectGalleryViewMode: "thumbnails",
      favoriteProjectConfigIds: [],
      overviewProjectConfigOrder: [],
      homeWorkspacePaneVis: true,
      homeWorkspacePaneWidth: 320,
      homeWorkspacePaneTrueWidth: 320,
      homeSelectedProjectPaneVis: true,
      homeSelectedProjectPaneWidth: 280,
      homeSelectedProjectPaneTrueWidth: 280,
      appGenerationMode: "json_render",
      appGenerationPrompt: "",
      appGenerationReferenceImageUrl: "",
      appGenerationReferenceImageNotes: "",
      overviewVis: true,
      overviewWidth: INITIAL_OVERVIEW_WIDTH,
      overviewTrueWidth: INITIAL_OVERVIEW_WIDTH,
      overviewTab: OverviewTabNameEnum.Overview,
      overviewNotificationsPaneTab:
        OverviewNotificationsPaneTabEnum.Notifications,
      watchCodePortalOpen: false,
      gitGraphSplitPct: DEFAULT_GIT_GRAPH_SPLIT_PCT,
      gitGraphColWidthPx: DEFAULT_GIT_GRAPH_COL_WIDTH_PX,
      gitGraphAuthorWidthPx: DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX,
      gitGraphDateWidthPx: DEFAULT_GIT_GRAPH_DATE_WIDTH_PX,
      gitGraphHashWidthPx: DEFAULT_GIT_GRAPH_HASH_WIDTH_PX,
      uiEditorVis: false,
      uiEditorWidth: INITIAL_UI_EDITOR_WIDTH,
      uiEditorTrueWidth: CLOSED_PANE_WIDTH,
      uiEditorTab: {},
      showNavBarHelpMessage: true,
      tooltipWidth: 256,
      customRunsByProjectConfigId: {},
      customProjectChatSlashCommandsByProjectConfigId: {},
      projectChatAuxViewByProjectConfigId: {},
      runSnapshotModeByProjectConfigId: {},
      runInstructionsAccordionOpenValuesByProjectConfigId: {},
      projectAiSettingsAccordionOpenValuesByProjectConfigId: {},
      viewedProjectChatThreadIdsByProjectConfigId: {},
      projectChatThreadGroupsByProjectConfigId: {},
      projectChatThreadAssignmentsByProjectConfigId: {},
      projectChatThreadOrderByProjectConfigId: {},
      pinnedProjectChatThreadIdsByProjectConfigId: {},
      trashedProjectChatThreadIdsByProjectConfigId: {},
    }),
    {
      name: "setta_data",
      merge: (persistedState, currentState) => {
        const persisted =
          (persistedState as Partial<ZustandLocalStorage> | null) ?? {};
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
        merged.watchCodePortalOpen = false;
        merged.customProjectChatSlashCommandsByProjectConfigId =
          normalizePersistedCustomProjectChatSlashCommandsByProjectConfigId(
            merged.customProjectChatSlashCommandsByProjectConfigId,
          );
        merged.projectChatAuxViewByProjectConfigId = {};
        if (
          !merged.viewedProjectChatThreadIdsByProjectConfigId ||
          typeof merged.viewedProjectChatThreadIdsByProjectConfigId !==
            "object" ||
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
          typeof merged.projectChatThreadAssignmentsByProjectConfigId !==
            "object" ||
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
          typeof merged.pinnedProjectChatThreadIdsByProjectConfigId !==
            "object" ||
          Array.isArray(merged.pinnedProjectChatThreadIdsByProjectConfigId)
        ) {
          merged.pinnedProjectChatThreadIdsByProjectConfigId = {};
        }
        if (
          !merged.trashedProjectChatThreadIdsByProjectConfigId ||
          typeof merged.trashedProjectChatThreadIdsByProjectConfigId !==
            "object" ||
          Array.isArray(merged.trashedProjectChatThreadIdsByProjectConfigId)
        ) {
          merged.trashedProjectChatThreadIdsByProjectConfigId = {};
        }
        return merged;
      },
      partialize: (state) => ({
        snapToGrid: state.snapToGrid,
        showAgenticEdges: state.showAgenticEdges,
        showArgEdges: state.showArgEdges,
        darkMode: state.darkMode,
        colorMode: state.colorMode,
        showMinimap: state.showMinimap,
        projectConfigPreviewEnabled: state.projectConfigPreviewEnabled,
        appSpecStreamingEnabled: state.appSpecStreamingEnabled,
        homeProjectGalleryViewMode: state.homeProjectGalleryViewMode,
        favoriteProjectConfigIds: state.favoriteProjectConfigIds,
        overviewProjectConfigOrder: state.overviewProjectConfigOrder,
        homeWorkspacePaneVis: state.homeWorkspacePaneVis,
        homeWorkspacePaneWidth: state.homeWorkspacePaneWidth,
        homeWorkspacePaneTrueWidth: state.homeWorkspacePaneTrueWidth,
        homeSelectedProjectPaneVis: state.homeSelectedProjectPaneVis,
        homeSelectedProjectPaneWidth: state.homeSelectedProjectPaneWidth,
        homeSelectedProjectPaneTrueWidth:
          state.homeSelectedProjectPaneTrueWidth,
        appGenerationMode: state.appGenerationMode,
        appGenerationPrompt: state.appGenerationPrompt,
        appGenerationReferenceImageUrl: state.appGenerationReferenceImageUrl,
        appGenerationReferenceImageNotes:
          state.appGenerationReferenceImageNotes,
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
        runSnapshotModeByProjectConfigId:
          state.runSnapshotModeByProjectConfigId,
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
      }),
      storage: getPersistStorage(),
    },
  ),
);
