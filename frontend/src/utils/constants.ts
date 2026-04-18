import { C } from "./c";
import {
  ObjectValues,
  OverviewTabUIConfig,
  RequiredUIEditorTabs,
  UIEditorTabUIConfig,
  type OverviewTabName,
  type PluginOverviewTabPrefix,
  type SectionType,
  type UIEditorTabName,
} from "./generatedTypes";

export type { OverviewTabName, UIEditorTabName } from "./generatedTypes";

export const UIEditorTabNameEnum = UIEditorTabUIConfig.names as Readonly<
  Record<keyof typeof UIEditorTabUIConfig.names, UIEditorTabName>
>;
export type UIEditorTabLocalStorage = Record<SectionType, UIEditorTabName>;
export const REQUIRED_UI_EDITOR_TABS = RequiredUIEditorTabs as Readonly<
  Record<SectionType, readonly UIEditorTabName[]>
>;

export const NO_CONTEXT_MENU = import.meta.env.MODE === "ncm";

export const INITIAL_OVERVIEW_WIDTH = 335;
export const INITIAL_UI_EDITOR_WIDTH = 500;
export const CLOSED_PANE_WIDTH = 40;
export const HOME_COMPACT_LAYOUT_BREAKPOINT_PX = 1100;
export const NAVBAR_HEIGHT = 36;

export const PaneNameEnum = {
  overview: "overview",
  uiEditor: "uiEditor",
  homeWorkspace: "homeWorkspace",
  homeSelectedProject: "homeSelectedProject",
} as const;

export type PaneName = ObjectValues<typeof PaneNameEnum>;

export const OverviewTabNameEnum = OverviewTabUIConfig.names as Readonly<
  Record<keyof typeof OverviewTabUIConfig.names, OverviewTabName>
>;
export const OverviewNotificationsPaneTabEnum = {
  Notifications: "notifications",
  BackendLogs: "backend_logs",
} as const;
export type OverviewNotificationsPaneTab = ObjectValues<
  typeof OverviewNotificationsPaneTabEnum
>;
const PLUGIN_OVERVIEW_TAB_PREFIX: PluginOverviewTabPrefix =
  OverviewTabUIConfig.pluginPanePrefix;
type PluginOverviewTabName =
  `${typeof PLUGIN_OVERVIEW_TAB_PREFIX}:${string}:${string}`;
export type OverviewTabKey = OverviewTabName | PluginOverviewTabName;
const overviewTabNameValues = new Set<string>(
  Object.values(OverviewTabNameEnum),
);

function isOverviewTabName(value: unknown): value is OverviewTabName {
  return typeof value === "string" && overviewTabNameValues.has(value);
}

export function isOverviewTabKey(value: unknown): value is OverviewTabKey {
  return (
    isOverviewTabName(value) ||
    (typeof value === "string" &&
      parsePluginPaneOverviewTabName(value) !== null)
  );
}

export const OverviewTabNamePrettified = OverviewTabUIConfig.titles as Readonly<
  Record<OverviewTabName, string>
>;

// Keep this encode/decode logic aligned with Go's buildPluginPaneOverviewTabKey:
// Go emits canonical reveal keys, while the frontend must build and parse the
// same keys locally for routing and tab state without a round trip.
export function buildPluginPaneOverviewTabName(
  pluginId: string,
  paneId: string,
): PluginOverviewTabName {
  return `${PLUGIN_OVERVIEW_TAB_PREFIX}:${encodeURIComponent(pluginId)}:${encodeURIComponent(paneId)}`;
}

export function parsePluginPaneOverviewTabName(
  tabName: string,
): { pluginId: string; paneId: string } | null {
  if (!tabName.startsWith(`${PLUGIN_OVERVIEW_TAB_PREFIX}:`)) {
    return null;
  }
  const parts = tabName.split(":");
  if (parts.length !== 3) {
    return null;
  }
  const pluginIdPart = parts[1];
  const paneIdPart = parts[2];
  if (!pluginIdPart || !paneIdPart) {
    return null;
  }
  try {
    return {
      pluginId: decodeURIComponent(pluginIdPart),
      paneId: decodeURIComponent(paneIdPart),
    };
  } catch {
    return null;
  }
}

export const UIEditorTabNamePrettified = UIEditorTabUIConfig.titles as Readonly<
  Record<UIEditorTabName, string>
>;

export const PROJECT_CONFIG_PREVIEW_IMG_COLORS = [
  "bg-red-500/60 dark:bg-red-600/30",
  "bg-pink-500/60 dark:bg-pink-600/30",
  "bg-purple-500/60 dark:bg-purple-600/30",
  "bg-indigo-500/60 dark:bg-indigo-600/30",
  "bg-blue-500/60 dark:bg-blue-600/30",
  "bg-green-500/60 dark:bg-green-600/30",
  "bg-yellow-500/60 dark:bg-yellow-600/30",
  "bg-orange-500/60 dark:bg-orange-600/30",
];

