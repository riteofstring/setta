import {
  isAppSubsystemFrontendRegistration,
  type AppSubsystemFrontendRegistration,
  type RegisteredAppSubsystemFrontendRegistration,
} from "@setta/app-subsystem-frontend-sdk";
import throttle from "lodash/throttle";
import { sendRealtimeDependencyEvent } from "state/actions/realtimeDependencySend";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useActiveSectionUI, useProjectState } from "state/definitions";
import {
  BaseDependencyKeyUnion,
  BaseDependencyValueUnion,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  PluginListEntry,
  PluginRuntimeStateEnum,
  PluginStatusEntry,
  SectionDependencyKey,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { buildShareSessionHeaders } from "utils/shareSessionHeaders";
import { buildBackendOriginURL } from "utils/transportUrlCore";
import { createStore, type StateCreator, type StoreApi } from "zustand/vanilla";
import {
  isPluginPaneIconName,
  PluginPaneIconNameEnum,
  type PluginPaneIconName,
} from "./paneIcons";
import {
  isPluginCanvasControlPlacement,
  PluginCanvasControlPlacementEnum,
  PluginFrontendErrorCodeEnum,
  toPluginSectionKindKey,
  type PluginCanvasControlDefinition,
  type PluginFrontendErrorCode,
  type PluginPaneDefinition,
  type PluginServerMode,
  type RegisteredPluginCanvasControl,
  type RegisteredPluginPane,
} from "./runtimeShared";
import { buildPluginAssetUrl } from "./transport";

const PLUGIN_FRONTEND_API_VERSION = 1;

const sectionKindCapability = "registerSectionKinds";
const paneCapability = "registerPane";
const settingRevealHandlerCapability = "registerSettingRevealHandler";
const commandCapability = "registerCommand";
const topNavBarCapability = "registerTopNavBarItem";
const canvasControlCapability = "registerCanvasControl";
const contextMenuCapability = "registerContextMenu";
const readProjectStateCapability = "readProjectState";
const subscribeProjectStateCapability = "subscribeProjectState";
const emitListenerEventsCapability = "emitListenerEvents";
const watchCodeSettingsMutationCapability = "mutateWatchCodeSettings";

type PluginSectionProps = {
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

type PluginSectionKindDefinition = {
  kind: string;
  title: string;
  description?: string;
  initialData?: Record<string, unknown>;
  renderer: PluginSectionRenderer;
};

export type RegisteredPluginSectionKind = PluginSectionKindDefinition & {
  pluginId: string;
};

type PluginSettingRevealHandlerContext = {
  settingId: string;
  paneId: string | null;
  durationMs: number;
  abortSignal: AbortSignal;
};

type PluginSettingRevealHandler = (
  context: PluginSettingRevealHandlerContext,
) => boolean | Promise<boolean>;

type PluginCommandDefinition = {
  id: string;
  title: string;
  description?: string;
  run: () => void | Promise<void>;
};

export type RegisteredPluginCommand = PluginCommandDefinition & {
  pluginId: string;
};

type PluginTopNavBarItemDefinition = {
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
  code: PluginFrontendErrorCode;
  message: string;
};

type PluginProjectContext = {
  projectConfigId: string;
  serverMode: PluginServerMode;
};

type PluginProjectStateSelector =
  | { kind: "projectConfig" }
  | { kind: "pluginData"; pluginId: string }
  | { kind: "activeSectionIds" }
  | { kind: "section"; sectionId: string }
  | { kind: "sections"; sectionIds: string[] }
  | { kind: "singletonSections" };

type PluginProjectStateSubscriptionOptions = {
  fireImmediately?: boolean;
  throttleMs?: number;
};

type PluginRealtimeDependencyEvent = {
  dependencyKey: BaseDependencyKeyUnion;
  payload?: BaseDependencyValueUnion | null;
  binaryPayload?: ArrayBuffer;
  timestampMs?: number;
};

type PluginSectionRealtimeEmitOptions = {
  timestampMs?: number;
};

type PluginWatchCodeFolderInput = {
  path: string;
  recursive: boolean;
};

type PluginSetWatchCodeEnabledPayload = {
  projectConfigId: string;
  enabled: boolean;
};

type PluginSetWatchCodeInputsPayload = {
  projectConfigId: string;
  watchCodeFolders: PluginWatchCodeFolderInput[];
  watchCodeFiles: string[];
};

type SettaPluginHost = {
  apiVersion: number;
  pluginId: string;
  serverMode: PluginServerMode;
  effectiveCapabilities: string[];
  createStore: <TState extends object>(
    initializer: StateCreator<TState, [], []>,
  ) => StoreApi<TState>;
  registerAppSubsystem: (definition: AppSubsystemFrontendRegistration) => void;
  registerSectionKind: (definition: PluginSectionKindDefinition) => void;
  registerPane: (definition: PluginPaneDefinition) => void;
  registerSettingRevealHandler: (
    revealKey: string,
    handler: PluginSettingRevealHandler,
  ) => void;
  registerCommand: (definition: PluginCommandDefinition) => void;
  registerTopNavBarItem: (definition: PluginTopNavBarItemDefinition) => void;
  registerCanvasControl: (definition: PluginCanvasControlDefinition) => void;
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
  setWatchCodeEnabled: (
    payload: PluginSetWatchCodeEnabledPayload,
  ) => Promise<boolean>;
  setWatchCodeInputs: (
    payload: PluginSetWatchCodeInputsPayload,
  ) => Promise<boolean>;
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
};

type PluginFrontendModule = {
  apiVersion?: unknown;
  register?: unknown;
};

export type PluginRegistryAccumulator = {
  appSubsystemRegistrationsByPluginId: Record<
    string,
    RegisteredAppSubsystemFrontendRegistration
  >;
  sectionKinds: Record<string, RegisteredPluginSectionKind>;
  panes: Record<string, RegisteredPluginPane[]>;
  commands: Record<string, RegisteredPluginCommand[]>;
  topNavBarItems: Record<string, RegisteredPluginTopNavBarItem[]>;
  canvasControls: Record<string, RegisteredPluginCanvasControl[]>;
};

type LoadPluginFrontendResult = {
  error: PluginFrontendError | null;
  registryDelta: PluginRegistryAccumulator | null;
};

const styleHrefByPluginId = new Map<string, string>();
const styleElementByPluginId = new Map<string, HTMLLinkElement>();
const cleanupByPluginId = new Map<string, Set<() => void>>();
const settingRevealHandlersByPluginId = new Map<
  string,
  Map<string, PluginSettingRevealHandler>
>();
const frontendSignatureByPluginId = new Map<string, string>();

export function getRegisteredPluginCleanupIds(): string[] {
  return Array.from(cleanupByPluginId.keys());
}

export function getPluginFrontendSignature(
  pluginId: string,
): string | undefined {
  return frontendSignatureByPluginId.get(pluginId);
}

export function setPluginFrontendSignature(
  pluginId: string,
  signature: string,
): void {
  frontendSignatureByPluginId.set(pluginId, signature);
}

export function deleteInactivePluginFrontendSignatures(
  activePluginIds: Set<string>,
): void {
  for (const pluginId of Array.from(frontendSignatureByPluginId.keys())) {
    if (activePluginIds.has(pluginId)) {
      continue;
    }
    frontendSignatureByPluginId.delete(pluginId);
  }
}

export function indexSectionKindKeysByPluginId(
  sectionKindsByKey: Record<string, RegisteredPluginSectionKind>,
): Record<string, string[]> {
  const sectionKindKeysByPluginId: Record<string, string[]> = {};
  for (const [sectionKindKey, sectionKind] of Object.entries(
    sectionKindsByKey,
  )) {
    const existingKeys = sectionKindKeysByPluginId[sectionKind.pluginId] ?? [];
    existingKeys.push(sectionKindKey);
    sectionKindKeysByPluginId[sectionKind.pluginId] = existingKeys;
  }
  return sectionKindKeysByPluginId;
}

export function shouldLoadPluginFrontend(
  statusEntry: PluginStatusEntry | undefined,
): boolean {
  if (statusEntry === undefined) {
    return false;
  }
  return (
    statusEntry.state === PluginRuntimeStateEnum.active ||
    statusEntry.state === PluginRuntimeStateEnum.pending_restart
  );
}

export async function runWithConcurrencyLimit<T>(
  items: T[],
  concurrencyLimit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const normalizedLimit = Math.max(1, Math.floor(concurrencyLimit));
  let nextIndex = 0;
  async function runNext(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex]);
    }
  }
  const workers: Promise<void>[] = [];
  const workerCount = Math.min(normalizedLimit, items.length);
  for (let index = 0; index < workerCount; index += 1) {
    workers.push(runNext());
  }
  await Promise.all(workers);
}

