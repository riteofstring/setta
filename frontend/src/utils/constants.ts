import { ObjectValues, SectionType, SectionTypeEnum } from "./generatedTypes";

export const NO_CONTEXT_MENU = import.meta.env.MODE === "ncm";

export const INITIAL_OVERVIEW_WIDTH = 335;
export const INITIAL_UI_EDITOR_WIDTH = 500;
export const CLOSED_PANE_WIDTH = 50;
export const NAVBAR_HEIGHT = 48;

export const PaneNameEnum = {
  overview: "overview",
  uiEditor: "uiEditor",
} as const;

export type PaneName = ObjectValues<typeof PaneNameEnum>;

export const OverviewTabNameEnum = {
  Overview: "Overview",
  ProjectConfigs: "ProjectConfigs",
  ViewModes: "ViewModes",
  Notifications: "Notifications",
  ProjectAIChat: "ProjectAIChat",
  ProjectAISettings: "ProjectAISettings",
} as const;

export type OverviewTabName = ObjectValues<typeof OverviewTabNameEnum>;

export const OverviewTabNamePrettified = {
  [OverviewTabNameEnum.Overview]: "Overview",
  [OverviewTabNameEnum.ProjectConfigs]: "Project Configs",
  [OverviewTabNameEnum.ViewModes]: "View Modes",
  [OverviewTabNameEnum.Notifications]: "Notifications",
  [OverviewTabNameEnum.ProjectAIChat]: "Project AI Chat",
  [OverviewTabNameEnum.ProjectAISettings]: "Project AI Settings",
} as const satisfies Record<OverviewTabName, string>;

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

export const REQUIRED_UI_EDITOR_TABS = {
  [SectionTypeEnum.Callable]: [
    UIEditorTabNameEnum.UIConfig,
    UIEditorTabNameEnum.QuickInfoConfig,
    UIEditorTabNameEnum.SectionVariantsConfig,
  ],
  [SectionTypeEnum.Dict]: [
    UIEditorTabNameEnum.UIConfig,
    UIEditorTabNameEnum.QuickInfoConfig,
    UIEditorTabNameEnum.SectionVariantsConfig,
  ],
  [SectionTypeEnum.GlobalVariables]: [
    UIEditorTabNameEnum.UIConfig,
    UIEditorTabNameEnum.QuickInfoConfig,
    UIEditorTabNameEnum.SectionVariantsConfig,
  ],
  [SectionTypeEnum.ListRoot]: [
    UIEditorTabNameEnum.SectionConfig,
    UIEditorTabNameEnum.SectionVariantsConfig,
  ],
  [SectionTypeEnum.DictRoot]: [
    UIEditorTabNameEnum.SectionConfig,
    UIEditorTabNameEnum.SectionVariantsConfig,
  ],
  [SectionTypeEnum.Code]: [
    UIEditorTabNameEnum.SectionConfig,
    UIEditorTabNameEnum.SectionVariantsConfig,
  ],
  [SectionTypeEnum.GenPythonCode]: [UIEditorTabNameEnum.SectionConfig],
  [SectionTypeEnum.TextBlock]: [
    UIEditorTabNameEnum.SectionConfig,
    UIEditorTabNameEnum.InfoConfig,
    UIEditorTabNameEnum.SectionVariantsConfig,
  ],
  [SectionTypeEnum.Social]: [UIEditorTabNameEnum.SectionConfig],
  [SectionTypeEnum.Group]: [UIEditorTabNameEnum.SectionConfig],
  [SectionTypeEnum.Terminal]: [UIEditorTabNameEnum.SectionConfig],
  [SectionTypeEnum.Draw]: [UIEditorTabNameEnum.SectionConfig],
  [SectionTypeEnum.Image]: [UIEditorTabNameEnum.SectionConfig],
  [SectionTypeEnum.Chart]: [UIEditorTabNameEnum.SectionConfig],
  [SectionTypeEnum.IFrame]: [],
  [SectionTypeEnum.Chat]: [],
  [SectionTypeEnum.Browser]: [],
} as const satisfies Record<SectionType, readonly UIEditorTabName[]>;

