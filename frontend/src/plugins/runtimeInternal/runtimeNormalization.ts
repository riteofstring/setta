import {
  type AppSubsystemFrontendRegistration,
  type RegisteredAppSubsystemFrontendRegistration,
  type SettaPluginProjectStateSelector,
  type SettaPluginSettingRevealHandler,
  type SettaPluginHost as SharedSettaPluginHost,
} from "@setta/app-subsystem-frontend-sdk";

import { useActiveSectionUI, useProjectState } from "state/definitions";

import {
  BaseDependencyKeyUnion,
  BaseDependencyValueUnion,
  DependencyValueTypeEnum,
  PluginListEntry,
  PluginRuntimeResponse,
  PluginRuntimeStateEnum,
  PluginStatusEntry,
} from "utils/generatedTypes";

import { type StateCreator, type StoreApi } from "zustand/vanilla";

import {
  PluginFrontendErrorCodeEnum,
  type PluginFrontendErrorCode,
  type PluginPaneDefinition,
  type PluginServerMode,
  type RegisteredPluginCanvasControl,
  type RegisteredPluginPane,
} from "../runtimeShared";

import { buildPluginAssetUrl } from "../transport";

import { registerPluginModule } from "./backendRoutesAndCommands";

import {
  ensurePluginStyleLoaded,
  PluginRuntimeError,
  requireNonEmptyString,
  toPluginFrontendLoadError,
} from "./navAndRevealValidation";

export const sectionKindCapability = "registerSectionKinds";

export const paneCapability = "registerPane";

export const settingRevealHandlerCapability = "registerSettingRevealHandler";

export const commandCapability = "registerCommand";

export const topNavBarCapability = "registerTopNavBarItem";

export const canvasControlCapability = "registerCanvasControl";

export const contextMenuCapability = "registerContextMenu";

export const readProjectStateCapability = "readProjectState";

export const subscribeProjectStateCapability = "subscribeProjectState";

export const emitListenerEventsCapability = "emitListenerEvents";

export const backendRouteCapability = "registerRouter";

export type PluginSectionProps = {
  sectionId: string;
  pluginId: string;
  kind: string;
  data: Record<string, unknown>;
  readOnly: boolean;
  serverMode: PluginServerMode;
  effectiveCapabilities: string[];
};

export type PluginSectionRenderer = {
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

export type PluginSettingRevealHandler = SettaPluginSettingRevealHandler;

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
  code: PluginFrontendErrorCode;
  message: string;
};

export type PluginProjectStateSelector = SettaPluginProjectStateSelector;

export type PluginRealtimeDependencyEvent = {
  dependencyKey: BaseDependencyKeyUnion;
  payload?: BaseDependencyValueUnion | null;
  binaryPayload?: ArrayBuffer;
  timestampMs?: number;
};

export type PluginSectionRealtimeEmitOptions = {
  timestampMs?: number;
};