export const INDEX_ROUTER_PATH = "/";
export const HOME_ROUTER_PATH = "/home";
export const PROJECT_CONFIG_ROUTER_PATH = "/:projectConfigName";
const PROJECT_CHAT_STANDALONE_ROUTE_SEGMENT = "chat";
const PROJECT_SECTION_STANDALONE_ROUTE_SEGMENT = "section";
export const PROJECT_WINDOW_SPACE_STANDALONE_ROUTE_SEGMENT = "windowspace";
export const PROJECT_CHAT_STANDALONE_ROUTER_PATH = `/:projectConfigName/${PROJECT_CHAT_STANDALONE_ROUTE_SEGMENT}`;
export const PROJECT_CHAT_THREAD_STANDALONE_ROUTER_PATH = `/:projectConfigName/${PROJECT_CHAT_STANDALONE_ROUTE_SEGMENT}/:chatId`;
export const SECTION_STANDALONE_ROUTER_PATH = `/:projectConfigName/${PROJECT_SECTION_STANDALONE_ROUTE_SEGMENT}/:sectionSlug`;
export const WINDOW_SPACE_STANDALONE_ROUTER_PATH = `/:projectConfigName/${PROJECT_WINDOW_SPACE_STANDALONE_ROUTE_SEGMENT}/:windowSpaceSlug`;
export const VIEW_MODE_ROUTER_PATH = "/:projectConfigName/view/:viewModeName";
export const WORKSPACE_LAUNCH_ROUTER_PATH = "/launching";
export const SETTINGS_ROUTER_PATH = `/${C.SETTINGS_PROJECT_NAME}`;

export function buildSharePath(
  targetProjectConfigName: string | null | undefined,
): string {
  if (targetProjectConfigName) {
    return `/${targetProjectConfigName}`;
  }
  return INDEX_ROUTER_PATH;
}

export function resolveHomePath(pathname: string): string {
  void pathname;
  return HOME_ROUTER_PATH;
}

export function pathRelativeToProject(projectConfigName: string) {
  return `../${projectConfigName}`;
}

export const PAGE_LOAD_TYPES = {
  LOAD_PROJECT_CONFIG: "LOAD_PROJECT_CONFIG",
  CHANGE_PROJECT_CONFIG_NAME: "CHANGE_PROJECT_CONFIG_NAME",
};

export const NO_DRAG_CLASS_NAME = "nodrag";
export const NO_WHEEL_CLASS_NAME = "nowheel";
export const NO_PAN_CLASS_NAME = "nopan";
export const APP_PANE_Z_INDEX_CLASS_NAME = "z-[30]";
export const APP_CHROME_Z_INDEX_CLASS_NAME = "z-[32]";
export const APP_MENU_Z_INDEX_CLASS_NAME = "z-[35]";
export const APP_FLOATING_BOX_Z_INDEX_CLASS_NAME = "z-[80]";
export const MODAL_OVERLAY_Z_INDEX_CLASS_NAME = "z-[90]";
export const SETTA_PREVENT_SECTION_ACTIVE_CSS =
  "setta-prevent-section-active-css";
export const SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER =
  "setta-prevent-section-on-click-trigger";
export const CODEMIRROR_TOOLTIP_PARENT_ID = "setta-codemirror-tooltips";
export const SETTA_POPOVER_PORTAL_PARENT_ID = "setta-popover-portals";
export const SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION =
  "setta-prevent-arrow-keys-moving-section";
const EDGES_STRIP_HEIGHT_KEY_PREFIX = "edges-strip-height";
const KWARGS_CONTROLS_HEIGHT_KEY_PREFIX = "kwargs-controls-height";
const PINNED_PARAMS_AREA_HEIGHT_KEY_PREFIX = "pinned-params-area-height";
const UNPINNED_PARAMS_AREA_HEIGHT_KEY_PREFIX = "unpinned-params-area-height";
const PARAMS_FIXED_HEIGHT_KEY_PREFIX = "params-fixed-height";
const SECTION_HEADER_HEIGHT_KEY_PREFIX = "section-header-height";
const SECTION_SEARCH_HEIGHT_KEY_PREFIX = "section-search-height";
const SECTION_STYLE_PREVIEW_COLOR_KEY_PREFIX = "section-style-preview-color";

export function getEdgesStripHeightKey(sectionId: string) {
  return `${EDGES_STRIP_HEIGHT_KEY_PREFIX}-${sectionId}`;
}

export function getKwargsControlsHeightKey(sectionId: string) {
  return `${KWARGS_CONTROLS_HEIGHT_KEY_PREFIX}-${sectionId}`;
}

export function getPinnedParamsAreaHeightKey(sectionId: string) {
  return `${PINNED_PARAMS_AREA_HEIGHT_KEY_PREFIX}-${sectionId}`;
}

export function getUnpinnedParamsAreaHeightKey(sectionId: string) {
  return `${UNPINNED_PARAMS_AREA_HEIGHT_KEY_PREFIX}-${sectionId}`;
}

export function getParamsFixedHeightKey(sectionId: string) {
  return `${PARAMS_FIXED_HEIGHT_KEY_PREFIX}-${sectionId}`;
}

export function getSectionHeaderHeightKey(sectionId: string) {
  return `${SECTION_HEADER_HEIGHT_KEY_PREFIX}-${sectionId}`;
}

export function getSectionSearchHeightKey(sectionId: string) {
  return `${SECTION_SEARCH_HEIGHT_KEY_PREFIX}-${sectionId}`;
}

export function getSectionStylePreviewColorKey(sectionId: string) {
  return `${SECTION_STYLE_PREVIEW_COLOR_KEY_PREFIX}-${sectionId}`;
}

export const ProjectSearchModeEnum = {
  find: "find",
  advanced: "advanced",
  commandPalette: "commandPalette",
} as const;

export type ProjectSearchMode = ObjectValues<typeof ProjectSearchModeEnum>;