export async function loadPluginFrontendModule(
  plugin: PluginListEntry,
  serverMode: PluginServerMode,
): Promise<LoadPluginFrontendResult | null> {
  const styleUrl = buildPluginAssetUrl(plugin.frontend.styleUrl);
  const entrypointUrl = buildPluginAssetUrl(plugin.frontend.entrypointUrl);
  if (!entrypointUrl) {
    ensurePluginStyleLoaded(plugin.pluginId, styleUrl);
    return {
      error: null,
      registryDelta: {
        appSubsystemRegistrationsByPluginId: {},
        sectionKinds: {},
        panes: {},
        commands: {},
        topNavBarItems: {},
        canvasControls: {},
      },
    };
  }

  try {
    ensurePluginStyleLoaded(plugin.pluginId, styleUrl);
    const importedModule = (await import(
      /* @vite-ignore */ entrypointUrl
    )) as PluginFrontendModule;
    const registryDelta = registerPluginModule({
      plugin,
      importedModule,
      serverMode,
    });
    return {
      error: null,
      registryDelta,
    };
  } catch (error) {
    ensurePluginStyleLoaded(plugin.pluginId, null);
    runPluginCleanup(plugin.pluginId);
    return {
      error: toPluginFrontendLoadError(plugin.pluginId, error),
      registryDelta: null,
    };
  }
}

function registerPluginCleanup(
  pluginId: string,
  cleanup: () => void,
): () => void {
  let cleanups = cleanupByPluginId.get(pluginId);
  if (!cleanups) {
    cleanups = new Set<() => void>();
    cleanupByPluginId.set(pluginId, cleanups);
  }
  cleanups.add(cleanup);
  return () => {
    const existing = cleanupByPluginId.get(pluginId);
    if (!existing) {
      return;
    }
    existing.delete(cleanup);
    if (existing.size === 0) {
      cleanupByPluginId.delete(pluginId);
    }
  };
}

function registerPluginSettingRevealHandler(
  pluginId: string,
  revealKey: string,
  handler: PluginSettingRevealHandler,
): void {
  let handlersByKey = settingRevealHandlersByPluginId.get(pluginId);
  if (!handlersByKey) {
    handlersByKey = new Map<string, PluginSettingRevealHandler>();
    settingRevealHandlersByPluginId.set(pluginId, handlersByKey);
  }
  if (handlersByKey.has(revealKey)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} registered duplicate setting reveal handler ${revealKey}.`,
    );
  }
  handlersByKey.set(revealKey, handler);
  registerPluginCleanup(pluginId, () => {
    const currentHandlers = settingRevealHandlersByPluginId.get(pluginId);
    if (!currentHandlers) {
      return;
    }
    currentHandlers.delete(revealKey);
    if (currentHandlers.size === 0) {
      settingRevealHandlersByPluginId.delete(pluginId);
    }
  });
}

export function runPluginCleanup(pluginId: string): void {
  const cleanups = cleanupByPluginId.get(pluginId);
  if (!cleanups) {
    return;
  }
  cleanupByPluginId.delete(pluginId);
  for (const cleanup of cleanups) {
    cleanup();
  }
}

function runAllPluginCleanup(): void {
  if (cleanupByPluginId.size === 0) {
    return;
  }
  for (const pluginId of Array.from(cleanupByPluginId.keys())) {
    runPluginCleanup(pluginId);
  }
}

export function clearPluginRuntimeSideEffects(): void {
  runAllPluginCleanup();
  for (const link of styleElementByPluginId.values()) {
    link.remove();
  }
  settingRevealHandlersByPluginId.clear();
  frontendSignatureByPluginId.clear();
  styleElementByPluginId.clear();
  styleHrefByPluginId.clear();
}

function isSimpleProjectStateSelectorKind(
  kind: string,
): kind is "projectConfig" | "activeSectionIds" | "singletonSections" {
  return (
    kind === "projectConfig" ||
    kind === "activeSectionIds" ||
    kind === "singletonSections"
  );
}

function normalizeSectionProjectStateSelector(
  pluginId: string,
  selector: PluginProjectStateSelector,
): Extract<PluginProjectStateSelector, { kind: "section" }> {
  return {
    kind: "section",
    sectionId: requireNonEmptyString(
      (selector as { sectionId?: unknown }).sectionId,
      `Plugin ${pluginId} section selector missing sectionId.`,
    ),
  };
}

function normalizeSectionsProjectStateSelector(
  pluginId: string,
  selector: PluginProjectStateSelector,
): Extract<PluginProjectStateSelector, { kind: "sections" }> {
  const sectionIdsRaw = (selector as { sectionIds?: unknown }).sectionIds;
  if (!Array.isArray(sectionIdsRaw)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} sections selector must provide sectionIds array.`,
    );
  }
  return {
    kind: "sections",
    sectionIds: sectionIdsRaw.map((rawSectionId) =>
      requireNonEmptyString(
        rawSectionId,
        `Plugin ${pluginId} sections selector contains invalid sectionId.`,
      ),
    ),
  };
}

function normalizePluginDataProjectStateSelector(
  pluginId: string,
  selector: PluginProjectStateSelector,
): Extract<PluginProjectStateSelector, { kind: "pluginData" }> {
  return {
    kind: "pluginData",
    pluginId: requireNonEmptyString(
      (selector as { pluginId?: unknown }).pluginId,
      `Plugin ${pluginId} pluginData selector missing pluginId.`,
    ),
  };
}

