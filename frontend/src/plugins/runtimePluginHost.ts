import throttle from "lodash/throttle";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { sendRealtimeDependencyEvent } from "state/actions/websocketRealtimeDispatch";
import {
  useActiveSectionUI,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { C_ADDRESSES } from "utils/c_addresses";
import {
  BaseDependencyKeyUnion,
  BaseDependencyValueUnion,
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  PluginListEntry,
  SectionDependencyKey,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { createStore } from "zustand/vanilla";
import {
  createEmptyPluginRegistryAccumulator,
  PLUGIN_FRONTEND_API_VERSION,
  toPluginSectionKindKey,
  type PluginFrontendError,
  type PluginFrontendModule,
  type PluginRegistryAccumulator,
  type PluginServerMode,
  type PluginSettingRevealHandler,
  type SettaPluginHost,
} from "./runtimeHostTypes";
import {
  ensureCapability,
  normalizePluginPath,
  toLiteralRealtimePayload,
  validateCommandDefinition,
  validatePaneDefinition,
  validateSectionKindDefinition,
  validateTopNavBarItemDefinition,
} from "./runtimeHostValidation";
import {
  getRawSelectedProjectState,
  normalizeProjectStateSelector,
  projectStateSubscriptionEquality,
  toProjectStateReadValue,
  toProjectStateSubscriptionValue,
  type PluginProjectStateSubscriptionOptions,
} from "./runtimeProjectStateBridge";
import {
  isPlainRecord,
  isPromiseLike,
  PluginFrontendErrorCodeEnum,
  PluginRuntimeError,
  requireNonEmptyString,
} from "./runtimeValidation";

const styleHrefByPluginId = new Map<string, string>();
const styleElementByPluginId = new Map<string, HTMLLinkElement>();
const cleanupByPluginId = new Map<string, Set<() => void>>();
const settingRevealHandlersByPluginId = new Map<
  string,
  Map<string, PluginSettingRevealHandler>
>();

const sectionKindCapability = "registerSectionKinds";
const paneCapability = "registerPane";
const commandCapability = "registerCommand";
const topNavBarCapability = "registerTopNavBarItem";
const contextMenuCapability = "registerContextMenu";
const readProjectStateCapability = "readProjectState";
const subscribeProjectStateCapability = "subscribeProjectState";
const emitListenerEventsCapability = "emitListenerEvents";

export type LoadPluginFrontendResult = {
  error: PluginFrontendError | null;
  registryDelta: PluginRegistryAccumulator | null;
};

export async function loadPluginFrontendModule(
  plugin: PluginListEntry,
  serverMode: PluginServerMode,
): Promise<LoadPluginFrontendResult | null> {
  const styleUrl = resolvePluginAssetUrl(plugin.frontend.styleUrl);
  const entrypointUrl = resolvePluginAssetUrl(plugin.frontend.entrypointUrl);
  if (!entrypointUrl) {
    ensurePluginStyleLoaded(plugin.pluginId, styleUrl);
    return {
      error: null,
      registryDelta: createEmptyPluginRegistryAccumulator(),
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
    return {
      ok: false,
      message: `Plugin ${pluginId} has no setting reveal handlers.`,
    };
  }
  const handler = handlersByKey.get(revealKey);
  if (!handler) {
    return {
      ok: false,
      message: `Plugin ${pluginId} has no setting reveal handler for ${revealKey}.`,
    };
  }
  if (abortSignal.aborted) {
    return {
      ok: false,
      message: `Plugin ${pluginId} reveal handler ${revealKey} was aborted before invocation.`,
    };
  }
  try {
    const handled = await handler({
      settingId,
      paneId,
      durationMs,
      abortSignal,
    });
    if (abortSignal.aborted) {
      return {
        ok: false,
        message: `Plugin ${pluginId} reveal handler ${revealKey} timed out.`,
      };
    }
    if (handled === true) {
      return { ok: true, message: null };
    }
    if (handled === false) {
      return {
        ok: false,
        message: `Plugin ${pluginId} did not handle setting reveal ${revealKey}.`,
      };
    }
    return {
      ok: false,
      message: `Plugin ${pluginId} reveal handler ${revealKey} returned a non-boolean value.`,
    };
  } catch (error) {
    if (abortSignal.aborted) {
      return {
        ok: false,
        message: `Plugin ${pluginId} reveal handler ${revealKey} timed out.`,
      };
    }
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : String(error);
    return {
      ok: false,
      message: `Plugin ${pluginId} reveal handler ${revealKey} failed: ${message}`,
    };
  }
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

export function clearPluginHostSideEffects(): void {
  runAllPluginCleanup();
  for (const link of styleElementByPluginId.values()) {
    link.remove();
  }
  settingRevealHandlersByPluginId.clear();
  styleElementByPluginId.clear();
  styleHrefByPluginId.clear();
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

function runAllPluginCleanup(): void {
  if (cleanupByPluginId.size === 0) {
    return;
  }
  for (const pluginId of Array.from(cleanupByPluginId.keys())) {
    runPluginCleanup(pluginId);
  }
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

  const registryDelta = createEmptyPluginRegistryAccumulator();
  const effectiveCapabilitySet = new Set(plugin.effectiveCapabilities);

  const host: SettaPluginHost = {
    apiVersion: PLUGIN_FRONTEND_API_VERSION,
    pluginId: plugin.pluginId,
    serverMode,
    effectiveCapabilities: plugin.effectiveCapabilities,
    createStore: (initializer) => createStore(initializer),
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
        paneCapability,
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
    registerContextMenu: (_definition) => {
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
      const throttleMs = getSubscriptionThrottleMs(plugin.pluginId, options);

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
    emitRealtimeDependencyEvent: (event) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        emitListenerEventsCapability,
        "emitRealtimeDependencyEvent",
      );
      const normalizedEvent = normalizeRealtimeDependencyEvent(
        plugin.pluginId,
        event,
      );
      sendRealtimeDependencyEvent(normalizedEvent);
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
      const timestampMs = validateRealtimeTimestamp(
        plugin.pluginId,
        "emitSectionRealtimeValue",
        options?.timestampMs,
      );
      if (!isPlainRecord(value)) {
        throw new PluginRuntimeError(
          PluginFrontendErrorCodeEnum.RegistrationInvalid,
          `Plugin ${plugin.pluginId} emitSectionRealtimeValue requires an object payload.`,
        );
      }
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
    openArtifact: (_artifactId) => {
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.CapabilityDenied,
        "openArtifact is not implemented in this host yet.",
      );
    },
    createArtifact: async (_payload) => {
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.CapabilityDenied,
        "createArtifact is not implemented in this host yet.",
      );
    },
    apiFetch: async (path, init) => {
      const normalizedPath = normalizePluginPath(path);
      const shareSession = useShareSession.getState();
      const shareHeaders: Record<string, string> = {};
      if (shareSession.isDeploymentMode && shareSession.shareSessionId) {
        shareHeaders["X-Share-Session-Id"] = shareSession.shareSessionId;
      }
      const requestHeaders = new Headers(init?.headers ?? undefined);
      for (const [key, value] of Object.entries(shareHeaders)) {
        requestHeaders.set(key, value);
      }
      return fetch(
        `${C_ADDRESSES.BACKEND}/plugins/${plugin.pluginId}${normalizedPath}`,
        {
          ...init,
          credentials: "include",
          headers: requestHeaders,
        },
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

  return registryDelta;
}

function getSubscriptionThrottleMs(
  pluginId: string,
  options: PluginProjectStateSubscriptionOptions | undefined,
): number {
  const throttleMs = options?.throttleMs ?? 0;
  if (!Number.isFinite(throttleMs) || throttleMs < 0) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} subscribeProjectState throttleMs must be a non-negative finite number.`,
    );
  }
  return throttleMs;
}

function normalizeRealtimeDependencyEvent(
  pluginId: string,
  event: unknown,
): {
  dependencyKey: BaseDependencyKeyUnion;
  payload: BaseDependencyValueUnion | null;
  binaryPayload: ArrayBuffer | undefined;
  timestampMs: number | undefined;
} {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} emitRealtimeDependencyEvent requires an object payload.`,
    );
  }
  const dependencyKey = (event as { dependencyKey?: unknown }).dependencyKey;
  if (!dependencyKey || typeof dependencyKey !== "object") {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} emitRealtimeDependencyEvent requires a dependencyKey object.`,
    );
  }
  const payload = (event as { payload?: unknown }).payload;
  const binaryPayload = (event as { binaryPayload?: unknown }).binaryPayload;
  if (binaryPayload !== undefined && !(binaryPayload instanceof ArrayBuffer)) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} emitRealtimeDependencyEvent binaryPayload must be an ArrayBuffer.`,
    );
  }
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
  const timestampMs = validateRealtimeTimestamp(
    pluginId,
    "emitRealtimeDependencyEvent",
    (event as { timestampMs?: unknown }).timestampMs,
  );
  return {
    dependencyKey: dependencyKey as BaseDependencyKeyUnion,
    payload: (payload as BaseDependencyValueUnion | null | undefined) ?? null,
    binaryPayload: binaryPayload as ArrayBuffer | undefined,
    timestampMs,
  };
}

function validateRealtimeTimestamp(
  pluginId: string,
  methodName: "emitRealtimeDependencyEvent" | "emitSectionRealtimeValue",
  timestampMs: unknown,
): number | undefined {
  if (
    timestampMs !== undefined &&
    (!Number.isFinite(timestampMs) || Number.isNaN(timestampMs))
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} ${methodName} timestampMs must be a finite number.`,
    );
  }
  return timestampMs as number | undefined;
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

function resolvePluginAssetUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("/")) {
    return `${C_ADDRESSES.BACKEND_ORIGIN}${url}`;
  }
  return url;
}