export type SettaPluginHost = SharedSettaPluginHost & {
  createStore: <TState extends object>(
    initializer: StateCreator<TState, [], []>,
  ) => StoreApi<TState>;
  registerAppSubsystem: (definition: AppSubsystemFrontendRegistration) => void;
  registerSectionKind: (definition: PluginSectionKindDefinition) => void;
  registerPane: (definition: PluginPaneDefinition) => void;
  registerCommand: (definition: PluginCommandDefinition) => void;
  registerTopNavBarItem: (definition: PluginTopNavBarItemDefinition) => void;
  registerContextMenu: (_definition: Record<string, unknown>) => void;
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

export type PluginFrontendModule = {
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

export type LoadPluginFrontendResult = {
  error: PluginFrontendError | null;
  registryDelta: PluginRegistryAccumulator | null;
};

export type WatchCodeCapabilities = NonNullable<
  PluginRuntimeResponse["featureCapabilities"]
>["watchCode"];

export const styleHrefByPluginId = new Map<string, string>();

export const styleElementByPluginId = new Map<string, HTMLLinkElement>();

export const cleanupByPluginId = new Map<string, Set<() => void>>();

export const settingRevealHandlersByPluginId = new Map<
  string,
  Map<string, PluginSettingRevealHandler>
>();

export const frontendSignatureByPluginId = new Map<string, string>();

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

export function shouldLoadPluginFrontendForFeatureSelection({
  pluginId,
  statusEntry,
  watchCodeCapabilities,
}: {
  pluginId: string;
  statusEntry: PluginStatusEntry | undefined;
  watchCodeCapabilities?: WatchCodeCapabilities | null;
}): boolean {
  if (!shouldLoadPluginFrontend(statusEntry)) {
    return false;
  }
  return !isUnavailableWatchCodeProviderFrontendCandidate(
    pluginId,
    watchCodeCapabilities,
  );
}

export function isUnavailableWatchCodeProviderFrontendCandidate(
  pluginId: string,
  watchCodeCapabilities?: WatchCodeCapabilities | null,
): boolean {
  const providerSelection = watchCodeCapabilities?.providerSelection;
  if (!providerSelection) {
    return false;
  }
  const selectedPluginId = providerSelection.selectedPluginId?.trim() ?? "";
  if (
    providerSelection.status === "active" &&
    selectedPluginId !== "" &&
    selectedPluginId === pluginId
  ) {
    return false;
  }
  return [
    providerSelection.activePluginIds,
    providerSelection.conflictingPluginIds,
    providerSelection.disabledPluginIds,
    providerSelection.invalidPluginIds,
    providerSelection.pendingRestartPluginIds,
  ].some((candidates) => candidates?.includes(pluginId));
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

export function registerPluginCleanup(
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

export function registerPluginSettingRevealHandler(
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

export function runAllPluginCleanup(): void {
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

export function isSimpleProjectStateSelectorKind(
  kind: string,
): kind is "projectConfig" | "activeSectionIds" | "singletonSections" {
  return (
    kind === "projectConfig" ||
    kind === "activeSectionIds" ||
    kind === "singletonSections"
  );
}

export function normalizeSectionProjectStateSelector(
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

export function normalizeSectionsProjectStateSelector(
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

export function normalizePluginDataProjectStateSelector(
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

export function requireProjectStateSelectorKind(
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

export function normalizeProjectStateSelector(
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

export function getSectionImplForProjectState(
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

export function getRawSelectedProjectState(
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

export type PluginDataProjectStateSubscriptionSelection = {
  projectConfigId: string;
  value: unknown;
};

export function getRawProjectStateSubscriptionSelection(
  state: ReturnType<typeof useProjectState.getState>,
  selector: PluginProjectStateSelector,
): unknown {
  const value = getRawSelectedProjectState(state, selector);
  if (selector.kind !== "pluginData") {
    return value;
  }
  return {
    projectConfigId: state.projectConfig.id,
    value,
  };
}

export function getRawProjectStateSubscriptionValue(
  selector: PluginProjectStateSelector,
  selection: unknown,
): unknown {
  if (selector.kind !== "pluginData") {
    return selection;
  }
  return (selection as PluginDataProjectStateSubscriptionSelection).value;
}

export function projectStateSubscriptionEquality(
  selector: PluginProjectStateSelector,
): ((left: unknown, right: unknown) => boolean) | undefined {
  if (selector.kind === "pluginData") {
    return (left, right) => {
      const leftSelection = left as PluginDataProjectStateSubscriptionSelection;
      const rightSelection =
        right as PluginDataProjectStateSubscriptionSelection;
      return (
        leftSelection.projectConfigId === rightSelection.projectConfigId &&
        leftSelection.value === rightSelection.value
      );
    };
  }
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

export function toProjectStateReadValue(
  selector: PluginProjectStateSelector,
  rawValue: unknown,
): unknown {
  if (selector.kind !== "sections") {
    return cloneProjectStateSnapshot(rawValue);
  }
  return toProjectStateSectionSnapshot(selector.sectionIds, rawValue);
}

export function toProjectStateSubscriptionValue(
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

export function toProjectStateSectionSnapshot(
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

export function getReusableProjectStateSectionSnapshot(
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

export function cloneProjectStateSnapshot(rawValue: unknown): unknown {
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

export function isScalarProjectStateValue(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  const valueType = typeof value;
  return valueType !== "object" && valueType !== "function";
}

export function isRecordProjectStateValue(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function toLiteralRealtimePayload(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (typeof serialized === "string") {
    return serialized;
  }
  return "null";
}

export function requirePluginEventRecord(
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

export function requirePluginRealtimeDependencyKey(
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

export function normalizePluginRealtimeBinaryPayload(
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

export function normalizePluginRealtimePayload(
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

export function normalizePluginRealtimeTimestamp(
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