function requireProjectStateSelectorKind(
  pluginId: string,
  selector: PluginProjectStateSelector,
): string {
  if (!selector || typeof selector !== "object" || Array.isArray(selector)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} provided an invalid project state selector.`,
    );
  }
  const rawKind = (selector as { kind?: unknown }).kind;
  if (typeof rawKind !== "string" || rawKind.trim() === "") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} project state selector is missing kind.`,
    );
  }
  return rawKind.trim();
}

function normalizeProjectStateSelector(
  pluginId: string,
  selector: PluginProjectStateSelector,
): PluginProjectStateSelector {
  const kind = requireProjectStateSelectorKind(pluginId, selector);
  if (isSimpleProjectStateSelectorKind(kind)) {
    return { kind };
  }
  if (kind === "section") {
    return normalizeSectionProjectStateSelector(pluginId, selector);
  }
  if (kind === "sections") {
    return normalizeSectionsProjectStateSelector(pluginId, selector);
  }
  if (kind === "pluginData") {
    return normalizePluginDataProjectStateSelector(pluginId, selector);
  }
  throw new PluginRuntimeError(
    PluginFrontendErrorCodeEnum.RegistrationInvalid,
    `Plugin ${pluginId} project state selector kind ${kind} is unsupported.`,
  );
}

function getSectionImplForProjectState(
  state: ReturnType<typeof useProjectState.getState>,
  sectionId: string,
): unknown {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    return null;
  }
  return impl;
}

function getRawSelectedProjectState(
  state: ReturnType<typeof useProjectState.getState>,
  selector: PluginProjectStateSelector,
): unknown {
  switch (selector.kind) {
    case "projectConfig":
      return state.projectConfig;
    case "pluginData":
      return (
        (state as { pluginData?: Record<string, unknown> }).pluginData?.[
          selector.pluginId
        ] ?? null
      );
    case "activeSectionIds":
      return useActiveSectionUI.getState().activeIds;
    case "singletonSections":
      return state.singletonSections;
    case "section":
      return getSectionImplForProjectState(state, selector.sectionId);
    case "sections":
      return selector.sectionIds.map((sectionId) =>
        getSectionImplForProjectState(state, sectionId),
      );
  }
}

function projectStateSubscriptionEquality(
  selector: PluginProjectStateSelector,
): ((left: unknown, right: unknown) => boolean) | undefined {
  if (selector.kind === "activeSectionIds") {
    return (left, right) => {
      if (!Array.isArray(left) || !Array.isArray(right)) {
        return false;
      }
      if (left.length !== right.length) {
        return false;
      }
      for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
          return false;
        }
      }
      return true;
    };
  }
  if (selector.kind !== "sections") {
    return undefined;
  }
  return (left, right) => {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }
    if (left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        return false;
      }
    }
    return true;
  };
}

function toProjectStateReadValue(
  selector: PluginProjectStateSelector,
  rawValue: unknown,
): unknown {
  if (selector.kind !== "sections") {
    return cloneProjectStateSnapshot(rawValue);
  }
  return toProjectStateSectionSnapshot(selector.sectionIds, rawValue);
}

function toProjectStateSubscriptionValue(
  selector: PluginProjectStateSelector,
  rawValue: unknown,
  previousRawValue?: unknown,
  previousSnapshot?: unknown,
): unknown {
  if (selector.kind !== "sections") {
    if (rawValue === undefined) {
      return null;
    }
    return cloneProjectStateSnapshot(rawValue);
  }
  return toProjectStateSectionSnapshot(
    selector.sectionIds,
    rawValue,
    previousRawValue,
    previousSnapshot,
  );
}

function toProjectStateSectionSnapshot(
  sectionIds: string[],
  rawValue: unknown,
  previousRawValue?: unknown,
  previousSnapshot?: unknown,
): Record<string, unknown> {
  if (!Array.isArray(rawValue)) {
    return {};
  }
  const previousValues = Array.isArray(previousRawValue)
    ? previousRawValue
    : null;
  const previousBySection =
    isRecordProjectStateValue(previousSnapshot) &&
    !Array.isArray(previousSnapshot)
      ? previousSnapshot
      : null;
  const snapshot: Record<string, unknown> = {};
  for (let index = 0; index < sectionIds.length; index += 1) {
    const sectionId = sectionIds[index];
    const value = rawValue[index] ?? null;
    const reusableSnapshot = getReusableProjectStateSectionSnapshot(
      sectionId,
      value,
      index,
      previousValues,
      previousBySection,
    );
    if (reusableSnapshot !== undefined) {
      snapshot[sectionId] = reusableSnapshot;
      continue;
    }
    snapshot[sectionId] = cloneProjectStateSnapshot(value);
  }
  return snapshot;
}

function getReusableProjectStateSectionSnapshot(
  sectionId: string,
  value: unknown,
  index: number,
  previousValues: unknown[] | null,
  previousBySection: Record<string, unknown> | null,
): unknown | undefined {
  if (
    !previousValues ||
    !previousBySection ||
    previousValues[index] !== value ||
    !(sectionId in previousBySection)
  ) {
    return undefined;
  }
  return previousBySection[sectionId];
}

function cloneProjectStateSnapshot(rawValue: unknown): unknown {
  if (rawValue === null || rawValue === undefined) {
    return rawValue;
  }
  if (Array.isArray(rawValue)) {
    let hasOnlyScalars = true;
    for (const item of rawValue) {
      if (!isScalarProjectStateValue(item)) {
        hasOnlyScalars = false;
        break;
      }
    }
    if (hasOnlyScalars) {
      return rawValue.slice();
    }
  }
  if (typeof rawValue !== "object") {
    return rawValue;
  }
  return structuredClone(rawValue);
}

function isScalarProjectStateValue(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  const valueType = typeof value;
  return valueType !== "object" && valueType !== "function";
}

function isRecordProjectStateValue(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toLiteralRealtimePayload(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (typeof serialized === "string") {
    return serialized;
  }
  return "null";
}

function requirePluginEventRecord(
  pluginId: string,
  event: unknown,
  hostMethodName: string,
): Record<string, unknown> {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} ${hostMethodName} requires an object payload.`,
    );
  }
  return event as Record<string, unknown>;
}

function requirePluginRealtimeDependencyKey(
  pluginId: string,
  eventRecord: Record<string, unknown>,
): BaseDependencyKeyUnion {
  const dependencyKey = eventRecord.dependencyKey;
  if (!dependencyKey || typeof dependencyKey !== "object") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} emitRealtimeDependencyEvent requires a dependencyKey object.`,
    );
  }
  return dependencyKey as BaseDependencyKeyUnion;
}

