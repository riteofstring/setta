import type { ChatSharedEdgeMode } from "state/actions/chatSharedHandleIds";
import {
  CLOSED_PANE_WIDTH,
  INITIAL_OVERVIEW_WIDTH,
  INITIAL_UI_EDITOR_WIDTH,
  OverviewNotificationsPaneTab,
  OverviewNotificationsPaneTabEnum,
  OverviewTabKey,
  OverviewTabNameEnum,
  UIEditorTabLocalStorage,
} from "utils/constants";
import { type SettingsState } from "utils/generatedTypes";
import {
  DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX,
  DEFAULT_GIT_GRAPH_COL_WIDTH_PX,
  DEFAULT_GIT_GRAPH_DATE_WIDTH_PX,
  DEFAULT_GIT_GRAPH_HASH_WIDTH_PX,
  DEFAULT_GIT_GRAPH_SPLIT_PCT,
} from "utils/gitGraphLayoutDefaults";
import type {
  ProjectChatAuxView,
  ProjectChatCustomSlashCommand,
} from "./aiStores";
import type { CustomRunItem } from "./projectStatusStores";

type RunSnapshotMode = SettingsState["backend"]["runSnapshotMode"];

export type ColorModePreference = "dark" | "light" | "auto";
export type HomeProjectGalleryViewMode = "thumbnails" | "list";
type MiniMapSide = "left" | "right";

export type UIPreferenceState = {
  snapToGrid: boolean;
  showAgenticEdges: boolean;
  showArgEdges: boolean;
  chatSharedEdgeMode: ChatSharedEdgeMode;
  darkMode: boolean;
  colorMode: ColorModePreference;
  showMinimap: boolean;
  minimapSide: MiniMapSide;
  projectConfigPreviewEnabled: boolean;
  homeProjectGalleryViewMode: HomeProjectGalleryViewMode;
  favoriteProjectConfigIds: string[];
  overviewProjectConfigOrder: string[];
  homeWorkspacePaneVis: boolean;
  homeWorkspacePaneWidth: number;
  homeWorkspacePaneTrueWidth: number;
  homeSelectedProjectPaneVis: boolean;
  homeSelectedProjectPaneWidth: number;
  homeSelectedProjectPaneTrueWidth: number;
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
  projectChatDraftMessageByProjectConfigId: Record<string, string>;
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

export function createDefaultUIPreferenceState(): UIPreferenceState {
  return {
    snapToGrid: true,
    showAgenticEdges: true,
    showArgEdges: true,
    chatSharedEdgeMode: "agentic",
    darkMode: true,
    colorMode: "dark",
    showMinimap: true,
    minimapSide: "left",
    projectConfigPreviewEnabled: true,
    homeProjectGalleryViewMode: "thumbnails",
    favoriteProjectConfigIds: [],
    overviewProjectConfigOrder: [],
    homeWorkspacePaneVis: true,
    homeWorkspacePaneWidth: 320,
    homeWorkspacePaneTrueWidth: 320,
    homeSelectedProjectPaneVis: true,
    homeSelectedProjectPaneWidth: 280,
    homeSelectedProjectPaneTrueWidth: 280,
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
    projectChatDraftMessageByProjectConfigId: {},
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
  };
}
