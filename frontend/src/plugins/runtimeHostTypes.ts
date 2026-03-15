import {
  BaseDependencyKeyUnion,
  BaseDependencyValueUnion,
} from "utils/generatedTypes";
import { type StateCreator, type StoreApi } from "zustand/vanilla";
import { type PluginPaneIconName } from "./paneIcons";
import {
  type PluginProjectStateSelector,
  type PluginProjectStateSubscriptionOptions,
} from "./runtimeProjectStateBridge";

export const PLUGIN_FRONTEND_API_VERSION = 1;

export type PluginServerMode = "ide" | "share" | "app" | "launcher";

export type PluginSectionProps = {
  sectionId: string;
  pluginId: string;
  kind: string;
  data: Record<string, unknown>;
  readOnly: boolean;
  serverMode: PluginServerMode;
  effectiveCapabilities: string[];
};

type PluginSectionRenderer = {
  mount: (el: HTMLElement, props: PluginSectionProps) => void;
  update?: (el: HTMLElement, props: PluginSectionProps) => void;
  unmount?: (el: HTMLElement) => void;
};

export type PluginSectionKindDefinition = {
  kind: string;
  title: string;
  description?: string;
  initialData?: Record<string, unknown>;
  renderer: PluginSectionRenderer;
};

export type RegisteredPluginSectionKind = PluginSectionKindDefinition & {
  pluginId: string;
};

export type PluginPaneProps = {
  pluginId: string;
  serverMode: PluginServerMode;
  effectiveCapabilities: string[];
};

export type PluginSettingRevealHandlerContext = {
  settingId: string;
  paneId: string | null;
  durationMs: number;
  abortSignal: AbortSignal;
};

export type PluginSettingRevealHandler = (
  context: PluginSettingRevealHandlerContext,
) => boolean | Promise<boolean>;

type PluginPaneRenderer = {
  mount: (el: HTMLElement, props: PluginPaneProps) => void;
  update?: (el: HTMLElement, props: PluginPaneProps) => void;
  unmount?: (el: HTMLElement) => void;
};

export type PluginPaneDefinition = {
  id: string;
  title: string;
  description?: string;
  icon?: PluginPaneIconName;
  renderer: PluginPaneRenderer;
};

export type RegisteredPluginPane = PluginPaneDefinition & {
  pluginId: string;
};

export type PluginCommandDefinition = {
  id: string;
  title: string;
  description?: string;
  run: () => void | Promise<void>;
};

export type RegisteredPluginCommand = PluginCommandDefinition & {
  pluginId: string;
};

export type PluginTopNavBarItemDefinition = {
  id: string;
  label: string;
  description?: string;
  order?: number;
  onClick: () => void | Promise<void>;
};

export type RegisteredPluginTopNavBarItem = PluginTopNavBarItemDefinition & {
  pluginId: string;
};

export type PluginFrontendError = {
  code: string;
  message: string;
};

export type PluginProjectContext = {
  projectConfigId: string;
  serverMode: PluginServerMode;
};

export type PluginRealtimeDependencyEvent = {
  dependencyKey: BaseDependencyKeyUnion;
  payload?: BaseDependencyValueUnion | null;
  binaryPayload?: ArrayBuffer;
  timestampMs?: number;
};

export type PluginSectionRealtimeEmitOptions = {
  timestampMs?: number;
};

export type SettaPluginHost = {
  apiVersion: number;
  pluginId: string;
  serverMode: PluginServerMode;
  effectiveCapabilities: string[];
  createStore: <TState extends object>(
    initializer: StateCreator<TState, [], []>,
  ) => StoreApi<TState>;
  registerSectionKind: (definition: PluginSectionKindDefinition) => void;
  registerPane: (definition: PluginPaneDefinition) => void;
  registerSettingRevealHandler: (
    revealKey: string,
    handler: PluginSettingRevealHandler,
  ) => void;
  registerCommand: (definition: PluginCommandDefinition) => void;
  registerTopNavBarItem: (definition: PluginTopNavBarItemDefinition) => void;
  registerContextMenu: (_definition: Record<string, unknown>) => void;
  getProjectContext: () => PluginProjectContext;
  subscribeProjectContext: (
    listener: (context: PluginProjectContext) => void,
  ) => () => void;
  readProjectState: (selector: PluginProjectStateSelector) => unknown;
  subscribeProjectState: (
    selector: PluginProjectStateSelector,
    listener: (nextValue: unknown, prevValue: unknown | null) => void,
    options?: PluginProjectStateSubscriptionOptions,
  ) => () => void;
  emitRealtimeDependencyEvent: (event: PluginRealtimeDependencyEvent) => void;
  emitSectionRealtimeValue: (
    sectionId: string,
    value: unknown,
    options?: PluginSectionRealtimeEmitOptions,
  ) => void;
  readSection: (sectionId: string) => Record<string, unknown>;
  updateSection: (
    sectionId: string,
    patch: Partial<{
      data: Record<string, unknown>;
      kind: string;
      schemaVersion: number | null;
    }>,
  ) => void;
  openArtifact: (artifactId: string) => void;
  createArtifact: (
    payload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
};

export type PluginFrontendModule = {
  apiVersion?: unknown;
  register?: unknown;
};

export type PluginRegistryAccumulator = {
  sectionKinds: Record<string, RegisteredPluginSectionKind>;
  panes: Record<string, RegisteredPluginPane[]>;
  commands: Record<string, RegisteredPluginCommand[]>;
  topNavBarItems: Record<string, RegisteredPluginTopNavBarItem[]>;
};

export function createEmptyPluginRegistryAccumulator(): PluginRegistryAccumulator {
  return {
    sectionKinds: {},
    panes: {},
    commands: {},
    topNavBarItems: {},
  };
}

export function toPluginSectionKindKey(pluginId: string, kind: string): string {
  return `${pluginId}::${kind}`;
}