function normalizePluginRealtimeBinaryPayload(
  pluginId: string,
  eventRecord: Record<string, unknown>,
): ArrayBuffer | undefined {
  const binaryPayload = eventRecord.binaryPayload;
  if (binaryPayload !== undefined && !(binaryPayload instanceof ArrayBuffer)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} emitRealtimeDependencyEvent binaryPayload must be an ArrayBuffer.`,
    );
  }
  return binaryPayload as ArrayBuffer | undefined;
}

function normalizePluginRealtimePayload(
  pluginId: string,
  eventRecord: Record<string, unknown>,
  binaryPayload: ArrayBuffer | undefined,
): BaseDependencyValueUnion | null {
  const payload = eventRecord.payload;
  if (
    payload &&
    typeof payload === "object" &&
    "type" in payload &&
    (payload as { type?: unknown }).type === DependencyValueTypeEnum.Binary &&
    !(binaryPayload instanceof ArrayBuffer)
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} emitRealtimeDependencyEvent requires binaryPayload for Binary payloads.`,
    );
  }
  return (payload as BaseDependencyValueUnion | null | undefined) ?? null;
}

function normalizePluginRealtimeTimestamp(
  pluginId: string,
  eventRecord: Record<string, unknown>,
  hostMethodName: "emitRealtimeDependencyEvent" | "emitSectionRealtimeValue",
): number | undefined {
  const timestampMs = eventRecord.timestampMs;
  if (
    timestampMs !== undefined &&
    (!Number.isFinite(timestampMs) || Number.isNaN(timestampMs))
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} ${hostMethodName} timestampMs must be a finite number.`,
    );
  }
  return timestampMs as number | undefined;
}

function requirePluginPayloadRecord(
  pluginId: string,
  payload: unknown,
  hostMethodName: string,
): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} ${hostMethodName} requires an object payload.`,
    );
  }
  return payload as Record<string, unknown>;
}

