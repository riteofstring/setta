import type { Spec } from "@json-render/core";
import * as Switch from "@radix-ui/react-switch";
import { pickDefaultConfigId } from "components/Chat/llmConfigUtils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clearPendingChatDetails, submitMessage } from "state/actions/ai";
import { resolveEngineConfigIdForChat } from "state/actions/ai/agentRuns";
import { loadLLMApiKeys, loadLLMConfig } from "state/actions/ai/llmSettings";
import {
  loadEngineConfigs,
  loadExternalAgentHealth,
} from "state/actions/ai/projectAiResources";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  useAIStore,
  useAllProjectMetadata,
  useAppDefinition,
  useAppPreview,
  useLocalStorage,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
import {
  applyPatchOp,
  createEmptySpec,
  parsePatchLine,
} from "utils/appSpecPatchStream";
import { C_ADDRESSES } from "utils/c_addresses";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_app_catalog,
  route_get_app_definition,
  route_set_app_definition,
  route_validate_app_definition,
} from "utils/generatedEndpoints";
import {
  CodeObjTypeEnum,
  EngineTypeEnum,
  isBaseSectionWithParamsImpl,
  RouteEnum,
  SectionTypeEnum,
  type AppDefinition,
} from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  parseDraftAppAssets,
  parseDraftAppSpec,
  parseDraftAppTheme,
  type AppThemeMode,
} from "./appDraftPreview";
import {
  APP_GENERATION_MODE_OPTIONS,
  buildDefaultAppGenerationPrompt,
  buildHiddenChatAppGenerationPrompt,
  coerceAppGenerationMode,
  isJsonRenderMode,
  type AppGenerationMode,
} from "./appGenerationModes";

type AppSpecPayload = Record<string, unknown>;

const DEFAULT_CATALOG_ID = "setta.app.default";
const DEFAULT_SPEC_VERSION = "v1";
const DEFAULT_THEME_MODE: AppThemeMode = "auto";

const STREAMING_TOGGLE_ROOT_CLASSES =
  "nodrag relative inline-flex h-2.5 w-7 min-w-7 cursor-pointer items-center rounded-full p-[0.2rem] [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black focus-visible:ring-2 disabled:pointer-events-none bg-setta-400 data-[state='checked']:bg-blue-500 dark:bg-setta-600 dark:data-[state='checked']:bg-blue-700";
const STREAMING_TOGGLE_THUMB_CLASSES =
  "block h-2.5 w-2.5 rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4 bg-white dark:bg-setta-800";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveThemeMode(theme: unknown): AppThemeMode {
  if (isRecord(theme)) {
    const mode = theme.mode;
    if (mode === "light" || mode === "dark" || mode === "auto") {
      return mode;
    }
  }
  return DEFAULT_THEME_MODE;
}

function formatCatalogForPrompt(catalog: unknown): string {
  if (!catalog || typeof catalog !== "object") {
    return "Catalog unavailable.";
  }
  const record = catalog as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "unknown";
  const version =
    typeof record.version === "string" ? record.version : "unknown";
  const components = Array.isArray(record.components) ? record.components : [];
  const actions = Array.isArray(record.actions) ? record.actions : [];
  const componentLines = components
    .map((component) => {
      if (!component || typeof component !== "object") {
        return null;
      }
      const componentRecord = component as Record<string, unknown>;
      const type = componentRecord.type;
      if (typeof type !== "string") {
        return null;
      }
      const props = componentRecord.props;
      const propNames =
        props && typeof props === "object" ? Object.keys(props).join(", ") : "";
      return propNames ? `- ${type} (props: ${propNames})` : `- ${type}`;
    })
    .filter(Boolean)
    .join("\n");
  const actionLines = actions
    .map((action) => {
      if (!action || typeof action !== "object") {
        return null;
      }
      const actionRecord = action as Record<string, unknown>;
      const name = actionRecord.name;
      if (typeof name !== "string") {
        return null;
      }
      const params = actionRecord.params;
      const paramNames =
        params && typeof params === "object"
          ? Object.keys(params).join(", ")
          : "";
      return paramNames ? `- ${name} (params: ${paramNames})` : `- ${name}`;
    })
    .filter(Boolean)
    .join("\n");
  return [
    `Catalog: ${id} (version ${version})`,
    "Components:",
    componentLines || "- (none)",
    "Actions:",
    actionLines || "- (none)",
  ].join("\n");
}

function buildDefaultSpec(): AppSpecPayload {
  const root: AppSpecPayload = {
    key: "app-root",
    type: "Stack",
    props: {
      direction: "column",
      gap: 20,
    },
    children: [
      {
        key: "app-overview",
        type: "Card",
        props: {
          title: "Standalone App Starter",
          description:
            "A clean baseline layout with guided input, a primary action, and output rendering.",
        },
      },
      {
        key: "app-inputs",
        type: "Card",
        props: {
          title: "Inputs",
          description: "Map Setta params to user-facing controls.",
        },
        children: [
          {
            key: "app-primary-param",
            type: "ParamInput",
            props: {
              sectionId: "SECTION_ID",
              paramId: "PARAM_ID",
              label: "Primary Parameter",
            },
          },
          {
            key: "app-run",
            type: "ActionButton",
            props: {
              label: "Generate Output",
              action: "run",
              sectionId: "SECTION_ID",
            },
          },
        ],
      },
      {
        key: "app-output",
        type: "Card",
        props: {
          title: "Output",
          description: "Preview section output in-place.",
        },
        children: [
          {
            key: "app-text-output",
            type: "TextOutput",
            props: {
              sectionId: "SECTION_ID",
              label: "Result",
            },
          },
        ],
      },
    ],
  };
  return {
    root,
    elements: buildElementIndex(root as AppSpecPayload),
  };
}

function buildElementIndex(
  root: AppSpecPayload,
): Record<string, AppSpecPayload> {
  const elements: Record<string, AppSpecPayload> = {};
  const stack: AppSpecPayload[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const key = current.key;
    if (typeof key !== "string" || elements[key]) {
      continue;
    }
    elements[key] = current;
    const children = current.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child === "object") {
          stack.push(child as AppSpecPayload);
        }
      }
    }
  }
  return elements;
}

