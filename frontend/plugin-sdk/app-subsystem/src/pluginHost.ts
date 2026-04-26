export const SETTA_PLUGIN_FRONTEND_HOST_API_VERSION = 1;

export type SettaPluginServerMode = "ide" | "share" | "app" | "launcher";

export const SettaPluginCanvasControlPlacementEnum = {
  Project: "project",
  Viewport: "viewport",
  Utility: "utility",
} as const;

export type SettaPluginCanvasControlPlacement =
  (typeof SettaPluginCanvasControlPlacementEnum)[keyof typeof SettaPluginCanvasControlPlacementEnum];

export function isSettaPluginCanvasControlPlacement(
  value: string,
): value is SettaPluginCanvasControlPlacement {
  return (
    value === SettaPluginCanvasControlPlacementEnum.Project ||
    value === SettaPluginCanvasControlPlacementEnum.Viewport ||
    value === SettaPluginCanvasControlPlacementEnum.Utility
  );
}

export type SettaPluginCanvasControlProps = {
  pluginId: string;
  controlId: string;
  label: string;
  placement: SettaPluginCanvasControlPlacement;
  serverMode: SettaPluginServerMode;
  effectiveCapabilities: string[];
};

export type SettaPluginCanvasControlRenderer = {
  mount: (el: HTMLElement, props: SettaPluginCanvasControlProps) => void;
  update?: (el: HTMLElement, props: SettaPluginCanvasControlProps) => void;
  unmount?: (el: HTMLElement) => void;
};

export type SettaPluginCanvasControlDefinition = {
  id: string;
  label: string;
  description?: string;
  placement?: SettaPluginCanvasControlPlacement;
  order?: number;
  renderer: SettaPluginCanvasControlRenderer;
};

export type SettaPluginSettingRevealHandlerContext = {
  settingId: string;
  paneId: string | null;
  durationMs: number;
  abortSignal: AbortSignal;
};

export type SettaPluginSettingRevealHandler = (
  context: SettaPluginSettingRevealHandlerContext,
) => boolean | Promise<boolean>;

export type SettaPluginProjectContext = {
  projectConfigId: string;
  serverMode: SettaPluginServerMode;
};

export type SettaPluginProjectStateSelector =
  | { kind: "projectConfig" }
  | { kind: "pluginData"; pluginId: string }
  | { kind: "activeSectionIds" }
  | { kind: "section"; sectionId: string }
  | { kind: "sections"; sectionIds: string[] }
  | { kind: "singletonSections" };

export type SettaPluginProjectStateSubscriptionOptions = {
  fireImmediately?: boolean;
  throttleMs?: number;
};

export type SettaPluginHost = {
  apiVersion: typeof SETTA_PLUGIN_FRONTEND_HOST_API_VERSION;
  pluginId: string;
  serverMode: SettaPluginServerMode;
  effectiveCapabilities: string[];
  registerCanvasControl: (
    definition: SettaPluginCanvasControlDefinition,
  ) => void;
  registerSettingRevealHandler: (
    revealKey: string,
    handler: SettaPluginSettingRevealHandler,
  ) => void;
  getProjectContext: () => SettaPluginProjectContext;
  subscribeProjectContext: (
    listener: (context: SettaPluginProjectContext) => void,
  ) => () => void;
  readProjectState: (selector: SettaPluginProjectStateSelector) => unknown;
  subscribeProjectState: (
    selector: SettaPluginProjectStateSelector,
    listener: (nextValue: unknown, prevValue: unknown | null) => void,
    options?: SettaPluginProjectStateSubscriptionOptions,
  ) => () => void;
  fetchBackendRoute: (path: string, init?: RequestInit) => Promise<Response>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

export function isSettaPluginHost(value: unknown): value is SettaPluginHost {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.apiVersion === SETTA_PLUGIN_FRONTEND_HOST_API_VERSION &&
    typeof value.pluginId === "string" &&
    typeof value.serverMode === "string" &&
    Array.isArray(value.effectiveCapabilities) &&
    isFunction(value.registerCanvasControl) &&
    isFunction(value.registerSettingRevealHandler) &&
    isFunction(value.getProjectContext) &&
    isFunction(value.subscribeProjectContext) &&
    isFunction(value.readProjectState) &&
    isFunction(value.subscribeProjectState) &&
    isFunction(value.fetchBackendRoute)
  );
}