function normalizeSetWatchCodeEnabledPayload(
  pluginId: string,
  payload: PluginSetWatchCodeEnabledPayload,
): PluginSetWatchCodeEnabledPayload {
  const record = requirePluginPayloadRecord(
    pluginId,
    payload,
    "setWatchCodeEnabled",
  );
  const projectConfigId = requireNonEmptyString(
    record.projectConfigId,
    `Plugin ${pluginId} setWatchCodeEnabled requires projectConfigId.`,
  );
  if (typeof record.enabled !== "boolean") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} setWatchCodeEnabled requires boolean enabled.`,
    );
  }
  return {
    projectConfigId,
    enabled: record.enabled,
  };
}

function normalizeSetWatchCodeInputsPayload(
  pluginId: string,
  payload: PluginSetWatchCodeInputsPayload,
): PluginSetWatchCodeInputsPayload {
  const record = requirePluginPayloadRecord(
    pluginId,
    payload,
    "setWatchCodeInputs",
  );
  const projectConfigId = requireNonEmptyString(
    record.projectConfigId,
    `Plugin ${pluginId} setWatchCodeInputs requires projectConfigId.`,
  );
  const rawFolders = record.watchCodeFolders;
  const rawFiles = record.watchCodeFiles;
  if (!Array.isArray(rawFolders)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} setWatchCodeInputs requires watchCodeFolders array.`,
    );
  }
  if (!Array.isArray(rawFiles)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} setWatchCodeInputs requires watchCodeFiles array.`,
    );
  }
  return {
    projectConfigId,
    watchCodeFolders: rawFolders.map((rawFolder, index) =>
      normalizeWatchCodeFolderInput(pluginId, rawFolder, index),
    ),
    watchCodeFiles: rawFiles.map((rawFile, index) =>
      requireNonEmptyString(
        rawFile,
        `Plugin ${pluginId} setWatchCodeInputs watchCodeFiles[${index}] must be a non-empty string.`,
      ),
    ),
  };
}

function normalizeWatchCodeFolderInput(
  pluginId: string,
  rawFolder: unknown,
  index: number,
): PluginWatchCodeFolderInput {
  if (!rawFolder || typeof rawFolder !== "object" || Array.isArray(rawFolder)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} setWatchCodeInputs watchCodeFolders[${index}] must be an object.`,
    );
  }
  const folder = rawFolder as Record<string, unknown>;
  const path = requireNonEmptyString(
    folder.path,
    `Plugin ${pluginId} setWatchCodeInputs watchCodeFolders[${index}].path must be a non-empty string.`,
  );
  if (typeof folder.recursive !== "boolean") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} setWatchCodeInputs watchCodeFolders[${index}].recursive must be a boolean.`,
    );
  }
  return {
    path,
    recursive: folder.recursive,
  };
}

function watchCodePluginRoute(pluginId: string, suffix: string): string {
  return `/plugins/${encodeURIComponent(pluginId)}/watch-code/${suffix}`;
}

async function postWatchCodePluginRoute(
  pluginId: string,
  suffix: string,
  payload: PluginSetWatchCodeEnabledPayload | PluginSetWatchCodeInputsPayload,
): Promise<boolean> {
  const response = await fetch(
    buildBackendOriginURL(watchCodePluginRoute(pluginId, suffix)),
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...buildShareSessionHeaders(),
      },
      body: JSON.stringify(payload),
    },
  );
  return response.status === 200;
}

function registerPluginModule({
  plugin,
  importedModule,
  serverMode,
}: {
  plugin: PluginListEntry;
  importedModule: PluginFrontendModule;
  serverMode: PluginServerMode;
}): PluginRegistryAccumulator {
  const registerFn = importedModule.register;
  if (typeof registerFn !== "function") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${plugin.pluginId} frontend module must export register(host).`,
    );
  }

  const apiVersion = importedModule.apiVersion;
  if (
    typeof apiVersion !== "number" ||
    apiVersion !== PLUGIN_FRONTEND_API_VERSION
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.ApiVersionMismatch,
      `Plugin ${plugin.pluginId} apiVersion mismatch. Expected ${PLUGIN_FRONTEND_API_VERSION}.`,
    );
  }

  const registryDelta: PluginRegistryAccumulator = {
    appSubsystemRegistrationsByPluginId: {},
    sectionKinds: {},
    panes: {},
    commands: {},
    topNavBarItems: {},
    canvasControls: {},
  };

  const effectiveCapabilitySet = new Set(plugin.effectiveCapabilities);

  const host: SettaPluginHost = {
    apiVersion: PLUGIN_FRONTEND_API_VERSION,
    pluginId: plugin.pluginId,
    serverMode,
    effectiveCapabilities: plugin.effectiveCapabilities,
    createStore: (initializer) => createStore(initializer),
    registerAppSubsystem: (definition) => {
      const validated = validateAppSubsystemRegistration(
        plugin.pluginId,
        definition,
      );
      if (registryDelta.appSubsystemRegistrationsByPluginId[plugin.pluginId]) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `Plugin ${plugin.pluginId} registered duplicate app subsystem frontend registration.`,
        );
      }
      registryDelta.appSubsystemRegistrationsByPluginId[plugin.pluginId] =
        validated;
    },
    registerSectionKind: (definition) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        sectionKindCapability,
        "registerSectionKind",
      );
      const validated = validateSectionKindDefinition(
        plugin.pluginId,
        definition,
      );
      const sectionKey = toPluginSectionKindKey(
        validated.pluginId,
        validated.kind,
      );
      if (registryDelta.sectionKinds[sectionKey]) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `Plugin ${plugin.pluginId} registered duplicate section kind ` +
            `${validated.kind}.`,
        );
      }
      registryDelta.sectionKinds[sectionKey] = validated;
    },
    registerPane: (definition) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        paneCapability,
        "registerPane",
      );
      const validated = validatePaneDefinition(plugin.pluginId, definition);
      const pluginPanes = registryDelta.panes[plugin.pluginId] ?? [];
      for (const existingPane of pluginPanes) {
        if (existingPane.id === validated.id) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `Plugin ${plugin.pluginId} registered duplicate pane ` +
              `${validated.id}.`,
          );
        }
      }
      pluginPanes.push(validated);
      registryDelta.panes[plugin.pluginId] = pluginPanes;
    },
    registerSettingRevealHandler: (revealKey, handler) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        settingRevealHandlerCapability,
        "registerSettingRevealHandler",
      );
      const normalizedRevealKey = requireNonEmptyString(
        revealKey,
        `Plugin ${plugin.pluginId} setting reveal handler key must be a non-empty string.`,
      );
      if (typeof handler !== "function") {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `Plugin ${plugin.pluginId} setting reveal handler must be a function.`,
        );
      }
      registerPluginSettingRevealHandler(
        plugin.pluginId,
        normalizedRevealKey,
        handler,
      );
    },
    registerCommand: (definition) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        commandCapability,
        "registerCommand",
      );
      const validated = validateCommandDefinition(plugin.pluginId, definition);
      const pluginCommands = registryDelta.commands[plugin.pluginId] ?? [];
      for (const existingCommand of pluginCommands) {
        if (existingCommand.id === validated.id) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `Plugin ${plugin.pluginId} registered duplicate command ` +
              `${validated.id}.`,
          );
        }
      }
      pluginCommands.push(validated);
      registryDelta.commands[plugin.pluginId] = pluginCommands;
    },
    registerTopNavBarItem: (definition) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        topNavBarCapability,
        "registerTopNavBarItem",
      );
      const validated = validateTopNavBarItemDefinition(
        plugin.pluginId,
        definition,
      );
      const pluginTopNavBarItems =
        registryDelta.topNavBarItems[plugin.pluginId] ?? [];
      for (const existingItem of pluginTopNavBarItems) {
        if (existingItem.id === validated.id) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `Plugin ${plugin.pluginId} registered duplicate top nav item ` +
              `${validated.id}.`,
          );
        }
      }
      pluginTopNavBarItems.push(validated);
      registryDelta.topNavBarItems[plugin.pluginId] = pluginTopNavBarItems;
    },
    registerCanvasControl: (definition) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        canvasControlCapability,
        "registerCanvasControl",
      );
      const validated = validateCanvasControlDefinition(
        plugin.pluginId,
        definition,
      );
      const pluginCanvasControls =
        registryDelta.canvasControls[plugin.pluginId] ?? [];
      for (const existingControl of pluginCanvasControls) {
        if (existingControl.id === validated.id) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `Plugin ${plugin.pluginId} registered duplicate canvas control ` +
              `${validated.id}.`,
          );
        }
      }
      pluginCanvasControls.push(validated);
      registryDelta.canvasControls[plugin.pluginId] = pluginCanvasControls;
    },
    registerContextMenu: () => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        contextMenuCapability,
        "registerContextMenu",
      );
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.CapabilityDenied,
        "registerContextMenu is not implemented in this host yet.",
      );
    },
    getProjectContext: () => {
      const projectState = useProjectState.getState();
      return {
        projectConfigId: projectState.projectConfig.id,
        serverMode,
      };
    },
    subscribeProjectContext: (listener) => {
      const unsubscribe = useProjectState.subscribe(
        (state) => state.projectConfig.id,
        (projectConfigId, previousProjectConfigId) => {
          if (projectConfigId === previousProjectConfigId) {
            return;
          }
          listener({
            projectConfigId,
            serverMode,
          });
        },
      );
      const unregisterCleanup = registerPluginCleanup(
        plugin.pluginId,
        unsubscribe,
      );
      return () => {
        unregisterCleanup();
        unsubscribe();
      };
    },
    readProjectState: (selector) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        readProjectStateCapability,
        "readProjectState",
      );
      const normalizedSelector = normalizeProjectStateSelector(
        plugin.pluginId,
        selector,
      );
      const rawValue = getRawSelectedProjectState(
        useProjectState.getState(),
        normalizedSelector,
      );
      return toProjectStateReadValue(normalizedSelector, rawValue);
    },
    subscribeProjectState: (selector, listener, options) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        subscribeProjectStateCapability,
        "subscribeProjectState",
      );
      const normalizedSelector = normalizeProjectStateSelector(
        plugin.pluginId,
        selector,
      );
      const fireImmediately = options?.fireImmediately ?? true;
      const throttleMs = options?.throttleMs ?? 0;
      if (!Number.isFinite(throttleMs) || throttleMs < 0) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `Plugin ${plugin.pluginId} subscribeProjectState throttleMs must be ` +
            "a non-negative finite number.",
        );
      }

      let previousNotifiedRawValue: unknown = undefined;
      let previousNotifiedValue: unknown | null = null;
      let hasPreviousNotifiedValue = false;
      let notify = (nextRawValue: unknown, prevRawValue: unknown): void => {
        const nextValue = toProjectStateSubscriptionValue(
          normalizedSelector,
          nextRawValue,
          hasPreviousNotifiedValue ? previousNotifiedRawValue : undefined,
          hasPreviousNotifiedValue ? previousNotifiedValue : undefined,
        );
        let prevValue: unknown | null = null;
        if (prevRawValue !== undefined) {
          if (
            hasPreviousNotifiedValue &&
            previousNotifiedRawValue === prevRawValue
          ) {
            prevValue = previousNotifiedValue;
          } else {
            prevValue = toProjectStateSubscriptionValue(
              normalizedSelector,
              prevRawValue,
            );
          }
        }
        listener(nextValue, prevValue);
        previousNotifiedRawValue = nextRawValue;
        previousNotifiedValue = nextValue;
        hasPreviousNotifiedValue = true;
      };
      let cancelThrottle: (() => void) | null = null;
      if (throttleMs > 0) {
        const throttledNotify = throttle(notify, throttleMs, {
          leading: true,
          trailing: true,
        });
        notify = throttledNotify;
        cancelThrottle = () => throttledNotify.cancel();
      }
      const unsubscribe =
        normalizedSelector.kind === "activeSectionIds"
          ? useActiveSectionUI.subscribe(
              (state) => state.activeIds,
              (nextRawValue, prevRawValue) =>
                notify(nextRawValue, prevRawValue),
              {
                fireImmediately,
                equalityFn:
                  projectStateSubscriptionEquality(normalizedSelector),
              },
            )
          : useProjectState.subscribe(
              (state) => getRawSelectedProjectState(state, normalizedSelector),
              (nextRawValue, prevRawValue) =>
                notify(nextRawValue, prevRawValue),
              {
                fireImmediately,
                equalityFn:
                  projectStateSubscriptionEquality(normalizedSelector),
              },
            );
      const cleanup = () => {
        unsubscribe();
        if (cancelThrottle) {
          cancelThrottle();
        }
      };
      const unregisterCleanup = registerPluginCleanup(plugin.pluginId, cleanup);
      return () => {
        unregisterCleanup();
        cleanup();
      };
    },
    setWatchCodeEnabled: async (payload) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        watchCodeSettingsMutationCapability,
        "setWatchCodeEnabled",
      );
      return await postWatchCodePluginRoute(
        plugin.pluginId,
        "enabled",
        normalizeSetWatchCodeEnabledPayload(plugin.pluginId, payload),
      );
    },
    setWatchCodeInputs: async (payload) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        watchCodeSettingsMutationCapability,
        "setWatchCodeInputs",
      );
      return await postWatchCodePluginRoute(
        plugin.pluginId,
        "inputs",
        normalizeSetWatchCodeInputsPayload(plugin.pluginId, payload),
      );
    },
    emitRealtimeDependencyEvent: (event) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        emitListenerEventsCapability,
        "emitRealtimeDependencyEvent",
      );
      const eventRecord = requirePluginEventRecord(
        plugin.pluginId,
        event,
        "emitRealtimeDependencyEvent",
      );
      const binaryPayload = normalizePluginRealtimeBinaryPayload(
        plugin.pluginId,
        eventRecord,
      );
      sendRealtimeDependencyEvent({
        dependencyKey: requirePluginRealtimeDependencyKey(
          plugin.pluginId,
          eventRecord,
        ),
        payload: normalizePluginRealtimePayload(
          plugin.pluginId,
          eventRecord,
          binaryPayload,
        ),
        binaryPayload,
        timestampMs: normalizePluginRealtimeTimestamp(
          plugin.pluginId,
          eventRecord,
          "emitRealtimeDependencyEvent",
        ),
      });
    },
    emitSectionRealtimeValue: (sectionId, value, options) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        emitListenerEventsCapability,
        "emitSectionRealtimeValue",
      );
      const normalizedSectionId = requireNonEmptyString(
        sectionId,
        `Plugin ${plugin.pluginId} emitSectionRealtimeValue requires sectionId.`,
      );
      if (!isPlainRecord(value)) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `Plugin ${plugin.pluginId} emitSectionRealtimeValue requires an object payload.`,
        );
      }
      const timestampMs = normalizePluginRealtimeTimestamp(
        plugin.pluginId,
        { timestampMs: options?.timestampMs },
        "emitSectionRealtimeValue",
      );
      const dependencyKey: SectionDependencyKey = {
        type: DependencyKeyTypeEnum.Section,
        sectionId: normalizedSectionId,
      };
      host.emitRealtimeDependencyEvent({
        dependencyKey,
        payload: {
          type: DependencyValueTypeEnum.Literal,
          payload: toLiteralRealtimePayload(value),
        },
        timestampMs,
      });
    },
    readSection: (sectionId) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        sectionKindCapability,
        "readSection",
      );
      const state = useProjectState.getState();
      const impl = getCurrEffectiveSectionImpl(state, sectionId);
      if (impl.type !== SectionTypeEnum.Plugin) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `readSection only supports Plugin sections in MVP. sectionId=${sectionId}`,
        );
      }
      if (impl.pluginId !== plugin.pluginId) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.CapabilityDenied,
          `Plugin ${plugin.pluginId} cannot read section ${sectionId} owned by ${impl.pluginId}.`,
        );
      }
      return structuredClone(impl) as Record<string, unknown>;
    },
    updateSection: (sectionId, patch) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        sectionKindCapability,
        "updateSection",
      );
      useProjectState.setState((state) => {
        const variantId = state.projectConfig.sectionVariantMap[sectionId];
        if (!variantId) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `updateSection could not resolve section variant. sectionId=${sectionId}`,
          );
        }
        const variant = state.sectionVariants[variantId];
        if (!variant) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `updateSection could not resolve section variant. sectionId=${sectionId}`,
          );
        }
        const impl = state.sectionImpls[variant.impl];
        if (!impl) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `updateSection could not resolve section implementation. sectionId=${sectionId}`,
          );
        }
        if (impl.type !== SectionTypeEnum.Plugin) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.RegistrationInvalid,
            `updateSection only supports Plugin sections in MVP. sectionId=${sectionId}`,
          );
        }
        if (impl.pluginId !== plugin.pluginId) {
          throw new PluginRuntimeError(
            PluginFrontendErrorCodeEnum.CapabilityDenied,
            `Plugin ${plugin.pluginId} cannot update section ${sectionId} owned by ${impl.pluginId}.`,
          );
        }
        if (patch.data !== undefined) {
          impl.data = structuredClone(patch.data);
        }
        if (patch.kind !== undefined) {
          impl.kind = patch.kind;
        }
        if (patch.schemaVersion !== undefined) {
          impl.schemaVersion = patch.schemaVersion;
        }
      });
    },
    openArtifact: () => {
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.CapabilityDenied,
        "openArtifact is not implemented in this host yet.",
      );
    },
    createArtifact: async () => {
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.CapabilityDenied,
        "createArtifact is not implemented in this host yet.",
      );
    },
  };

  const registerResult = (registerFn as (host: SettaPluginHost) => unknown)(
    host,
  );
  if (isPromiseLike(registerResult)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${plugin.pluginId} returned a Promise from register(host); ` +
        "async register is not supported in MVP.",
    );
  }

  for (const paneEntries of Object.values(registryDelta.panes)) {
    paneEntries.sort((a, b) => a.title.localeCompare(b.title));
  }
  for (const commandEntries of Object.values(registryDelta.commands)) {
    commandEntries.sort((a, b) => a.title.localeCompare(b.title));
  }
  for (const topNavBarItems of Object.values(registryDelta.topNavBarItems)) {
    topNavBarItems.sort((a, b) => {
      const orderDelta = (a.order ?? 0) - (b.order ?? 0);
      if (orderDelta !== 0) {
        return orderDelta;
      }
      const byLabel = a.label.localeCompare(b.label);
      if (byLabel !== 0) {
        return byLabel;
      }
      return a.id.localeCompare(b.id);
    });
  }
  for (const canvasControls of Object.values(registryDelta.canvasControls)) {
    canvasControls.sort(compareCanvasControlDefinitions);
  }

  return registryDelta;
}

function ensureCapability(
  pluginId: string,
  effectiveCapabilitySet: Set<string>,
  requiredCapability: string,
  hostMethodName: string,
): void {
  if (effectiveCapabilitySet.has(requiredCapability)) {
    return;
  }
  throw new PluginRuntimeError(
    PluginFrontendErrorCodeEnum.CapabilityDenied,
    `Plugin ${pluginId} cannot call ${hostMethodName}; missing effective capability ${requiredCapability}.`,
  );
}

function validatePluginRenderer<
  TRenderer extends {
    mount: unknown;
    update?: unknown;
    unmount?: unknown;
  },
>(
  pluginId: string,
  registrationLabel: string,
  renderer: TRenderer | undefined,
): TRenderer {
  if (!renderer || typeof renderer !== "object") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} ${registrationLabel} missing renderer object.`,
    );
  }
  if (typeof renderer.mount !== "function") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} ${registrationLabel} renderer.mount must be a function.`,
    );
  }
  if (renderer.update !== undefined && typeof renderer.update !== "function") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} ${registrationLabel} renderer.update must be a function when provided.`,
    );
  }
  if (
    renderer.unmount !== undefined &&
    typeof renderer.unmount !== "function"
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} ${registrationLabel} renderer.unmount must be a function when provided.`,
    );
  }
  return renderer;
}

function validateAppSubsystemRegistration(
  pluginId: string,
  definition: AppSubsystemFrontendRegistration,
): RegisteredAppSubsystemFrontendRegistration {
  if (!isAppSubsystemFrontendRegistration(definition)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} registered an invalid app subsystem frontend registration.`,
    );
  }
  return {
    ...definition,
    pluginId,
  };
}