function resolvePromptDisplayName(core: unknown, fallback: string) {
  if (!core || typeof core !== "object") {
    return fallback;
  }
  const record = core as Record<string, unknown>;
  const displayName =
    typeof record.displayName === "string" ? record.displayName.trim() : "";
  if (displayName) {
    return displayName;
  }
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name) {
    return name;
  }
  return fallback;
}

export function formatSectionsForAppPrompt(state: ZustandProjectState) {
  const entries: Array<{
    sectionId: string;
    label: string;
    sectionType: string | null;
    params: Array<{ id: string; name: string; type: string | null }>;
  }> = [];

  for (const [sectionId, core] of Object.entries(state.sections)) {
    const variantId = state.projectConfig.sectionVariantMap[sectionId];
    const variant = variantId ? state.sectionVariants[variantId] : null;
    const impl = variant ? state.sectionImpls[variant.impl] : null;
    const sectionType = impl ? impl.type : null;

    // These are generated UI mirrors, not meaningful app targets.
    if (
      sectionType === SectionTypeEnum.GenPythonCode ||
      sectionType === SectionTypeEnum.GenPythonMetadata
    ) {
      continue;
    }

    const params: Array<{ id: string; name: string; type: string | null }> = [];
    if (impl && impl.type === SectionTypeEnum.MetaControl) {
      const metaControlParamId =
        typeof impl.metaControlParamId === "string"
          ? impl.metaControlParamId
          : null;
      if (metaControlParamId) {
        const metaControlVariantId =
          impl.codeObjVariantMap?.[metaControlParamId] ?? null;
        const metaControlVariant = metaControlVariantId
          ? state.codeObjVariants[metaControlVariantId]
          : null;
        const metaControlImpl = metaControlVariant
          ? state.codeObjImpls[metaControlVariant.impl]
          : null;
        params.push({
          id: metaControlParamId,
          name: resolvePromptDisplayName(
            state.codeObjs[metaControlParamId],
            metaControlParamId,
          ),
          type: metaControlImpl?.type ?? null,
        });
      }
    } else if (impl && isBaseSectionWithParamsImpl(impl)) {
      for (const [codeObjId, codeObjVariantId] of Object.entries(
        impl.codeObjVariantMap,
      )) {
        const codeObjVariant = state.codeObjVariants[codeObjVariantId];
        if (!codeObjVariant) {
          continue;
        }
        const codeObjImpl = state.codeObjImpls[codeObjVariant.impl];
        if (!codeObjImpl) {
          continue;
        }
        if (codeObjImpl.type === CodeObjTypeEnum.CodeCallable) {
          continue;
        }
        params.push({
          id: codeObjId,
          name: resolvePromptDisplayName(state.codeObjs[codeObjId], codeObjId),
          type: codeObjImpl.type ?? null,
        });
      }
    }

    entries.push({
      sectionId,
      label: resolvePromptDisplayName(core, sectionId),
      sectionType: typeof sectionType === "string" ? sectionType : null,
      params,
    });
  }

  if (entries.length === 0) {
    return "";
  }

  const MAX_SECTIONS = 40;
  const MAX_PARAMS = 20;

  entries.sort((a, b) => a.label.localeCompare(b.label));
  const slice = entries.slice(0, MAX_SECTIONS);

  return slice
    .map((entry) => {
      const typeSuffix = entry.sectionType ? ` type=${entry.sectionType}` : "";
      const params =
        entry.params.length > 0
          ? ` params: ${entry.params
              .slice(0, MAX_PARAMS)
              .map((param) => {
                const typeSuffix = param.type ? `, type=${param.type}` : "";
                return `${param.name} (${param.id}${typeSuffix})`;
              })
              .join(
                ", ",
              )}${entry.params.length > MAX_PARAMS ? ` (+${entry.params.length - MAX_PARAMS} more)` : ""}`
          : "";
      return `- ${entry.label} (${entry.sectionId})${typeSuffix}${params}`;
    })
    .join("\n");
}

function parseThemePayloadForRequest({
  draftTheme,
  themeMode,
}: {
  draftTheme: string;
  themeMode: AppThemeMode;
}):
  | {
      ok: true;
      value: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
    } {
  if (draftTheme.trim().length === 0) {
    return { ok: true, value: { mode: themeMode } };
  }
  let rawTheme: unknown;
  try {
    rawTheme = JSON.parse(draftTheme) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON in theme." };
  }
  if (!isRecord(rawTheme)) {
    return { ok: false, error: "Theme JSON must be an object." };
  }
  return {
    ok: true,
    value: {
      ...rawTheme,
      mode: themeMode,
    },
  };
}

function parseAssetsPayloadForRequest(
  draftAssets: string,
): { ok: true; value: unknown[] } | { ok: false; error: string } {
  if (draftAssets.trim().length === 0) {
    return { ok: true, value: [] };
  }
  let rawAssets: unknown;
  try {
    rawAssets = JSON.parse(draftAssets) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON in assets." };
  }
  if (!Array.isArray(rawAssets)) {
    return { ok: false, error: "Assets JSON must be a list." };
  }
  return { ok: true, value: rawAssets };
}

function parseSpecPayloadForRequest(
  draftSpec: string,
): { ok: true; value: AppSpecPayload } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(draftSpec) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON in app spec." };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: "App spec JSON must be an object." };
  }
  return { ok: true, value: parsed };
}

function cloneSpecSeed(spec: unknown): Spec {
  return structuredClone(spec) as Spec;
}

export function cloneSpecForPreview(spec: Spec): Spec {
  return cloneSpecSeed(spec);
}

export function buildSpecSeed({
  draftSpec,
  persistedSpec,
}: {
  draftSpec: string;
  persistedSpec: unknown;
}): Spec {
  if (draftSpec.trim().length > 0) {
    try {
      const parsed = JSON.parse(draftSpec) as unknown;
      if (isRecord(parsed)) {
        return cloneSpecSeed(parsed);
      }
    } catch {
      // Keep stream generation resilient even if the draft text is currently invalid.
    }
  }
  if (isRecord(persistedSpec)) {
    return cloneSpecSeed(persistedSpec);
  }
  return createEmptySpec();
}

type HiddenGenerationResourceLoadState = {
  allLLMConfigsInitialLoadComplete: boolean;
  apiKeysInitialLoadComplete: boolean;
  engineConfigsInitialLoadComplete: boolean;
  externalAgentHealthInitialLoadComplete: boolean;
};

