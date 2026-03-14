import requiredUIEditorTabsBySectionTypePayload from "../../../../backend/setta/ui_settings/section_ui_editor_tab_compatibility.json";
import { ObjectValues, SectionType, SectionTypeEnum } from "../generatedTypes";

export const INITIAL_OVERVIEW_WIDTH = 335;
export const INITIAL_UI_EDITOR_WIDTH = 500;
export const CLOSED_PANE_WIDTH = 40;

export const PaneNameEnum = {
  overview: "overview",
  uiEditor: "uiEditor",
  homeWorkspace: "homeWorkspace",
  homeSelectedProject: "homeSelectedProject",
} as const;

export type PaneName = ObjectValues<typeof PaneNameEnum>;

export const OverviewTabNameEnum = {
  Overview: "Overview",
  Plugins: "Plugins",
  FileBrowser: "FileBrowser",
  Git: "Git",
  App: "App",
  RunInstructions: "RunInstructions",
  ViewModes: "ViewModes",
  Notifications: "Notifications",
  ProjectAIChat: "ProjectAIChat",
  ProjectAISettings: "ProjectAISettings",
} as const;

export type OverviewTabName = ObjectValues<typeof OverviewTabNameEnum>;

export const OverviewNotificationsPaneTabEnum = {
  Notifications: "notifications",
  BackendLogs: "backend_logs",
} as const;

export type OverviewNotificationsPaneTab = ObjectValues<
  typeof OverviewNotificationsPaneTabEnum
>;

type PluginOverviewTabName = `PluginPane:${string}:${string}`;

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

export const OverviewTabNamePrettified = {
  [OverviewTabNameEnum.Overview]: "Overview",
  [OverviewTabNameEnum.Plugins]: "Plugins",
  [OverviewTabNameEnum.FileBrowser]: "Explorer",
  [OverviewTabNameEnum.Git]: "Git",
  [OverviewTabNameEnum.App]: "App",
  [OverviewTabNameEnum.RunInstructions]: "Custom Runs",
  [OverviewTabNameEnum.ViewModes]: "View Modes",
  [OverviewTabNameEnum.Notifications]: "Notifications",
  [OverviewTabNameEnum.ProjectAIChat]: "Project AI Chat",
  [OverviewTabNameEnum.ProjectAISettings]: "Project AI Settings",
} as const satisfies Record<OverviewTabName, string>;

const PLUGIN_OVERVIEW_TAB_PREFIX = "PluginPane";

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

export const UIEditorTabNameEnum = {
  SectionConfig: "SectionConfig",
  QuickInfoConfig: "QuickInfoConfig",
  UIConfig: "UIConfig",
  InfoConfig: "InfoConfig",
  SectionVariantsConfig: "SectionVariantsConfig",
} as const;

export type UIEditorTabName = ObjectValues<typeof UIEditorTabNameEnum>;

export const UIEditorTabNamePrettified = {
  [UIEditorTabNameEnum.UIConfig]: "Params",
  [UIEditorTabNameEnum.SectionConfig]: "Section",
  [UIEditorTabNameEnum.QuickInfoConfig]: "Quick Info",
  [UIEditorTabNameEnum.InfoConfig]: "Text Editor",
  [UIEditorTabNameEnum.SectionVariantsConfig]: "Version",
} as const satisfies Record<UIEditorTabName, string>;

function buildRequiredUIEditorTabs(): Record<
  SectionType,
  readonly UIEditorTabName[]
> {
  const sectionTypeValues = Object.values(SectionTypeEnum) as SectionType[];
  const uiEditorTabValues = new Set<string>(Object.values(UIEditorTabNameEnum));
  const requiredTabsBySectionType: Partial<
    Record<SectionType, readonly UIEditorTabName[]>
  > = {};

  for (const sectionType of sectionTypeValues) {
    const rawRequiredTabs =
      requiredUIEditorTabsBySectionTypePayload[sectionType];
    if (!Array.isArray(rawRequiredTabs)) {
      throw new Error(
        `Missing required UI editor tabs compatibility entry for section type ${sectionType}.`,
      );
    }
    const requiredTabs: UIEditorTabName[] = [];
    for (const rawTabName of rawRequiredTabs) {
      if (
        typeof rawTabName !== "string" ||
        !uiEditorTabValues.has(rawTabName)
      ) {
        throw new Error(
          `Invalid UI editor tab compatibility entry for ${sectionType}: ${String(rawTabName)}`,
        );
      }
      requiredTabs.push(rawTabName as UIEditorTabName);
    }
    requiredTabsBySectionType[sectionType] = requiredTabs;
  }

  return requiredTabsBySectionType as Record<
    SectionType,
    readonly UIEditorTabName[]
  >;
}

export const REQUIRED_UI_EDITOR_TABS = buildRequiredUIEditorTabs();

export type UIEditorTabLocalStorage = Record<SectionType, UIEditorTabName>;