function validateSectionKindDefinition(
  pluginId: string,
  definition: PluginSectionKindDefinition,
): RegisteredPluginSectionKind {
  const kind = requireNonEmptyString(
    definition.kind,
    `Plugin ${pluginId} section kind definition missing kind.`,
  );
  const title = requireNonEmptyString(
    definition.title,
    `Plugin ${pluginId} section kind ${kind} missing title.`,
  );
  const renderer = validatePluginRenderer(
    pluginId,
    `section kind ${kind}`,
    definition.renderer,
  );
  if (
    definition.initialData !== undefined &&
    !isPlainRecord(definition.initialData)
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} section kind ${kind} initialData must be a plain object when provided.`,
    );
  }

  const sectionKind: RegisteredPluginSectionKind = {
    pluginId,
    kind,
    title,
    renderer,
  };
  if (definition.description !== undefined) {
    sectionKind.description = definition.description;
  }
  if (definition.initialData !== undefined) {
    sectionKind.initialData = definition.initialData;
  }
  return sectionKind;
}

function validatePaneDefinition(
  pluginId: string,
  definition: PluginPaneDefinition,
): RegisteredPluginPane {
  const id = requireNonEmptyString(
    definition.id,
    `Plugin ${pluginId} pane definition missing id.`,
  );
  const title = requireNonEmptyString(
    definition.title,
    `Plugin ${pluginId} pane ${id} missing title.`,
  );
  const renderer = validatePluginRenderer(
    pluginId,
    `pane ${id}`,
    definition.renderer,
  );
  let icon: PluginPaneIconName | undefined;
  if (definition.icon !== undefined) {
    const iconValue = requireNonEmptyString(
      definition.icon,
      `Plugin ${pluginId} pane ${id} icon must be a supported icon name.`,
    );
    if (!isPluginPaneIconName(iconValue)) {
      const supportedIconNames = Object.values(PluginPaneIconNameEnum).join(
        ", ",
      );
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.RegistrationInvalid,
        `Plugin ${pluginId} pane ${id} icon ${iconValue} is invalid. ` +
          `Supported icons: ${supportedIconNames}.`,
      );
    }
    icon = iconValue;
  }

  const paneDefinition: RegisteredPluginPane = {
    pluginId,
    id,
    title,
    renderer,
  };
  if (definition.description !== undefined) {
    paneDefinition.description = definition.description;
  }
  if (icon !== undefined) {
    paneDefinition.icon = icon;
  }
  return paneDefinition;
}

function validateCommandDefinition(
  pluginId: string,
  definition: PluginCommandDefinition,
): RegisteredPluginCommand {
  const id = requireNonEmptyString(
    definition.id,
    `Plugin ${pluginId} command definition missing id.`,
  );
  const title = requireNonEmptyString(
    definition.title,
    `Plugin ${pluginId} command ${id} missing title.`,
  );
  if (typeof definition.run !== "function") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} command ${id} run must be a function.`,
    );
  }

  const commandDefinition: RegisteredPluginCommand = {
    pluginId,
    id,
    title,
    run: definition.run,
  };
  if (definition.description !== undefined) {
    commandDefinition.description = definition.description;
  }
  return commandDefinition;
}