function areHiddenGenerationResourcesLoaded(
  state: HiddenGenerationResourceLoadState,
): boolean {
  return (
    state.allLLMConfigsInitialLoadComplete &&
    state.apiKeysInitialLoadComplete &&
    state.engineConfigsInitialLoadComplete &&
    state.externalAgentHealthInitialLoadComplete
  );
}

function waitForHiddenGenerationResourcesLoaded(): Promise<void> {
  if (areHiddenGenerationResourcesLoaded(useAIStore.getState())) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const unsubscribe = useAIStore.subscribe((state) => {
      if (!areHiddenGenerationResourcesLoaded(state)) {
        return;
      }
      unsubscribe();
      resolve();
    });
  });
}

function pickHiddenGenerationEngine(args: {
  engineConfigs: HiddenGenerationEngineConfig[];
  availableLLMConfigIds: Set<string>;
  externalAgentHealthByConfigId: Map<string, ExternalAgentHealthStatus>;
  defaultLLMConfigId: string | null;
}): {
  engineConfigId: string | null;
  isExternalEngine: boolean;
} {
  for (const config of args.engineConfigs) {
    if (
      config.engineType === EngineTypeEnum.setta_llm &&
      isHiddenGenerationEngineUsable({
        config,
        availableLLMConfigIds: args.availableLLMConfigIds,
        externalAgentHealthByConfigId: args.externalAgentHealthByConfigId,
        defaultLLMConfigId: args.defaultLLMConfigId,
      })
    ) {
      return { engineConfigId: config.id, isExternalEngine: false };
    }
  }
  for (const config of args.engineConfigs) {
    if (
      config.engineType === EngineTypeEnum.external_agent &&
      isHiddenGenerationEngineUsable({
        config,
        availableLLMConfigIds: args.availableLLMConfigIds,
        externalAgentHealthByConfigId: args.externalAgentHealthByConfigId,
        defaultLLMConfigId: args.defaultLLMConfigId,
      })
    ) {
      return { engineConfigId: config.id, isExternalEngine: true };
    }
  }
  return { engineConfigId: null, isExternalEngine: false };
}

type HiddenGenerationEngineConfig = {
  id: string;
  engineType: EngineTypeEnum;
  settaLlmConfigId?: string | null;
  externalAgentConfigId?: string | null;
};

type HiddenGenerationEngineSelection = {
  engineConfigId: string | null;
  isExternalEngine: boolean;
  forceNewChat: boolean;
};

type ExternalAgentHealthStatus = {
  available: boolean;
  supported: boolean;
};

function isHiddenGenerationEngineUsable(args: {
  config: HiddenGenerationEngineConfig;
  availableLLMConfigIds: Set<string>;
  externalAgentHealthByConfigId: Map<string, ExternalAgentHealthStatus>;
  defaultLLMConfigId: string | null;
}): boolean {
  if (args.config.engineType === EngineTypeEnum.setta_llm) {
    const llmConfigId = args.config.settaLlmConfigId ?? args.defaultLLMConfigId;
    return Boolean(llmConfigId && args.availableLLMConfigIds.has(llmConfigId));
  }
  if (args.config.engineType === EngineTypeEnum.external_agent) {
    const externalAgentConfigId = args.config.externalAgentConfigId ?? null;
    if (!externalAgentConfigId) {
      return false;
    }
    const health =
      args.externalAgentHealthByConfigId.get(externalAgentConfigId) ?? null;
    if (!health) {
      return false;
    }
    return health.available && health.supported;
  }
  return false;
}

export function resolveHiddenGenerationEngineSelection(args: {
  activeChatEngineConfigId: string | null;
  engineConfigs: HiddenGenerationEngineConfig[];
  availableLLMConfigIds: Set<string>;
  externalAgentHealthByConfigId: Map<string, ExternalAgentHealthStatus>;
  defaultLLMConfigId: string | null;
}): HiddenGenerationEngineSelection {
  const fallback = pickHiddenGenerationEngine({
    engineConfigs: args.engineConfigs,
    availableLLMConfigIds: args.availableLLMConfigIds,
    externalAgentHealthByConfigId: args.externalAgentHealthByConfigId,
    defaultLLMConfigId: args.defaultLLMConfigId,
  });

  if (!args.activeChatEngineConfigId) {
    return {
      engineConfigId: fallback.engineConfigId,
      isExternalEngine: fallback.isExternalEngine,
      forceNewChat: false,
    };
  }

  const activeChatEngine = args.engineConfigs.find(
    (config) => config.id === args.activeChatEngineConfigId,
  );
  if (activeChatEngine) {
    if (
      isHiddenGenerationEngineUsable({
        config: activeChatEngine,
        availableLLMConfigIds: args.availableLLMConfigIds,
        externalAgentHealthByConfigId: args.externalAgentHealthByConfigId,
        defaultLLMConfigId: args.defaultLLMConfigId,
      })
    ) {
      return {
        engineConfigId: activeChatEngine.id,
        isExternalEngine:
          activeChatEngine.engineType === EngineTypeEnum.external_agent,
        forceNewChat: false,
      };
    }
  }

  const forceNewChat =
    Boolean(fallback.engineConfigId) &&
    fallback.engineConfigId !== args.activeChatEngineConfigId;

  return {
    engineConfigId: fallback.engineConfigId,
    isExternalEngine: fallback.isExternalEngine,
    forceNewChat,
  };
}

export async function resolveGenerationFailureMessage(
  response: Response,
): Promise<string> {
  const fallback = `Generation request failed (status ${response.status}).`;
  let payload: unknown = null;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    return fallback;
  }
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  if (isRecord(payload)) {
    const message = payload.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
    const detail = payload.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail.trim();
    }
  }
  return fallback;
}