export type UIEditorTabLocalStorage = Record<SectionType, UIEditorTabName>;

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
export const SETTINGS_PROJECT_NAME = "settings";
export const SETTINGS_ROUTER_PATH = `/${SETTINGS_PROJECT_NAME}`;

export function pathRelativeToProject(projectConfigName) {
  return `../${projectConfigName}`;
}

export const MODAL_PURPOSE = { LOAD: "LOAD", SAVE: "SAVE" };

export const MODAL_TYPE = {
  LOAD_PROJECT_CONFIG: {
    purpose: MODAL_PURPOSE.LOAD,
    title: "Load Project Config",
    buttonText: "Load",
  },
  SAVE_PROJECT_CONFIG_AS: {
    purpose: MODAL_PURPOSE.SAVE,
    title: "Save Project Config As",
    buttonText: "Save As",
  },
  SAVE_PROJECT_CONFIG_AS_WITH_REFS: {
    purpose: MODAL_PURPOSE.SAVE,
    title: "Save Project Config As (With Refs)",
    buttonText: "Save As",
  },
  EXPORT_JSON: {
    purpose: null,
    title: "Export JSON",
    buttonText: null,
  },
  IMPORT_JSON: {
    purpose: null,
    title: "Import JSON",
    buttonText: "Import",
  },
  SAVE_UI_TYPE_CONFIG: {
    purpose: MODAL_PURPOSE.SAVE,
    title: "Save UI Type Config",
    buttonText: "Save",
  },
  SAVE_CUSTOM_ARGUMENTS: {
    purpose: MODAL_PURPOSE.SAVE,
    title: "Save Custom Arguments",
    buttonText: "Save",
  },
  DELETE_PROJECT_WARNING: {
    purpose: null,
    title: "Confirm Deletion",
  },
  RENAME_REFERENCES: {
    purpose: null,
    title: "Rename References",
    buttonText: "Rename",
  },
  DELETE_JSON_SOURCE_FILE: {
    purpose: null,
    title: "Delete JSON Source File",
    buttonText: "Delete",
  },
  ADD_ARTIFACT_BY_FILEPATH: {
    purpose: null,
    title: "Add Artifact By Filepath",
    buttonText: "Delete",
  },
};

export const PAGE_LOAD_TYPES = {
  LOAD_PROJECT_CONFIG: "LOAD_PROJECT_CONFIG",
  CHANGE_PROJECT_CONFIG_NAME: "CHANGE_PROJECT_CONFIG_NAME",
};

export const NO_DRAG_CLASS_NAME = "nodrag";
export const NO_WHEEL_CLASS_NAME = "nowheel";
export const NO_PAN_CLASS_NAME = "nopan";
export const SETTA_PREVENT_SECTION_ACTIVE_CSS =
  "setta-prevent-section-active-css";
export const SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER =
  "setta-prevent-section-on-click-trigger";
export const SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION =
  "setta-prevent-arrow-keys-moving-section";

export const SECTION_DISPLAY_MODES = {
  YAML: "YAML",
  GUI: "GUI",
};

export const MODEL_GROUPS = [
  {
    group: "Anthropic",
    items: [
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
      { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet" },
      { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
      { id: "claude-3-5-sonnet-20240620", name: "Claude 3.5 Sonnet" },
      { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet" },
    ],
  },
  {
    group: "OpenAI",
    items: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
      { id: "gpt-4", name: "GPT-4" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
    ],
  },
];

export const ProjectSearchModeEnum = {
  find: "find",
  advanced: "advanced",
  commandPalette: "commandPalette",
} as const;

export type ProjectSearchMode = ObjectValues<typeof ProjectSearchModeEnum>;