function validateTopNavBarItemDefinition(
  pluginId: string,
  definition: PluginTopNavBarItemDefinition,
): RegisteredPluginTopNavBarItem {
  const id = requireNonEmptyString(
    definition.id,
    `Plugin ${pluginId} top nav item definition missing id.`,
  );
  const label = requireNonEmptyString(
    definition.label,
    `Plugin ${pluginId} top nav item ${id} missing label.`,
  );
  if (typeof definition.onClick !== "function") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} top nav item ${id} onClick must be a function.`,
    );
  }
  if (
    definition.order !== undefined &&
    (!Number.isFinite(definition.order) || Number.isNaN(definition.order))
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} top nav item ${id} order must be a finite number.`,
    );
  }
  const topNavBarItem: RegisteredPluginTopNavBarItem = {
    pluginId,
    id,
    label,
    onClick: definition.onClick,
  };
  if (definition.description !== undefined) {
    topNavBarItem.description = definition.description;
  }
  if (definition.order !== undefined) {
    topNavBarItem.order = definition.order;
  }
  return topNavBarItem;
}

const canvasControlPlacementRank: Record<string, number> = {
  [PluginCanvasControlPlacementEnum.Project]: 0,
  [PluginCanvasControlPlacementEnum.Viewport]: 1,
  [PluginCanvasControlPlacementEnum.Utility]: 2,
};

function compareCanvasControlDefinitions(
  left: RegisteredPluginCanvasControl,
  right: RegisteredPluginCanvasControl,
): number {
  const placementDelta =
    canvasControlPlacementRank[left.placement] -
    canvasControlPlacementRank[right.placement];
  if (placementDelta !== 0) {
    return placementDelta;
  }
  const orderDelta = (left.order ?? 0) - (right.order ?? 0);
  if (orderDelta !== 0) {
    return orderDelta;
  }
  const byLabel = left.label.localeCompare(right.label);
  if (byLabel !== 0) {
    return byLabel;
  }
  const byPlugin = left.pluginId.localeCompare(right.pluginId);
  if (byPlugin !== 0) {
    return byPlugin;
  }
  return left.id.localeCompare(right.id);
}