function resolveHiddenGenerationErrorMessage(error: unknown): string {
  const detail = getErrorDetail(error);
  if (detail) {
    return detail;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "Failed to send generation request to chat.";
}

export function AppConfigPane() {
  const projectConfigId = useProjectState((x) => x.projectConfig.id);
  const appSpec = useAppDefinition((x) => x.appSpec);
  const isPreviewEnabled = useAppPreview((x) => x.isPreviewEnabled);
  const previewConfigId = useAppPreview((x) => x.previewConfigId);
  const {
    appSpecStreamingEnabled,
    appGenerationMode,
    appGenerationPrompt,
    appGenerationReferenceImageUrl,
    appGenerationReferenceImageNotes,
  } = useLocalStorage(
    (x) => ({
      appSpecStreamingEnabled: x.appSpecStreamingEnabled,
      appGenerationMode: x.appGenerationMode,
      appGenerationPrompt: x.appGenerationPrompt,
      appGenerationReferenceImageUrl: x.appGenerationReferenceImageUrl,
      appGenerationReferenceImageNotes: x.appGenerationReferenceImageNotes,
    }),
    shallow,
  );
  const {
    engineConfigsInitialLoadComplete,
    allLLMConfigsInitialLoadComplete,
    apiKeysInitialLoadComplete,
    externalAgentHealthInitialLoadComplete,
  } = useAIStore(
    (x) => ({
      engineConfigsInitialLoadComplete: x.engineConfigsInitialLoadComplete,
      allLLMConfigsInitialLoadComplete: x.allLLMConfigsInitialLoadComplete,
      apiKeysInitialLoadComplete: x.apiKeysInitialLoadComplete,
      externalAgentHealthInitialLoadComplete:
        x.externalAgentHealthInitialLoadComplete,
    }),
    shallow,
  );
  const { projectMetadata } = useAllProjectMetadata((x) => x);
  const [draftSpec, setDraftSpec] = useState("");
  const [draftTheme, setDraftTheme] = useState("");
  const [draftAssets, setDraftAssets] = useState("");
  const [draftSpecError, setDraftSpecError] = useState<string | null>(null);
  const [draftThemeError, setDraftThemeError] = useState<string | null>(null);
  const [draftAssetsError, setDraftAssetsError] = useState<string | null>(null);
  const [catalogId, setCatalogId] = useState(DEFAULT_CATALOG_ID);
  const [specVersion, setSpecVersion] = useState(DEFAULT_SPEC_VERSION);
  const [appSpecPath, setAppSpecPath] = useState("");
  const [themeMode, setThemeMode] = useState<AppThemeMode>(DEFAULT_THEME_MODE);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationPatchCount, setGenerationPatchCount] = useState(0);
  const [generationHint, setGenerationHint] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{
    errors: Array<{ message: string }>;
    warnings: Array<{ message: string; elementKey?: string | null }>;
    capabilities: {
      catalogId: string;
      catalogVersion: string;
      appSpecVersion: string;
      themeSchemaVersion: string;
      features: Record<string, boolean>;
    };
  } | null>(null);
  const hasDraft = useMemo(() => draftSpec.trim().length > 0, [draftSpec]);
  const activeGenerationMode = coerceAppGenerationMode(appGenerationMode);

  useEffect(() => {
    if (appGenerationMode === activeGenerationMode) {
      return;
    }
    useLocalStorage.setState({ appGenerationMode: activeGenerationMode });
  }, [activeGenerationMode, appGenerationMode]);

  useEffect(() => {
    if (isJsonRenderMode(activeGenerationMode)) {
      return;
    }
    if (!allLLMConfigsInitialLoadComplete) {
      void loadLLMConfig();
    }
    if (!apiKeysInitialLoadComplete) {
      void loadLLMApiKeys();
    }
    if (!engineConfigsInitialLoadComplete) {
      void loadEngineConfigs();
    }
    if (!externalAgentHealthInitialLoadComplete) {
      void loadExternalAgentHealth();
    }
  }, [
    activeGenerationMode,
    allLLMConfigsInitialLoadComplete,
    apiKeysInitialLoadComplete,
    engineConfigsInitialLoadComplete,
    externalAgentHealthInitialLoadComplete,
  ]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!projectConfigId) {
        return;
      }
      useAppPreview.setState({
        previewSpecOverride: undefined,
        aiPreviewSpecOverride: undefined,
        previewThemeOverride: undefined,
        previewAssetsOverride: undefined,
      });
      setDraftSpecError(null);
      setDraftThemeError(null);
      setDraftAssetsError(null);
      setLoading(true);
      setErrorMessage(null);
      const res = await route_get_app_definition({});
      setLoading(false);
      if (!res200(res)) {
        if (isMounted) {
          const detail = getErrorDetail(res.data);
          setErrorMessage(detail ?? "Failed to load app spec.");
        }
        return;
      }
      const nextSpec = res.data.appSpec ?? null;
      useAppDefinition.setState({
        appSpec: nextSpec,
        appDefinition: res.data.appDefinition ?? null,
      });
      if (isMounted) {
        setDraftSpec(nextSpec ? JSON.stringify(nextSpec, null, 2) : "");
        setCatalogId(res.data.appDefinition?.catalogId ?? DEFAULT_CATALOG_ID);
        setSpecVersion(
          res.data.appDefinition?.appSpecVersion ?? DEFAULT_SPEC_VERSION,
        );
        setAppSpecPath(res.data.appDefinition?.appSpecPath ?? "");
        const theme = res.data.appDefinition?.theme ?? null;
        setDraftTheme(theme ? JSON.stringify(theme, null, 2) : "");
        setDraftAssets(
          JSON.stringify(res.data.appDefinition?.assets ?? [], null, 2),
        );
        setThemeMode(resolveThemeMode(theme));
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [projectConfigId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (draftSpec.trim().length === 0) {
        setDraftSpecError(null);
        useAppPreview.setState({ previewSpecOverride: undefined });
        return;
      }
      const parsed = parseDraftAppSpec(draftSpec);
      if (parsed.ok) {
        setDraftSpecError(null);
        useAppPreview.setState({ previewSpecOverride: parsed.value });
        return;
      }
      setDraftSpecError(parsed.error);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [draftSpec]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const parsed = parseDraftAppTheme(draftTheme, themeMode);
      if (parsed.ok) {
        setDraftThemeError(null);
        useAppPreview.setState({ previewThemeOverride: parsed.value });
        return;
      }
      setDraftThemeError(parsed.error);
      const previousTheme = useAppPreview.getState().previewThemeOverride;
      useAppPreview.setState({
        previewThemeOverride: isRecord(previousTheme)
          ? { ...previousTheme, mode: themeMode }
          : { mode: themeMode },
      });
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [draftTheme, themeMode]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const parsed = parseDraftAppAssets(draftAssets);
      if (parsed.ok) {
        setDraftAssetsError(null);
        useAppPreview.setState({ previewAssetsOverride: parsed.value });
        return;
      }
      setDraftAssetsError(parsed.error);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [draftAssets]);

  const preparePromptContext = useCallback(async () => {
    let catalogSummary = `Catalog: ${catalogId}`;
    const catalogRes = await route_get_app_catalog();
    if (res200(catalogRes)) {
      const catalog = catalogRes.data;
      catalogSummary = formatCatalogForPrompt(catalog);
      if (typeof catalog.id === "string") {
        setCatalogId(catalog.id);
      }
    } else {
      const detail = getErrorDetail(catalogRes.data);
      addTemporaryNotification(detail ?? "Failed to load app catalog.");
    }
    const sectionsSummary = formatSectionsForAppPrompt(
      useProjectState.getState(),
    );
    return { catalogSummary, sectionsSummary };
  }, [catalogId]);

  const hydrateSavedAppDefinition = useCallback(
    ({
      savedSpec,
      savedDefinition,
    }: {
      savedSpec: unknown;
      savedDefinition: AppDefinition | null;
    }) => {
      const savedTheme = savedDefinition?.theme ?? null;
      const savedAssets = savedDefinition?.assets ?? [];
      useAppDefinition.setState({
        appSpec: savedSpec,
        appDefinition: savedDefinition,
      });
      setDraftSpec(savedSpec ? JSON.stringify(savedSpec, null, 2) : "");
      setCatalogId(savedDefinition?.catalogId ?? DEFAULT_CATALOG_ID);
      setSpecVersion(savedDefinition?.appSpecVersion ?? DEFAULT_SPEC_VERSION);
      setAppSpecPath(savedDefinition?.appSpecPath ?? "");
      setDraftTheme(savedTheme ? JSON.stringify(savedTheme, null, 2) : "");
      setDraftAssets(JSON.stringify(savedAssets, null, 2));
      setThemeMode(resolveThemeMode(savedTheme));
      useAppPreview.setState({
        previewSpecOverride: isRecord(savedSpec) ? savedSpec : null,
        previewThemeOverride: savedTheme,
        previewAssetsOverride: savedAssets,
      });
      setDraftSpecError(null);
      setDraftThemeError(null);
      setDraftAssetsError(null);
    },
    [],
  );

  const saveAndHydrateAppDefinition = useCallback(
    async ({
      appSpec: nextSpec,
      failureMessage,
      withLoading,
    }: {
      appSpec: AppSpecPayload;
      failureMessage: string;
      withLoading: boolean;
    }): Promise<boolean> => {
      const themePayload = parseThemePayloadForRequest({
        draftTheme,
        themeMode,
      });
      if (!themePayload.ok) {
        setErrorMessage(themePayload.error);
        return false;
      }
      const assetsPayload = parseAssetsPayloadForRequest(draftAssets);
      if (!assetsPayload.ok) {
        setErrorMessage(assetsPayload.error);
        return false;
      }
      if (withLoading) {
        setLoading(true);
      }
      const res = await route_set_app_definition({
        appSpec: nextSpec,
        appSpecPath: appSpecPath.trim() ? appSpecPath.trim() : undefined,
        appSpecVersion: specVersion.trim() ? specVersion.trim() : undefined,
        catalogId: catalogId.trim() ? catalogId.trim() : undefined,
        theme: themePayload.value,
        assets: assetsPayload.value,
      });
      if (withLoading) {
        setLoading(false);
      }
      if (!res200(res)) {
        const detail = getErrorDetail(res.data);
        setErrorMessage(detail ?? failureMessage);
        return false;
      }
      hydrateSavedAppDefinition({
        savedSpec: res.data.appSpec ?? null,
        savedDefinition: res.data.appDefinition ?? null,
      });
      return true;
    },
    [
      appSpecPath,
      catalogId,
      draftAssets,
      draftTheme,
      hydrateSavedAppDefinition,
      specVersion,
      themeMode,
    ],
  );

  const persistGeneratedSpec = useCallback(
    async (spec: Spec): Promise<boolean> => {
      return saveAndHydrateAppDefinition({
        appSpec: spec as unknown as AppSpecPayload,
        failureMessage: "Failed to save generated app spec.",
        withLoading: false,
      });
    },
    [saveAndHydrateAppDefinition],
  );

  const ensureHiddenGenerationResources = useCallback(async () => {
    const pendingLoads: Array<Promise<void>> = [];
    const state = useAIStore.getState();
    const shouldAwaitResourceCompletion =
      !state.allLLMConfigsInitialLoadComplete ||
      !state.apiKeysInitialLoadComplete ||
      !state.engineConfigsInitialLoadComplete ||
      !state.externalAgentHealthInitialLoadComplete;
    if (!state.allLLMConfigsInitialLoadComplete) {
      pendingLoads.push(loadLLMConfig());
    }
    if (!state.apiKeysInitialLoadComplete) {
      pendingLoads.push(loadLLMApiKeys());
    }
    if (!state.engineConfigsInitialLoadComplete) {
      pendingLoads.push(loadEngineConfigs());
    }
    if (!state.externalAgentHealthInitialLoadComplete) {
      pendingLoads.push(loadExternalAgentHealth());
    }
    if (pendingLoads.length > 0) {
      await Promise.all(pendingLoads);
    }
    if (shouldAwaitResourceCompletion) {
      await waitForHiddenGenerationResourcesLoaded();
    }
  }, []);

  type HiddenChatGenerationMode = "prompt_builder" | "mcp_server";

  const runJsonRenderGeneration = useCallback(
    async (mode: AppGenerationMode) => {
      setGenerating(true);
      setGenerationPatchCount(0);
      setGenerationHint(null);
      setErrorMessage(null);
      try {
        const { catalogSummary, sectionsSummary } =
          await preparePromptContext();
        const userPrompt = appGenerationPrompt.trim();
        const effectivePrompt =
          userPrompt || buildDefaultAppGenerationPrompt(mode);
        const includeReferenceImage = mode === "json_render_with_image";
        const referenceImageUrl = includeReferenceImage
          ? appGenerationReferenceImageUrl.trim() || null
          : null;
        const referenceImageNotes = includeReferenceImage
          ? appGenerationReferenceImageNotes.trim() || null
          : null;
        const requestSpecSeed = buildSpecSeed({
          draftSpec,
          persistedSpec: appSpec,
        });
        const response = await fetch(
          `${C_ADDRESSES.BACKEND}${RouteEnum.STREAM_APP_SPEC}`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt: effectivePrompt,
              mode,
              referenceImageUrl,
              referenceImageNotes,
              context: {
                catalogSummary,
                sectionsSummary,
              },
              currentSpec: requestSpecSeed,
            }),
          },
        );
        if (!response.ok || !response.body) {
          setErrorMessage(await resolveGenerationFailureMessage(response));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamRemainder = "";
        let patchCount = 0;
        const generated = requestSpecSeed;

        while (true) {
          const chunk = await reader.read();
          if (chunk.done) {
            streamRemainder += decoder.decode();
            break;
          }
          streamRemainder += decoder.decode(chunk.value, { stream: true });
          while (true) {
            const newlineIndex = streamRemainder.indexOf("\n");
            if (newlineIndex === -1) {
              break;
            }
            const line = streamRemainder.slice(0, newlineIndex);
            streamRemainder = streamRemainder.slice(newlineIndex + 1);
            const patch = parsePatchLine(line);
            if (!patch) {
              continue;
            }
            applyPatchOp(generated, patch);
            patchCount += 1;
            if (patchCount % 5 === 0) {
              useAppPreview.setState({
                previewSpecOverride: cloneSpecForPreview(generated),
              });
              setGenerationPatchCount(patchCount);
            }
          }
        }
        const trailingPatch = parsePatchLine(streamRemainder);
        if (trailingPatch) {
          applyPatchOp(generated, trailingPatch);
          patchCount += 1;
        }
        setGenerationPatchCount(patchCount);
        if (patchCount === 0) {
          setGenerationHint(
            "No patches were produced. Refine your prompt and retry.",
          );
          return;
        }
        useAppPreview.setState({
          previewSpecOverride: cloneSpecForPreview(generated),
        });
        const persisted = await persistGeneratedSpec(generated);
        if (!persisted) {
          return;
        }
        if (
          mode === "json_render_with_image" &&
          !appGenerationReferenceImageUrl.trim()
        ) {
          setGenerationHint(
            "Image-guided mode ran without a reference image URL. Add one for stronger visual fidelity.",
          );
        } else {
          setGenerationHint(
            "Generation complete. If fidelity is off, add stricter layout/spacing guidance and retry.",
          );
        }
        addTemporaryNotification("App generation completed.");
      } catch (error) {
        console.error("Failed to generate app spec", error);
        setErrorMessage("Failed to generate app spec.");
      } finally {
        setGenerating(false);
      }
    },
    [
      appGenerationPrompt,
      appGenerationReferenceImageNotes,
      appGenerationReferenceImageUrl,
      appSpec,
      draftSpec,
      persistGeneratedSpec,
      preparePromptContext,
    ],
  );

  const runHiddenChatGeneration = useCallback(
    async ({ mode }: { mode: HiddenChatGenerationMode }) => {
      setGenerating(true);
      setGenerationPatchCount(0);
      setErrorMessage(null);
      setGenerationHint(null);
      try {
        await ensureHiddenGenerationResources();
        const aiState = useAIStore.getState();
        const { catalogSummary, sectionsSummary } =
          await preparePromptContext();
        const availableLLMConfigIds = new Set<string>();
        if (aiState.allLLMConfigs?.configs) {
          for (const [configId, config] of Object.entries(
            aiState.allLLMConfigs.configs,
          )) {
            if (config.api_key_env && !aiState.apiKeys[config.api_key_env]) {
              continue;
            }
            availableLLMConfigIds.add(configId);
          }
        }
        const externalAgentHealthByConfigId = new Map<
          string,
          ExternalAgentHealthStatus
        >();
        for (const health of aiState.externalAgentHealth) {
          externalAgentHealthByConfigId.set(health.configId, {
            available: health.available,
            supported: health.supported,
          });
        }
        const activeChatId = aiState.activeChatId ?? null;
        const activeChatEngineConfigId = activeChatId
          ? await resolveEngineConfigIdForChat(activeChatId, null)
          : null;
        const engineSelection = resolveHiddenGenerationEngineSelection({
          activeChatEngineConfigId,
          engineConfigs: aiState.engineConfigs,
          availableLLMConfigIds,
          externalAgentHealthByConfigId,
          defaultLLMConfigId: pickDefaultConfigId(aiState.allLLMConfigs),
        });
        if (!engineSelection.engineConfigId) {
          setErrorMessage(
            "No chat engine is available for hidden app generation. Configure Project AI first.",
          );
          return;
        }
        const prompt = buildHiddenChatAppGenerationPrompt({
          mode,
          prompt: appGenerationPrompt,
          catalogSummary,
          sectionsSummary,
          referenceImageUrl: null,
          referenceImageNotes: null,
        });
        const targetChatId = engineSelection.forceNewChat
          ? null
          : activeChatId ?? null;
        const hiddenGenerationSurfaceId = `app-config-hidden-generation:${projectConfigId}`;
        await submitMessage(
          targetChatId,
          prompt,
          [],
          true,
          engineSelection.engineConfigId,
          engineSelection.isExternalEngine,
          {
            pendingSurfaceId: hiddenGenerationSurfaceId,
            appGeneration: {
              mode,
              referenceImageUrl: null,
              referenceImageNotes: null,
            },
          },
        );
        if (targetChatId === null) {
          clearPendingChatDetails(hiddenGenerationSurfaceId);
        }
        if (engineSelection.forceNewChat) {
          setGenerationHint(
            "Generation request sent to a new chat because the active chat engine is unavailable. Stay on this pane while the app spec updates via tool results.",
          );
        } else {
          setGenerationHint(
            "Generation request sent to chat. Stay on this pane while the app spec updates via tool results.",
          );
        }
        addTemporaryNotification("App generation request sent to chat.");
      } catch (error) {
        console.error("Failed to send hidden app generation prompt", error);
        setErrorMessage(resolveHiddenGenerationErrorMessage(error));
      } finally {
        setGenerating(false);
      }
    },
    [
      appGenerationPrompt,
      ensureHiddenGenerationResources,
      preparePromptContext,
    ],
  );

  async function handleGenerate() {
    const mode = activeGenerationMode;
    if (isJsonRenderMode(mode)) {
      await runJsonRenderGeneration(mode);
      return;
    }
    if (mode === "prompt_builder" || mode === "mcp_server") {
      await runHiddenChatGeneration({ mode });
    }
  }

  function handleCreateDefault() {
    const spec = buildDefaultSpec();
    setDraftSpec(JSON.stringify(spec, null, 2));
    if (!appSpecPath) {
      setAppSpecPath("app_specs/app.json");
    }
  }

  async function handleSave() {
    setErrorMessage(null);
    const specPayload = parseSpecPayloadForRequest(draftSpec);
    if (!specPayload.ok) {
      setErrorMessage(specPayload.error);
      return;
    }
    const saved = await saveAndHydrateAppDefinition({
      appSpec: specPayload.value,
      failureMessage: "Failed to save app spec.",
      withLoading: true,
    });
    if (!saved) {
      return;
    }
    addTemporaryNotification("App spec saved.");
  }

  async function handleValidate() {
    setErrorMessage(null);
    setValidationResult(null);
    const specPayload = parseSpecPayloadForRequest(draftSpec);
    if (!specPayload.ok) {
      setErrorMessage(specPayload.error);
      return;
    }
    const themePayload = parseThemePayloadForRequest({
      draftTheme,
      themeMode,
    });
    if (!themePayload.ok) {
      setErrorMessage(themePayload.error);
      return;
    }
    const assetsPayload = parseAssetsPayloadForRequest(draftAssets);
    if (!assetsPayload.ok) {
      setErrorMessage(assetsPayload.error);
      return;
    }

    setValidating(true);
    const res = await route_validate_app_definition({
      appSpec: specPayload.value,
      appSpecVersion: specVersion.trim() ? specVersion.trim() : undefined,
      catalogId: catalogId.trim() ? catalogId.trim() : undefined,
      theme: themePayload.value,
      assets: assetsPayload.value,
    });
    setValidating(false);
    if (!res200(res)) {
      const detail = getErrorDetail(res.data);
      setErrorMessage(detail ?? "Failed to validate app spec.");
      return;
    }
    setValidationResult(res.data);
    if (res.data.errors.length === 0) {
      addTemporaryNotification(
        res.data.warnings.length > 0
          ? `Validation passed with ${res.data.warnings.length} warning(s).`
          : "Validation passed.",
      );
    }
  }

  const activeModeDetails =
    APP_GENERATION_MODE_OPTIONS.find(
      (entry) => entry.mode === activeGenerationMode,
    ) ?? APP_GENERATION_MODE_OPTIONS[0];
  const showStreamingToggle = !isJsonRenderMode(activeGenerationMode);
  const generateButtonLabel = isJsonRenderMode(activeGenerationMode)
    ? "Generate In Pane"
    : "Send To Chat";

  return (
    <section className="setta-pane-scroll flex min-h-0 flex-1 flex-col gap-4 pb-4 text-sm text-setta-600 dark:text-setta-300">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-bold uppercase tracking-wide text-setta-500 dark:text-setta-400">
            App Config
          </h3>
          <p className="text-xs text-setta-500 dark:text-setta-400">
            Mode: {activeModeDetails.label}. {activeModeDetails.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-full border border-setta-200 px-3 py-1 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={() =>
              useAppPreview.setState((state) => ({
                isPreviewEnabled: !state.isPreviewEnabled,
              }))
            }
          >
            {isPreviewEnabled ? "Hide Preview" : "Show Preview"}
          </button>
          <button
            className="rounded-full border border-setta-200 px-3 py-1 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={() => void handleGenerate()}
            disabled={generating}
          >
            {generating ? "Generating..." : generateButtonLabel}
          </button>
          {showStreamingToggle ? (
            <div className="flex select-none items-center gap-2 rounded-full border border-setta-200 bg-white/60 px-3 py-1 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:bg-setta-950/40 dark:text-setta-300 dark:hover:bg-setta-800">
              <span>Streaming mode</span>
              <Switch.Root
                aria-label="Streaming mode"
                className={STREAMING_TOGGLE_ROOT_CLASSES}
                checked={appSpecStreamingEnabled}
                onCheckedChange={(checked) =>
                  useLocalStorage.setState({
                    appSpecStreamingEnabled: checked,
                  })
                }
              >
                <Switch.Thumb className={STREAMING_TOGGLE_THUMB_CLASSES} />
              </Switch.Root>
            </div>
          ) : null}
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-lg border border-setta-200 bg-white/70 p-4 dark:border-setta-700 dark:bg-setta-900/60">
        <div className="flex flex-wrap gap-2">
          {APP_GENERATION_MODE_OPTIONS.map((option) => {
            const selected = option.mode === activeGenerationMode;
            return (
              <button
                key={option.mode}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  selected
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-setta-200 text-setta-600 hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                }`}
                onClick={() =>
                  useLocalStorage.setState({
                    appGenerationMode: option.mode,
                  })
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <label className="flex flex-col gap-1 text-xs">
          Generation Prompt
          <textarea
            aria-label="Generation Prompt"
            className="min-h-[88px] w-full resize-y rounded-lg border border-setta-200 bg-white/90 px-3 py-2 text-xs text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            placeholder={buildDefaultAppGenerationPrompt(activeGenerationMode)}
            value={appGenerationPrompt}
            onChange={(event) =>
              useLocalStorage.setState({
                appGenerationPrompt: event.target.value,
              })
            }
          />
          <span className="text-[11px] text-setta-500 dark:text-setta-400">
            Empty prompt uses a mode-specific default baseline.
          </span>
        </label>
        {activeGenerationMode === "json_render_with_image" && (
          <div className="grid gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Reference image URL
              <input
                aria-label="Reference image URL"
                className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
                placeholder="https://example.com/reference-ui.png"
                value={appGenerationReferenceImageUrl}
                onChange={(event) =>
                  useLocalStorage.setState({
                    appGenerationReferenceImageUrl: event.target.value,
                  })
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Reference image notes
              <textarea
                aria-label="Reference image notes"
                className="min-h-[72px] w-full resize-y rounded-lg border border-setta-200 bg-white/90 px-3 py-2 text-xs text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
                placeholder="Call out spacing, typography, and visual priorities to preserve."
                value={appGenerationReferenceImageNotes}
                onChange={(event) =>
                  useLocalStorage.setState({
                    appGenerationReferenceImageNotes: event.target.value,
                  })
                }
              />
            </label>
          </div>
        )}
      </div>

      {generationHint && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-700/70 dark:bg-blue-900/30 dark:text-blue-200">
          {generationHint}
          {generationPatchCount > 0
            ? ` (applied ${generationPatchCount} patches)`
            : ""}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200">
          {errorMessage}
        </div>
      )}

      {validationResult && (
        <div className="flex flex-col gap-3 rounded-lg border border-setta-200 bg-white/70 p-4 dark:border-setta-700 dark:bg-setta-900/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
              Validation
            </span>
            <span className="text-[11px] text-setta-500 dark:text-setta-400">
              {validationResult.errors.length} error(s),{" "}
              {validationResult.warnings.length} warning(s)
            </span>
          </div>
          {validationResult.errors.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200">
              <div className="font-semibold">Errors</div>
              <ul className="mt-1 list-disc pl-4">
                {validationResult.errors.map((err, idx) => (
                  <li key={`${idx}-${err.message}`}>{err.message}</li>
                ))}
              </ul>
            </div>
          )}
          {validationResult.warnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-200">
              <div className="font-semibold">Warnings</div>
              <ul className="mt-1 list-disc pl-4">
                {validationResult.warnings.map((warn, idx) => (
                  <li key={`${idx}-${warn.message}`}>
                    {warn.message}
                    {warn.elementKey ? ` (element ${warn.elementKey})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="text-[11px] text-setta-500 dark:text-setta-400">
            Capabilities: {validationResult.capabilities.catalogId}{" "}
            {validationResult.capabilities.catalogVersion
              ? `(${validationResult.capabilities.catalogVersion})`
              : ""}
          </div>
        </div>
      )}

      <div className="grid gap-3 rounded-lg border border-setta-200 bg-white/70 p-4 dark:border-setta-700 dark:bg-setta-900/60">
        <label
          className="flex flex-col gap-1 text-xs"
          data-setting-anchor="core.app.catalog_id"
        >
          Catalog ID
          <input
            className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            value={catalogId}
            onChange={(event) => setCatalogId(event.target.value)}
          />
        </label>
        <label
          className="flex flex-col gap-1 text-xs"
          data-setting-anchor="core.app.spec_version"
        >
          Spec version
          <input
            className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            value={specVersion}
            onChange={(event) => setSpecVersion(event.target.value)}
          />
        </label>
        <label
          className="flex flex-col gap-1 text-xs"
          data-setting-anchor="core.app.theme_mode"
        >
          Theme mode
          <select
            className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            value={themeMode}
            onChange={(event) =>
              setThemeMode(event.target.value as AppThemeMode)
            }
          >
            <option value="auto">auto</option>
            <option value="dark">dark</option>
            <option value="light">light</option>
          </select>
          <span className="text-[11px] text-setta-500 dark:text-setta-400">
            App deployments default to auto. Force dark or light here, then
            republish.
          </span>
        </label>
        <label
          className="flex flex-col gap-1 text-xs"
          data-setting-anchor="core.app.spec_path"
        >
          Spec path
          <input
            className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            placeholder="app_specs/app.json"
            value={appSpecPath}
            onChange={(event) => setAppSpecPath(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Preview config
          <select
            className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            value={previewConfigId ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              useAppPreview.setState({
                previewConfigId: value ? value : null,
              });
            }}
          >
            <option value="">Active config</option>
            {projectMetadata.map((config) => (
              <option key={config.id} value={config.id}>
                {config.name}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-setta-500 dark:text-setta-400">
            Select which project config the preview should target.
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-setta-500 dark:text-setta-400">
          <span>App Spec JSON</span>
          <div className="flex gap-2">
            <button
              className="rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
              onClick={handleCreateDefault}
              disabled={loading || generating}
            >
              Create Default
            </button>
            <button
              className="rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
              onClick={() => void handleValidate()}
              disabled={loading || validating || generating || !hasDraft}
            >
              {validating ? "Validating..." : "Validate"}
            </button>
            <button
              className="rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleSave()}
              disabled={loading || validating || generating || !hasDraft}
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        <textarea
          aria-label="App Spec JSON"
          className="min-h-[280px] w-full resize-y rounded-lg border border-setta-200 bg-white/90 px-3 py-2 font-mono text-xs text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
          placeholder={
            appSpec
              ? "Edit the app spec JSON."
              : "No app spec yet. Create or generate one."
          }
          value={draftSpec}
          onChange={(event) => {
            setDraftSpec(event.target.value);
            setValidationResult(null);
          }}
        />
        {draftSpecError && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200"
          >
            {draftSpecError}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs text-setta-500 dark:text-setta-400">
          <span>Theme JSON</span>
          <span className="ml-2 text-[11px]">
            Advanced styling can be set via <code>vars</code> (keys must start
            with <code>--app-</code>).
          </span>
        </div>
        <textarea
          aria-label="Theme JSON"
          className="min-h-[160px] w-full resize-y rounded-lg border border-setta-200 bg-white/90 px-3 py-2 font-mono text-xs text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
          placeholder='{"mode":"dark","vars":{"--app-accent":"#ff006e"}}'
          value={draftTheme}
          onChange={(event) => {
            setDraftTheme(event.target.value);
            setValidationResult(null);
          }}
        />
        {draftThemeError && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200"
          >
            {draftThemeError}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-xs text-setta-500 dark:text-setta-400">
          <span>Assets JSON</span>
          <span className="ml-2 text-[11px]">
            Links are injected as <code>&lt;link&gt;</code> tags. External URLs
            are gated by the deployment policy.
          </span>
        </div>
        <textarea
          aria-label="Assets JSON"
          className="min-h-[120px] w-full resize-y rounded-lg border border-setta-200 bg-white/90 px-3 py-2 font-mono text-xs text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
          placeholder='[{"rel":"stylesheet","href":"/static/app.css"}]'
          value={draftAssets}
          onChange={(event) => {
            setDraftAssets(event.target.value);
            setValidationResult(null);
          }}
        />
        {draftAssetsError && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200"
          >
            {draftAssetsError}
          </div>
        )}
      </div>
    </section>
  );
}
