import {
  isAppSubsystemFrontendRegistration,
  SETTA_PLUGIN_FRONTEND_HOST_API_VERSION,
  type AppSubsystemFrontendRegistration,
  type RegisteredAppSubsystemFrontendRegistration,
} from "@setta/app-subsystem-frontend-sdk";

import throttle from "lodash/throttle";

import { sendRealtimeDependencyEvent } from "state/actions/realtimeDependencySend";

import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";

import { useActiveSectionUI, useProjectState } from "state/definitions";

import {
  DependencyKeyTypeEnum,
  DependencyValueTypeEnum,
  PluginListEntry,
  SectionDependencyKey,
  SectionTypeEnum,
} from "utils/generatedTypes";

import { buildShareSessionHeaders } from "utils/shareSessionHeaders";

import { buildBackendOriginURL } from "utils/transportUrlCore";

import { createStore } from "zustand/vanilla";

import {
  isPluginPaneIconName,
  PluginPaneIconNameEnum,
  type PluginPaneIconName,
} from "../paneIcons";

import {
  comparePluginCanvasControls,
  PluginFrontendErrorCodeEnum,
  toPluginSectionKindKey,
  type PluginPaneDefinition,
  type PluginServerMode,
  type RegisteredPluginPane,
} from "../runtimeShared";

import {
  backendRouteCapability,
  canvasControlCapability,
  commandCapability,
  contextMenuCapability,
  emitListenerEventsCapability,
  getRawProjectStateSubscriptionSelection,
  getRawProjectStateSubscriptionValue,
  getRawSelectedProjectState,
  normalizePluginRealtimeBinaryPayload,
  normalizePluginRealtimePayload,
  normalizePluginRealtimeTimestamp,
  normalizeProjectStateSelector,
  paneCapability,
  PluginCommandDefinition,
  PluginFrontendModule,
  PluginRegistryAccumulator,
  PluginSectionKindDefinition,
  projectStateSubscriptionEquality,
  readProjectStateCapability,
  RegisteredPluginCommand,
  RegisteredPluginSectionKind,
  registerPluginCleanup,
  registerPluginSettingRevealHandler,
  requirePluginEventRecord,
  requirePluginRealtimeDependencyKey,
  sectionKindCapability,
  SettaPluginHost,
  settingRevealHandlerCapability,
  subscribeProjectStateCapability,
  toLiteralRealtimePayload,
  topNavBarCapability,
  toProjectStateReadValue,
  toProjectStateSubscriptionValue,
} from "./runtimeNormalization";

import {
  isPlainRecord,
  isPromiseLike,
  PluginRuntimeError,
  requireNonEmptyString,
  validateCanvasControlDefinition,
  validateTopNavBarItemDefinition,
} from "./navAndRevealValidation";

function normalizePluginBackendRoutePath(
  pluginId: string,
  path: string,
): string {
  const routePath = requireNonEmptyString(
    path,
    `Plugin ${pluginId} fetchBackendRoute requires a route path.`,
  );
  if (!routePath.startsWith("/") || routePath.startsWith("//")) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.RegistrationInvalid,
      `Plugin ${pluginId} fetchBackendRoute route path must start with a single slash.`,
    );
  }
  const pathOnly = routePath.split(/[?#]/, 1)[0] ?? "";
  for (const segment of pathOnly.split("/")) {
    let decodedSegment = segment;
    try {
      decodedSegment = decodeURIComponent(segment);
    } catch {
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.RegistrationInvalid,
        `Plugin ${pluginId} fetchBackendRoute route path must contain valid percent-encoding.`,
      );
    }
    if (decodedSegment === "." || decodedSegment === "..") {
      throw new PluginRuntimeError(
        PluginFrontendErrorCodeEnum.RegistrationInvalid,
        `Plugin ${pluginId} fetchBackendRoute route path must not contain dot segments.`,
      );
    }
  }
  return `/plugins/${encodeURIComponent(pluginId)}${routePath}`;
}

async function fetchPluginBackendRoute(
  pluginId: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(buildShareSessionHeaders())) {
    headers.set(key, value);
  }
  return await fetch(
    buildBackendOriginURL(normalizePluginBackendRoutePath(pluginId, path)),
    {
      ...(init ?? {}),
      credentials: init?.credentials ?? "include",
      headers,
    },
  );
}

export function registerPluginModule({
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
    apiVersion !== SETTA_PLUGIN_FRONTEND_HOST_API_VERSION
  ) {
    throw new PluginRuntimeError(
      PluginFrontendErrorCodeEnum.ApiVersionMismatch,
      `Plugin ${plugin.pluginId} apiVersion mismatch. Expected ${SETTA_PLUGIN_FRONTEND_HOST_API_VERSION}.`,
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
    apiVersion: SETTA_PLUGIN_FRONTEND_HOST_API_VERSION,
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
      let notify = (nextSelection: unknown, prevSelection: unknown): void => {
        const nextRawValue = getRawProjectStateSubscriptionValue(
          normalizedSelector,
          nextSelection,
        );
        const prevRawValue =
          prevSelection === undefined
            ? undefined
            : getRawProjectStateSubscriptionValue(
                normalizedSelector,
                prevSelection,
              );
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
              (state) =>
                getRawProjectStateSubscriptionSelection(
                  state,
                  normalizedSelector,
                ),
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
    fetchBackendRoute: async (path, init) => {
      ensureCapability(
        plugin.pluginId,
        effectiveCapabilitySet,
        backendRouteCapability,
        "fetchBackendRoute",
      );
      return await fetchPluginBackendRoute(plugin.pluginId, path, init);
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
    canvasControls.sort(comparePluginCanvasControls);
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

export function validatePluginRenderer<
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