function validateCanvasControlDefinition(
  pluginId: string,
  definition: PluginCanvasControlDefinition,
): RegisteredPluginCanvasControl {
  const id = requireNonEmptyString(
    definition.id,
    `Plugin ${pluginId} canvas control definition missing id.`,
  );
  const label = requireNonEmptyString(
    definition.label,
    `Plugin ${pluginId} canvas control ${id} missing label.`,
  );
  let placement = PluginCanvasControlPlacementEnum.Project;
  if (definition.placement !== undefined) {
    const placementValue = requireNonEmptyString(
      definition.placement,
      `Plugin ${pluginId} canvas control ${id} placement must be supported.`,
    );
    if (!isPluginCanvasControlPlacement(placementValue)) {
      const supportedPlacements = Object.values(
        PluginCanvasControlPlacementEnum,
      ).join(", ");
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.RegistrationInvalid,
        `Plugin ${pluginId} canvas control ${id} placement ${placementValue} is invalid. ` +
          `Supported placements: ${supportedPlacements}.`,
      );
    }
    placement = placementValue;
  }
  if (
    definition.order !== undefined &&
    (!Number.isFinite(definition.order) || Number.isNaN(definition.order))
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} canvas control ${id} order must be a finite number.`,
    );
  }
  const renderer = validatePluginRenderer(
    pluginId,
    `canvas control ${id}`,
    definition.renderer,
  );
  const canvasControl: RegisteredPluginCanvasControl = {
    pluginId,
    id,
    label,
    placement,
    renderer,
  };
  if (definition.description !== undefined) {
    canvasControl.description = definition.description;
  }
  if (definition.order !== undefined) {
    canvasControl.order = definition.order;
  }
  return canvasControl;
}

function requireNonEmptyString(value: unknown, errorMessage: string): string {
  if (typeof value !== "string") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      errorMessage,
    );
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      errorMessage,
    );
  }
  return trimmed;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  return typeof (value as PromiseLike<unknown>).then === "function";
}

class PluginRuntimeError extends Error {
  code: PluginFrontendErrorCode;

  constructor(code: PluginFrontendErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function toPluginFrontendLoadError(
  pluginId: string,
  error: unknown,
): PluginFrontendError {
  if (error instanceof PluginRuntimeError) {
    return {
      code: error.code,
      message: error.message,
    };
  }
  const message =
    error instanceof Error
      ? error.message
      : `Unknown plugin frontend load error for ${pluginId}`;
  return {
    code: PluginFrontendErrorCodeEnum.FrontendLoadFailed,
    message,
  };
}

function ensurePluginStyleLoaded(
  pluginId: string,
  styleUrl: string | null,
): void {
  if (!styleUrl) {
    const existingStyle = styleElementByPluginId.get(pluginId);
    if (existingStyle) {
      existingStyle.remove();
      styleElementByPluginId.delete(pluginId);
      styleHrefByPluginId.delete(pluginId);
    }
    return;
  }

  const previousHref = styleHrefByPluginId.get(pluginId);
  if (previousHref === styleUrl && styleElementByPluginId.has(pluginId)) {
    return;
  }

  const existingStyle = styleElementByPluginId.get(pluginId);
  if (existingStyle) {
    existingStyle.remove();
    styleElementByPluginId.delete(pluginId);
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = styleUrl;
  link.dataset.settaPluginId = pluginId;
  link.dataset.settaPluginStyle = "true";
  document.head.append(link);

  styleElementByPluginId.set(pluginId, link);
  styleHrefByPluginId.set(pluginId, styleUrl);
}

export function removeInactivePluginStyles(activePluginIds: Set<string>): void {
  for (const [pluginId, styleElement] of styleElementByPluginId.entries()) {
    if (activePluginIds.has(pluginId)) {
      continue;
    }
    styleElement.remove();
    styleElementByPluginId.delete(pluginId);
    styleHrefByPluginId.delete(pluginId);
  }
}

function getPluginSettingRevealHandler(
  pluginId: string,
  revealKey: string,
): PluginSettingRevealHandler | null {
  const handlersByKey = settingRevealHandlersByPluginId.get(pluginId);
  if (!handlersByKey) {
    return null;
  }
  return handlersByKey.get(revealKey) ?? null;
}

function buildPluginSettingRevealFailure(
  pluginId: string,
  revealKey: string,
  reason:
    | "missing"
    | "aborted"
    | "timeout"
    | "unhandled"
    | "non_boolean"
    | "missing_plugin_handlers"
    | "failed",
  errorMessage?: string,
): { ok: false; message: string } {
  switch (reason) {
    case "missing_plugin_handlers":
      return {
        ok: false,
        message: `Plugin ${pluginId} has no setting reveal handlers.`,
      };
    case "missing":
      return {
        ok: false,
        message: `Plugin ${pluginId} has no setting reveal handler for ${revealKey}.`,
      };
    case "aborted":
      return {
        ok: false,
        message: `Plugin ${pluginId} reveal handler ${revealKey} was aborted before invocation.`,
      };
    case "timeout":
      return {
        ok: false,
        message: `Plugin ${pluginId} reveal handler ${revealKey} timed out.`,
      };
    case "unhandled":
      return {
        ok: false,
        message: `Plugin ${pluginId} did not handle setting reveal ${revealKey}.`,
      };
    case "non_boolean":
      return {
        ok: false,
        message: `Plugin ${pluginId} reveal handler ${revealKey} returned a non-boolean value.`,
      };
  }
  return {
    ok: false,
    message: `Plugin ${pluginId} reveal handler ${revealKey} failed: ${errorMessage ?? "unknown error"}`,
  };
}

function resolvePluginSettingRevealFailureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return String(error);
}

export async function invokePluginSettingRevealHandler({
  pluginId,
  revealKey,
  settingId,
  paneId,
  durationMs,
  abortSignal,
}: {
  pluginId: string;
  revealKey: string;
  settingId: string;
  paneId: string | null;
  durationMs: number;
  abortSignal: AbortSignal;
}): Promise<{ ok: boolean; message: string | null }> {
  const handlersByKey = settingRevealHandlersByPluginId.get(pluginId);
  if (!handlersByKey) {
    return buildPluginSettingRevealFailure(
      pluginId,
      revealKey,
      "missing_plugin_handlers",
    );
  }
  const handler = getPluginSettingRevealHandler(pluginId, revealKey);
  if (!handler) {
    return buildPluginSettingRevealFailure(pluginId, revealKey, "missing");
  }
  if (abortSignal.aborted) {
    return buildPluginSettingRevealFailure(pluginId, revealKey, "aborted");
  }
  try {
    const handled = await handler({
      settingId,
      paneId,
      durationMs,
      abortSignal,
    });
    if (abortSignal.aborted) {
      return buildPluginSettingRevealFailure(pluginId, revealKey, "timeout");
    }
    if (handled === true) {
      return { ok: true, message: null };
    }
    if (handled === false) {
      return buildPluginSettingRevealFailure(pluginId, revealKey, "unhandled");
    }
    return buildPluginSettingRevealFailure(pluginId, revealKey, "non_boolean");
  } catch (error) {
    if (abortSignal.aborted) {
      return buildPluginSettingRevealFailure(pluginId, revealKey, "timeout");
    }
    return buildPluginSettingRevealFailure(
      pluginId,
      revealKey,
      "failed",
      resolvePluginSettingRevealFailureMessage(error),
    );
  }
}
