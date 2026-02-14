import * as Switch from "@radix-ui/react-switch";
import { buildLLMConfigGroups } from "components/Chat/llmConfigUtils";
import { CapabilitySkillsList } from "components/Panes/Overview/ProjectLevelAI/CapabilitiesSharedControls";
import { useCapabilitiesCatalog } from "components/Panes/Overview/ProjectLevelAI/useCapabilitiesCatalog";
import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";
import { useHydrateLLMState } from "components/Panes/Overview/ProjectLevelAI/useHydrateLLMState";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import { useEffect, useMemo, useRef, useState } from "react";
import { submitMessage } from "state/actions/ai";
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
  getAttachmentPolicy,
  isAttachmentMimeAllowed,
} from "utils/attachmentPolicy";
import { formatBytes } from "utils/attachments";
import {
  CHAT_SUPPORTED_IMAGE_LABEL,
  isChatImageFileSupported,
} from "utils/chatAttachmentSupport";
import { createDropzoneFileArtifactId } from "utils/dropzone";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_binary_upload,
  route_delete_artifacts,
  route_get_app_catalog,
  route_get_app_definition,
  route_set_app_definition,
  route_update_artifacts,
  route_validate_app_definition,
} from "utils/generatedEndpoints";
import {
  ArtifactTypeEnum,
  ChatFileAttachment,
  CodeObjTypeEnum,
  EngineTypeEnum,
  FileArtifact,
  isBaseChildlessCodeObjImpl,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
  type TopLevelSectionLayout,
  type ViewModeConfig,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { isProjectChatEngineUsable } from "../ProjectLevelAI/projectChatEngineSelection";
import {
  parseDraftAppAssets,
  parseDraftAppRoutes,
  parseDraftAppSpec,
  parseDraftAppTheme,
  type AppThemeMode,
} from "./appDraftPreview";
import { buildAppGenerationPrompt } from "./appGenerationPrompt";

type AppSpecPayload = Record<string, unknown>;

const DEFAULT_CATALOG_ID = "setta.app.default";
const DEFAULT_SPEC_VERSION = "v1";
const DEFAULT_THEME_MODE: AppThemeMode = "auto";

type AppGenNavPreset = {
  id: string;
  name: string;
  prompt: string;
  builtIn: boolean;
};

const BUILTIN_NAV_PRESETS: Array<AppGenNavPreset> = [
  {
    id: "routes-shell",
    name: "Routes + Shell Navbar (Recommended)",
    builtIn: true,
    prompt: [
      "- Treat tab view modes as pages.",
      "- If any view mode is userFacing, prefer ONLY userFacing tab view modes and include ONLY the sections visible in that view mode.",
      "- Create routes as a list of { path, name, rootKey } and save them via routes in set_app_definition / stream_app_definition.",
      "- rootKey must reference an element key that exists in appSpec.elements.",
      "- Do NOT add a navbar in appSpec; the app shell renders navigation from routes.",
    ].join("\n"),
  },
  {
    id: "single-page",
    name: "Single Page (No Routes)",
    builtIn: true,
    prompt: [
      "- Build a single scrollable page (one route: /).",
      "- Do NOT create multiple routes.",
      "- Use headings/dividers/cards to separate content by view mode or feature area.",
      "- Keep it mobile-first; use a responsive Grid for desktop.",
    ].join("\n"),
  },
  {
    id: "tabs-in-spec",
    name: "Tabs Inside App Spec",
    builtIn: true,
    prompt: [
      "- Build a single route (/).",
      "- Use Tabs/Tab components inside appSpec for navigation between view modes.",
      "- Each Tab should map to a tab view mode and include only the sections visible in that view mode.",
      "- Keep the shell chrome minimal; do not add extra header bars inside appSpec.",
    ].join("\n"),
  },
];

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
    key: "page-home",
    type: "Container",
    props: { maxWidth: { base: 720, md: 1024 } },
    children: [
      {
        key: "page-home-stack",
        type: "Stack",
        props: { direction: "column", gap: { base: 18, md: 24 } },
        children: [
          {
            key: "page-home-title",
            type: "Heading",
            props: { level: 1, text: "App" },
          },
          {
            key: "page-home-subtitle",
            type: "Text",
            props: {
              text: "Bind inputs to Setta params, then run to generate outputs.",
            },
          },
          {
            key: "page-home-grid",
            type: "Grid",
            props: {
              columns: { base: 1, md: 2 },
              gap: { base: 16, md: 20 },
            },
            children: [
              {
                key: "app-inputs-card",
                type: "Card",
                props: {
                  title: "Inputs",
                  description: "Configure and run the project.",
                },
                children: [
                  {
                    key: "app-param-1",
                    type: "ParamInput",
                    props: {
                      sectionId: "SECTION_ID",
                      paramId: "PARAM_ID",
                      label: "Parameter",
                    },
                  },
                  {
                    key: "app-run",
                    type: "ActionButton",
                    props: {
                      label: "Run",
                      action: "run",
                      sectionId: "SECTION_ID",
                    },
                  },
                ],
              },
              {
                key: "app-output-card",
                type: "Card",
                props: {
                  title: "Output",
                  description: "View the latest result.",
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
        if (metaControlImpl && isBaseChildlessCodeObjImpl(metaControlImpl)) {
          params.push({
            id: metaControlParamId,
            name: resolvePromptDisplayName(
              state.codeObjs[metaControlParamId],
              metaControlParamId,
            ),
            type: metaControlImpl.type ?? null,
          });
        }
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
        if (!isBaseChildlessCodeObjImpl(codeObjImpl)) {
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

function resolveViewModeTopLevelSections(
  projectConfig: ZustandProjectState["projectConfig"],
  viewMode: ViewModeConfig,
): Record<string, TopLevelSectionLayout> {
  const baseLayout = projectConfig.topLevelSections ?? {};
  const viewModeLayout = viewMode.topLevelSections ?? {};
  if (Object.keys(viewModeLayout).length === 0) {
    return baseLayout;
  }
  if (Object.keys(baseLayout).length === 0) {
    return viewModeLayout;
  }
  return { ...baseLayout, ...viewModeLayout };
}

function sortTopLevelSectionIdsByLayout(
  layoutById: Record<string, TopLevelSectionLayout>,
): string[] {
  return Object.entries(layoutById)
    .sort((a, b) => {
      const aLayout = a[1];
      const bLayout = b[1];
      if (aLayout.y !== bLayout.y) {
        return aLayout.y - bLayout.y;
      }
      if (aLayout.x !== bLayout.x) {
        return aLayout.x - bLayout.x;
      }
      if (aLayout.zIndex !== bLayout.zIndex) {
        return aLayout.zIndex - bLayout.zIndex;
      }
      return a[0].localeCompare(b[0]);
    })
    .map(([sectionId]) => sectionId);
}

function formatViewModesForAppPrompt(state: ZustandProjectState): string {
  const viewModesById = state.projectConfig.viewModes ?? {};
  const viewModes = Object.values(viewModesById);
  if (viewModes.length === 0) {
    return "";
  }

  const activeId = state.projectConfig.activeViewModeId ?? null;
  viewModes.sort((a, b) => {
    if (a.isUserFacing !== b.isUserFacing) {
      return a.isUserFacing ? -1 : 1;
    }
    if (a.isTab !== b.isTab) {
      return a.isTab ? -1 : 1;
    }
    if (a.sortIndex !== b.sortIndex) {
      return a.sortIndex - b.sortIndex;
    }
    return a.name.localeCompare(b.name);
  });

  const MAX_SECTIONS = 12;

  const lines: string[] = [];
  lines.push("View modes (treat tabs as pages):");
  for (const viewMode of viewModes) {
    const layoutBySectionId = resolveViewModeTopLevelSections(
      state.projectConfig,
      viewMode,
    );
    const orderedTopLevelIds =
      sortTopLevelSectionIdsByLayout(layoutBySectionId);
    const visibleTopLevel = orderedTopLevelIds.filter((sectionId) => {
      const visibility = viewMode.visibilityBySectionId?.[sectionId];
      if (visibility === undefined) {
        return true;
      }
      return visibility;
    });
    const sectionLabels = visibleTopLevel
      .slice(0, MAX_SECTIONS)
      .map((sectionId) => {
        const label = resolvePromptDisplayName(
          state.sections?.[sectionId],
          sectionId,
        );
        return `${label} (${sectionId})`;
      });
    const activeSuffix = activeId === viewMode.id ? ", active=true" : "";
    const hiddenCount = Math.max(
      orderedTopLevelIds.length - visibleTopLevel.length,
      0,
    );
    const hiddenSuffix =
      hiddenCount > 0 ? `, hiddenTopLevel=${hiddenCount}` : "";
    const moreSuffix =
      visibleTopLevel.length > MAX_SECTIONS
        ? ` (+${visibleTopLevel.length - MAX_SECTIONS} more)`
        : "";
    lines.push(
      `- ${viewMode.name} (${viewMode.id}, tab=${viewMode.isTab}, userFacing=${viewMode.isUserFacing}${activeSuffix}${hiddenSuffix}) topLevel: ${sectionLabels.join(", ") || "(none)"}${moreSuffix}`,
    );
  }
  return lines.join("\n");
}

export function AppConfigPane() {
  useHydrateLLMState();
  useHydrateAgenticState();
  const projectConfigId = useProjectState((x) => x.projectConfig.id);
  const appSpec = useAppDefinition((x) => x.appSpec);
  const isPreviewEnabled = useAppPreview((x) => x.isPreviewEnabled);
  const previewConfigId = useAppPreview((x) => x.previewConfigId);
  const appSpecStreamingEnabled = useLocalStorage(
    (x) => x.appSpecStreamingEnabled,
  );
  const navPresetId = useLocalStorage((x) => x.appGenNavPresetId);
  const navPrompt = useLocalStorage((x) => x.appGenNavPrompt);
  const navCustomPresets = useLocalStorage((x) => x.appGenNavCustomPresets);
  const { projectMetadata } = useAllProjectMetadata((x) => x);
  const [draftSpec, setDraftSpec] = useState("");
  const [draftRoutes, setDraftRoutes] = useState("[]");
  const [draftTheme, setDraftTheme] = useState("");
  const [draftAssets, setDraftAssets] = useState("");
  const [draftSpecError, setDraftSpecError] = useState<string | null>(null);
  const [draftRoutesError, setDraftRoutesError] = useState<string | null>(null);
  const [draftThemeError, setDraftThemeError] = useState<string | null>(null);
  const [draftAssetsError, setDraftAssetsError] = useState<string | null>(null);
  const [catalogId, setCatalogId] = useState(DEFAULT_CATALOG_ID);
  const [specVersion, setSpecVersion] = useState(DEFAULT_SPEC_VERSION);
  const [appSpecPath, setAppSpecPath] = useState("");
  const [themeMode, setThemeMode] = useState<AppThemeMode>(DEFAULT_THEME_MODE);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newNavPresetName, setNewNavPresetName] = useState("");
  const [styleImageAttachment, setStyleImageAttachment] =
    useState<ChatFileAttachment | null>(null);
  const [styleImagePreviewUrl, setStyleImagePreviewUrl] = useState<
    string | null
  >(null);
  const [styleImageUploading, setStyleImageUploading] = useState(false);
  const [styleImageError, setStyleImageError] = useState<string | null>(null);
  const styleImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const styleImageAttachmentRef = useRef<ChatFileAttachment | null>(null);
  const styleImagePreviewUrlRef = useRef<string | null>(null);
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
  const chatAttachmentPolicy = useMemo(() => getAttachmentPolicy("chat"), []);
  const {
    activeChatId,
    allLLMConfigs,
    apiKeys,
    engineConfigs,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
  } = useAIStore((state) => ({
    activeChatId: state.activeChatId,
    allLLMConfigs: state.allLLMConfigs,
    apiKeys: state.apiKeys,
    engineConfigs: state.engineConfigs,
    externalAgentHealth: state.externalAgentHealth,
    externalAgentHealthInitialLoadComplete:
      state.externalAgentHealthInitialLoadComplete,
  }));
  const {
    skills: capabilitySkills,
    defaultValues: globalCapabilityDefaults,
    loading: capabilitySkillsLoading,
    error: capabilitySkillsError,
    refresh: refreshCapabilitySkills,
  } = useCapabilitiesCatalog();
  const [promptPreviewDraft, setPromptPreviewDraft] = useState("");
  const [buildingPromptPreview, setBuildingPromptPreview] = useState(false);
  const [sendingPromptPreview, setSendingPromptPreview] = useState(false);
  const [appGenSelectedSkillIds, setAppGenSelectedSkillIds] = useState<
    string[]
  >([]);
  const [appGenSkillSelectionDirty, setAppGenSkillSelectionDirty] =
    useState(false);
  const availableConfigIds = useMemo(() => {
    const ids = new Set<string>();
    const groups = buildLLMConfigGroups(allLLMConfigs, apiKeys);
    for (const group of groups) {
      for (const item of group.items) {
        ids.add(item.id);
      }
    }
    return ids;
  }, [allLLMConfigs, apiKeys]);
  const effectiveEngineConfig = useMemo(() => {
    for (const config of engineConfigs) {
      if (config.engineType !== EngineTypeEnum.setta_llm) {
        continue;
      }
      if (
        isProjectChatEngineUsable(config, {
          allLLMConfigs,
          availableConfigIds,
          externalAgentHealth,
          externalAgentHealthInitialLoadComplete,
        })
      ) {
        return config;
      }
    }
    return null;
  }, [
    allLLMConfigs,
    availableConfigIds,
    engineConfigs,
    externalAgentHealth,
    externalAgentHealthInitialLoadComplete,
  ]);
  const knownAppGenSkillIds = useMemo(() => {
    const skillIds = new Set<string>();
    for (const skill of capabilitySkills) {
      if (skill.parseError) {
        continue;
      }
      skillIds.add(skill.id);
    }
    return skillIds;
  }, [capabilitySkills]);
  const effectiveAppGenSkillIds = useMemo(
    () =>
      appGenSelectedSkillIds.filter((skillId) =>
        knownAppGenSkillIds.has(skillId),
      ),
    [appGenSelectedSkillIds, knownAppGenSkillIds],
  );
  const canSendPromptPreview =
    !buildingPromptPreview &&
    !sendingPromptPreview &&
    !styleImageUploading &&
    promptPreviewDraft.trim().length > 0;

  useEffect(() => {
    setAppGenSelectedSkillIds((current) =>
      current.filter((skillId) => knownAppGenSkillIds.has(skillId)),
    );
  }, [knownAppGenSkillIds]);

  useEffect(() => {
    if (appGenSkillSelectionDirty) {
      return;
    }
    const defaults = globalCapabilityDefaults.defaultSkillIds.filter(
      (skillId) => knownAppGenSkillIds.has(skillId),
    );
    if (defaults.length > 0) {
      setAppGenSelectedSkillIds(defaults);
      return;
    }
    setAppGenSelectedSkillIds(Array.from(knownAppGenSkillIds));
  }, [
    appGenSkillSelectionDirty,
    globalCapabilityDefaults.defaultSkillIds,
    knownAppGenSkillIds,
  ]);

  const navPresetAllItems = useMemo(() => {
    const builtInItems = BUILTIN_NAV_PRESETS.map((preset) => ({
      id: preset.id,
      name: preset.name,
    }));
    const savedItems = navCustomPresets.map((preset) => ({
      id: preset.id,
      name: preset.name,
    }));
    return [
      { group: "Built-in", items: builtInItems },
      { group: "Saved", items: savedItems },
    ].filter((group) => group.items.length > 0);
  }, [navCustomPresets]);

  const selectedCustomNavPreset = useMemo(
    () => navCustomPresets.find((preset) => preset.id === navPresetId) ?? null,
    [navCustomPresets, navPresetId],
  );
  const canSaveNavPreset =
    newNavPresetName.trim().length > 0 && navPrompt.trim().length > 0;

  function applyNavPreset(nextPresetId: string | null) {
    if (!nextPresetId) {
      return;
    }
    const preset =
      BUILTIN_NAV_PRESETS.find((entry) => entry.id === nextPresetId) ??
      navCustomPresets.find((entry) => entry.id === nextPresetId) ??
      null;
    if (!preset) {
      return;
    }
    useLocalStorage.setState({
      appGenNavPresetId: nextPresetId,
      appGenNavPrompt: preset.prompt,
    });
  }

  function handleSaveNavPreset() {
    const name = newNavPresetName.trim();
    if (!name) {
      addTemporaryNotification("Preset name is required.");
      return;
    }
    if (navPrompt.trim().length === 0) {
      addTemporaryNotification("Navigation instructions are empty.");
      return;
    }
    const presetId = createNewId();
    useLocalStorage.setState((state) => ({
      appGenNavCustomPresets: [
        ...state.appGenNavCustomPresets,
        { id: presetId, name, prompt: state.appGenNavPrompt },
      ],
      appGenNavPresetId: presetId,
    }));
    setNewNavPresetName("");
    addTemporaryNotification("Saved navigation preset.");
  }

  function handleUpdateSelectedNavPreset() {
    if (!selectedCustomNavPreset) {
      return;
    }
    useLocalStorage.setState((state) => ({
      appGenNavCustomPresets: state.appGenNavCustomPresets.map((preset) =>
        preset.id === selectedCustomNavPreset.id
          ? { ...preset, prompt: state.appGenNavPrompt }
          : preset,
      ),
    }));
    addTemporaryNotification("Updated navigation preset.");
  }

  function handleDeleteSelectedNavPreset() {
    if (!selectedCustomNavPreset) {
      return;
    }
    const fallbackPreset = BUILTIN_NAV_PRESETS[0];
    useLocalStorage.setState((state) => ({
      appGenNavCustomPresets: state.appGenNavCustomPresets.filter(
        (preset) => preset.id !== selectedCustomNavPreset.id,
      ),
      appGenNavPresetId: fallbackPreset?.id ?? "routes-shell",
      appGenNavPrompt: fallbackPreset?.prompt ?? "",
    }));
    addTemporaryNotification("Deleted navigation preset.");
  }

  useEffect(() => {
    return () => {
      const attachment = styleImageAttachmentRef.current;
      if (attachment) {
        void route_delete_artifacts({
          artifacts: [{ id: attachment.id, type: ArtifactTypeEnum.File }],
        });
      }
      const previewUrl = styleImagePreviewUrlRef.current;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

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
      setDraftRoutesError(null);
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
        setDraftRoutes(
          JSON.stringify(res.data.appDefinition?.routes ?? [], null, 2),
        );
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
      const parsed = parseDraftAppRoutes(draftRoutes);
      if (parsed.ok) {
        setDraftRoutesError(null);
        return;
      }
      setDraftRoutesError(parsed.error);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [draftRoutes]);

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

  function clearStyleImageState(options?: { revokePreview?: boolean }) {
    const revokePreview = options?.revokePreview ?? true;
    styleImageAttachmentRef.current = null;
    setStyleImageAttachment(null);
    setStyleImageError(null);
    if (revokePreview) {
      const url = styleImagePreviewUrlRef.current;
      if (url) {
        URL.revokeObjectURL(url);
      }
      styleImagePreviewUrlRef.current = null;
      setStyleImagePreviewUrl(null);
    }
    if (styleImageFileInputRef.current) {
      styleImageFileInputRef.current.value = "";
    }
  }

  async function deleteStyleImageArtifact(attachment: ChatFileAttachment) {
    const res = await route_delete_artifacts({
      artifacts: [{ id: attachment.id, type: ArtifactTypeEnum.File }],
    });
    if (!res200(res)) {
      const detail = getErrorDetail(res.data);
      addTemporaryNotification(detail ?? "Failed to delete style image.");
    }
  }

  async function handleStyleImageSelected(file: File) {
    setStyleImageError(null);
    if (styleImageUploading) {
      return;
    }
    const mimeType = file.type || "application/octet-stream";
    if (!isAttachmentMimeAllowed(mimeType, chatAttachmentPolicy)) {
      const message =
        `Unsupported file type. ${chatAttachmentPolicy.allowedMimeLabel}`.trim();
      setStyleImageError(message);
      addTemporaryNotification(message);
      return;
    }
    if (!isChatImageFileSupported(file)) {
      const message =
        `Unsupported image type. ${CHAT_SUPPORTED_IMAGE_LABEL}`.trim();
      setStyleImageError(message);
      addTemporaryNotification(message);
      return;
    }
    if (file.size > chatAttachmentPolicy.maxFileBytes) {
      const message = `File exceeds ${chatAttachmentPolicy.maxFileLabel} limit.`;
      setStyleImageError(message);
      addTemporaryNotification(message);
      return;
    }

    const previousAttachment = styleImageAttachmentRef.current;
    if (previousAttachment) {
      await deleteStyleImageArtifact(previousAttachment);
    }
    clearStyleImageState({ revokePreview: true });

    setStyleImageUploading(true);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("durable", "false");
      const uploadRes = await route_binary_upload(form);
      if (!res200(uploadRes)) {
        const detail = getErrorDetail(uploadRes.data);
        const message = detail ?? "Failed to upload style image.";
        setStyleImageError(message);
        addTemporaryNotification(message);
        return;
      }

      const fileId = createDropzoneFileArtifactId(file.name);
      const artifacts: FileArtifact[] = [
        {
          type: ArtifactTypeEnum.File,
          id: fileId,
          value: uploadRes.data,
        },
      ];
      const updateRes = await route_update_artifacts({
        artifacts,
        uploadScope: "chat",
      });
      if (!res200(updateRes)) {
        const detail = getErrorDetail(updateRes.data);
        const message = detail ?? "Failed to store style image.";
        setStyleImageError(message);
        addTemporaryNotification(message);
        return;
      }

      const attachment: ChatFileAttachment = {
        id: fileId,
        name: file.name,
        mimeType,
        size: file.size,
      };
      styleImageAttachmentRef.current = attachment;
      setStyleImageAttachment(attachment);

      const nextUrl = URL.createObjectURL(file);
      const prevUrl = styleImagePreviewUrlRef.current;
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
      }
      styleImagePreviewUrlRef.current = nextUrl;
      setStyleImagePreviewUrl(nextUrl);
    } finally {
      setStyleImageUploading(false);
    }
  }

  async function handleClearStyleImage() {
    if (styleImageUploading) {
      return;
    }
    const attachment = styleImageAttachmentRef.current;
    clearStyleImageState({ revokePreview: true });
    if (attachment) {
      await deleteStyleImageArtifact(attachment);
    }
  }

  function handleToggleAppGenSkill(skillId: string, selected: boolean) {
    setAppGenSkillSelectionDirty(true);
    setAppGenSelectedSkillIds((current) => {
      if (selected) {
        if (current.includes(skillId)) {
          return current;
        }
        return [...current, skillId];
      }
      return current.filter((entry) => entry !== skillId);
    });
  }

  async function buildPromptPreview(): Promise<string> {
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
    const sections = formatSectionsForAppPrompt(useProjectState.getState());
    const viewModes = formatViewModesForAppPrompt(useProjectState.getState());
    const prompt = buildAppGenerationPrompt({
      catalogSummary,
      sectionsSummary: sections,
      viewModesSummary: viewModes,
      navigationInstructions: navPrompt,
      appSpecStreamingEnabled,
    });
    const styleNote = styleImageAttachmentRef.current
      ? [
          "",
          "Style reference:",
          "- An image is attached to this message. Treat it as the style reference for the app's look and feel.",
        ].join("\n")
      : "";
    return `${prompt}${styleNote}`;
  }

  async function handleBuildPromptPreview() {
    setBuildingPromptPreview(true);
    try {
      const nextPrompt = await buildPromptPreview();
      setPromptPreviewDraft(nextPrompt);
    } finally {
      setBuildingPromptPreview(false);
    }
  }

  async function handleSendPromptPreviewToChat() {
    const prompt = promptPreviewDraft.trim();
    if (prompt.length === 0) {
      addTemporaryNotification("Prompt preview is empty.");
      return;
    }
    if (!effectiveEngineConfig) {
      addTemporaryNotification(
        "No usable Setta LLM engine is configured. Open Project AI Chat and select an LLM config.",
      );
      return;
    }
    const isEngineUsable = isProjectChatEngineUsable(effectiveEngineConfig, {
      allLLMConfigs,
      availableConfigIds,
      externalAgentHealth,
      externalAgentHealthInitialLoadComplete,
    });
    if (!isEngineUsable) {
      addTemporaryNotification(
        "Selected LLM engine has no usable config. Open Project AI Chat and select an LLM config.",
      );
      return;
    }
    const attachments = styleImageAttachmentRef.current
      ? [styleImageAttachmentRef.current]
      : [];
    setSendingPromptPreview(true);
    try {
      const chatId = await submitMessage(
        activeChatId ?? null,
        prompt,
        attachments,
        true,
        effectiveEngineConfig.id,
        false,
        undefined,
        null,
        null,
        { overrideSkillIds: effectiveAppGenSkillIds },
      );
      if (!chatId) {
        addTemporaryNotification("Failed to send prompt to Project AI Chat.");
        return;
      }
      useAIStore.setState({ activeChatId: chatId });
      if (attachments.length > 0) {
        // Transfer attachment ownership to chat after successful submit.
        clearStyleImageState({ revokePreview: true });
      }
      addTemporaryNotification("Sent to Project AI Chat.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addTemporaryNotification(message || "Failed to send prompt.");
    } finally {
      setSendingPromptPreview(false);
    }
  }

  function handleCreateDefault() {
    const spec = buildDefaultSpec();
    setDraftSpec(JSON.stringify(spec, null, 2));
    const rootKey =
      isRecord(spec.root) && typeof spec.root.key === "string"
        ? spec.root.key
        : null;
    setDraftRoutes(
      JSON.stringify(
        [{ path: "/", name: "Home", rootKey: rootKey ?? null }],
        null,
        2,
      ),
    );
    if (!appSpecPath) {
      setAppSpecPath("app_specs/app.json");
    }
  }

  async function handleSave() {
    setErrorMessage(null);
    let parsed: AppSpecPayload | null = null;
    try {
      parsed = JSON.parse(draftSpec) as AppSpecPayload;
    } catch (err) {
      setErrorMessage("Invalid JSON in app spec.");
      return;
    }
    let parsedTheme: Record<string, unknown> | null = null;
    if (draftTheme.trim().length > 0) {
      try {
        const rawTheme = JSON.parse(draftTheme) as unknown;
        if (!isRecord(rawTheme)) {
          setErrorMessage("Theme JSON must be an object.");
          return;
        }
        parsedTheme = rawTheme;
      } catch (err) {
        setErrorMessage("Invalid JSON in theme.");
        return;
      }
    }
    const themePayload = {
      ...(parsedTheme ?? {}),
      mode: themeMode,
    };

    let parsedAssets: unknown[] | null = [];
    if (draftAssets.trim().length > 0) {
      try {
        const rawAssets = JSON.parse(draftAssets) as unknown;
        if (!Array.isArray(rawAssets)) {
          setErrorMessage("Assets JSON must be a list.");
          return;
        }
        parsedAssets = rawAssets;
      } catch (err) {
        setErrorMessage("Invalid JSON in assets.");
        return;
      }
    }
    const parsedRoutes = parseDraftAppRoutes(draftRoutes);
    if (!parsedRoutes.ok) {
      setErrorMessage(parsedRoutes.error);
      return;
    }
    setLoading(true);
    const res = await route_set_app_definition({
      appSpec: parsed,
      appSpecPath: appSpecPath.trim() ? appSpecPath.trim() : undefined,
      appSpecVersion: specVersion.trim() ? specVersion.trim() : undefined,
      catalogId: catalogId.trim() ? catalogId.trim() : undefined,
      routes: parsedRoutes.value,
      theme: themePayload,
      assets: parsedAssets ?? undefined,
    });
    setLoading(false);
    if (!res200(res)) {
      const detail = getErrorDetail(res.data);
      setErrorMessage(detail ?? "Failed to save app spec.");
      return;
    }
    useAppDefinition.setState({
      appSpec: res.data.appSpec ?? null,
      appDefinition: res.data.appDefinition ?? null,
    });
    const savedSpec = res.data.appSpec ?? null;
    const savedDefinition = res.data.appDefinition ?? null;
    const savedTheme = savedDefinition?.theme ?? null;
    const savedAssets = savedDefinition?.assets ?? [];
    setDraftSpec(savedSpec ? JSON.stringify(savedSpec, null, 2) : "");
    setCatalogId(savedDefinition?.catalogId ?? DEFAULT_CATALOG_ID);
    setSpecVersion(savedDefinition?.appSpecVersion ?? DEFAULT_SPEC_VERSION);
    setAppSpecPath(savedDefinition?.appSpecPath ?? "");
    setDraftRoutes(JSON.stringify(savedDefinition?.routes ?? [], null, 2));
    setDraftTheme(savedTheme ? JSON.stringify(savedTheme, null, 2) : "");
    setDraftAssets(JSON.stringify(savedAssets, null, 2));
    setThemeMode(resolveThemeMode(savedTheme));
    useAppPreview.setState({
      previewSpecOverride: savedSpec,
      previewThemeOverride: savedTheme,
      previewAssetsOverride: savedAssets,
    });
    setDraftSpecError(null);
    setDraftThemeError(null);
    setDraftAssetsError(null);
    addTemporaryNotification("App spec saved.");
  }

  async function handleValidate() {
    setErrorMessage(null);
    setValidationResult(null);
    let parsed: AppSpecPayload | null = null;
    try {
      parsed = JSON.parse(draftSpec) as AppSpecPayload;
    } catch (err) {
      setErrorMessage("Invalid JSON in app spec.");
      return;
    }
    let parsedTheme: Record<string, unknown> | null = null;
    if (draftTheme.trim().length > 0) {
      try {
        const rawTheme = JSON.parse(draftTheme) as unknown;
        if (!isRecord(rawTheme)) {
          setErrorMessage("Theme JSON must be an object.");
          return;
        }
        parsedTheme = rawTheme;
      } catch (err) {
        setErrorMessage("Invalid JSON in theme.");
        return;
      }
    }
    const themePayload = {
      ...(parsedTheme ?? {}),
      mode: themeMode,
    };

    let parsedAssets: unknown[] | null = [];
    if (draftAssets.trim().length > 0) {
      try {
        const rawAssets = JSON.parse(draftAssets) as unknown;
        if (!Array.isArray(rawAssets)) {
          setErrorMessage("Assets JSON must be a list.");
          return;
        }
        parsedAssets = rawAssets;
      } catch (err) {
        setErrorMessage("Invalid JSON in assets.");
        return;
      }
    }
    const parsedRoutes = parseDraftAppRoutes(draftRoutes);
    if (!parsedRoutes.ok) {
      setErrorMessage(parsedRoutes.error);
      return;
    }

    setValidating(true);
    const res = await route_validate_app_definition({
      appSpec: parsed,
      appSpecVersion: specVersion.trim() ? specVersion.trim() : undefined,
      catalogId: catalogId.trim() ? catalogId.trim() : undefined,
      routes: parsedRoutes.value,
      theme: themePayload,
      assets: parsedAssets ?? undefined,
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

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4 pr-2 text-sm text-setta-600 dark:text-setta-300">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-bold uppercase tracking-wide text-setta-500 dark:text-setta-400">
            App Config
          </h3>
          <p className="text-xs text-setta-500 dark:text-setta-400">
            Manage the JSON-rendered app spec and preview.
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
            className="rounded-full border border-setta-200 px-3 py-1 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={() => void handleBuildPromptPreview()}
            disabled={styleImageUploading || buildingPromptPreview}
          >
            {buildingPromptPreview ? "Building..." : "Build Prompt"}
          </button>
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
        </div>
      </header>

      <section className="grid gap-3 rounded-lg border border-setta-200 bg-white/70 p-4 dark:border-setta-700 dark:bg-setta-900/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
              Prompt Builder
            </span>
            <span className="text-[11px] text-setta-500 dark:text-setta-400">
              Customize navigation instructions used by App Gen.
            </span>
          </div>
        </div>

        <div className="grid gap-3">
          <label className="flex flex-col gap-1 text-xs">
            Navigation preset
            <IdNameCombobox
              allItems={navPresetAllItems}
              value={navPresetId}
              onSelectedItemChange={applyNavPreset}
              placeholder="Select a preset..."
            />
          </label>

          <label className="flex flex-col gap-1 text-xs">
            Navigation instructions
            <textarea
              aria-label="Navigation instructions"
              className="min-h-[120px] w-full resize-y rounded-lg border border-setta-200 bg-white/90 px-3 py-2 font-mono text-xs text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
              value={navPrompt}
              onChange={(event) =>
                useLocalStorage.setState({
                  appGenNavPrompt: event.target.value,
                })
              }
            />
            <span className="text-[11px] text-setta-500 dark:text-setta-400">
              This block is injected verbatim under "Pages and navigation:" in
              the generated prompt.
            </span>
          </label>

          <div className="grid gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs">Style reference image (optional)</span>
              <span className="text-[11px] text-setta-500 dark:text-setta-400">
                If provided, this image is attached to the generated chat
                message and used as a style reference.{" "}
                {CHAT_SUPPORTED_IMAGE_LABEL} Max{" "}
                {chatAttachmentPolicy.maxFileLabel}.
              </span>
            </div>

            <input
              ref={styleImageFileInputRef}
              aria-label="Style reference image"
              type="file"
              accept="image/*"
              className="hidden"
              disabled={styleImageUploading}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                if (!file) {
                  return;
                }
                void handleStyleImageSelected(file);
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
                onClick={() => styleImageFileInputRef.current?.click()}
                disabled={styleImageUploading}
              >
                {styleImageAttachment ? "Replace image" : "Attach image"}
              </button>
              {styleImageAttachment ? (
                <button
                  type="button"
                  className="rounded-full border border-red-200 px-3 py-1 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-700/70 dark:text-red-200 dark:hover:bg-red-900/30"
                  onClick={() => void handleClearStyleImage()}
                  disabled={styleImageUploading}
                >
                  Clear
                </button>
              ) : null}
              {styleImageUploading ? (
                <span className="text-[11px] text-setta-500 dark:text-setta-400">
                  Uploading...
                </span>
              ) : null}
            </div>

            {styleImageAttachment ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-setta-200 bg-white/80 px-3 py-2 text-xs text-setta-700 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200">
                {styleImagePreviewUrl ? (
                  <img
                    src={styleImagePreviewUrl}
                    alt="Style reference preview"
                    className="h-12 w-12 rounded-md border border-setta-200 object-cover dark:border-setta-700"
                  />
                ) : null}
                <div className="min-w-[180px] flex-1">
                  <div className="truncate font-semibold">
                    {styleImageAttachment.name}
                  </div>
                  {styleImageAttachment.size !== null &&
                  styleImageAttachment.size !== undefined ? (
                    <div className="text-[11px] text-setta-500 dark:text-setta-400">
                      {formatBytes(styleImageAttachment.size)}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {styleImageError ? (
              <div className="rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-200">
                {styleImageError}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs">
              New preset name
              <input
                className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
                value={newNavPresetName}
                onChange={(event) => setNewNavPresetName(event.target.value)}
              />
            </label>

            <button
              type="button"
              className="rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
              onClick={handleSaveNavPreset}
              disabled={!canSaveNavPreset}
            >
              Save preset
            </button>

            <button
              type="button"
              className="rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
              onClick={handleUpdateSelectedNavPreset}
              disabled={!selectedCustomNavPreset}
            >
              Update selected
            </button>

            <button
              type="button"
              className="rounded-full border border-red-200 px-3 py-1 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-700/70 dark:text-red-200 dark:hover:bg-red-900/30"
              onClick={handleDeleteSelectedNavPreset}
              disabled={!selectedCustomNavPreset}
            >
              Delete selected
            </button>
          </div>
        </div>
      </section>

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
        <label className="flex flex-col gap-1 text-xs">
          Catalog ID
          <input
            className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            value={catalogId}
            onChange={(event) => setCatalogId(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Spec version
          <input
            className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
            value={specVersion}
            onChange={(event) => setSpecVersion(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
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
        <label className="flex flex-col gap-1 text-xs">
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
            >
              Create Default
            </button>
            <button
              className="rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
              onClick={() => void handleValidate()}
              disabled={loading || validating || !hasDraft}
            >
              {validating ? "Validating..." : "Validate"}
            </button>
            <button
              className="rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleSave()}
              disabled={loading || validating || !hasDraft}
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
          <span>Routes JSON</span>
          <span className="ml-2 text-[11px]">
            Optional pages for app deployments:{" "}
            <code>[&#123; path, name, rootKey &#125;]</code>
          </span>
        </div>
        <textarea
          aria-label="Routes JSON"
          className="min-h-[120px] w-full resize-y rounded-lg border border-setta-200 bg-white/90 px-3 py-2 font-mono text-xs text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
          placeholder='[{"path":"/","name":"Home","rootKey":"page-home"}]'
          value={draftRoutes}
          onChange={(event) => {
            setDraftRoutes(event.target.value);
            setValidationResult(null);
          }}
        />
        {draftRoutesError && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200"
          >
            {draftRoutesError}
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

      <div className="grid gap-3 rounded-lg border border-setta-200 bg-white/70 p-4 dark:border-setta-700 dark:bg-setta-900/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
              Prompt Preview
            </span>
            <span className="text-[11px] text-setta-500 dark:text-setta-400">
              App Gen always sends with this custom skill selection and ignores
              Project AI Chat skill mode for this request.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
              onClick={() => void refreshCapabilitySkills()}
              disabled={capabilitySkillsLoading}
            >
              {capabilitySkillsLoading ? "Refreshing..." : "Refresh Skills"}
            </button>
            <button
              type="button"
              className="rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
              onClick={() => void handleBuildPromptPreview()}
              disabled={styleImageUploading || buildingPromptPreview}
            >
              {buildingPromptPreview ? "Building..." : "Rebuild Prompt"}
            </button>
            <button
              type="button"
              className="rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleSendPromptPreviewToChat()}
              disabled={!canSendPromptPreview}
            >
              {sendingPromptPreview ? "Generating..." : "Generate"}
            </button>
          </div>
        </div>

        {capabilitySkillsError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200">
            {capabilitySkillsError}
          </div>
        ) : null}

        <div className="grid gap-2 rounded-md border border-setta-200/70 bg-white/70 p-3 dark:border-setta-800 dark:bg-setta-950/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-setta-600 dark:text-setta-300">
              App Gen Skill Browser
            </span>
            <span className="text-[11px] text-setta-500 dark:text-setta-400">
              {effectiveAppGenSkillIds.length} selected
            </span>
          </div>
          <CapabilitySkillsList
            skills={capabilitySkills}
            selectedSkillIds={effectiveAppGenSkillIds}
            onToggleSkill={handleToggleAppGenSkill}
            isDisabled={buildingPromptPreview || sendingPromptPreview}
            emptyMessage="No skills available."
            maxHeightClassName="max-h-52"
          />
        </div>

        <textarea
          aria-label="App generation prompt preview"
          className="min-h-[260px] w-full resize-y rounded-lg border border-setta-200 bg-white/90 px-3 py-2 font-mono text-xs text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
          placeholder="Click Build Prompt to construct the App Gen request."
          value={promptPreviewDraft}
          onChange={(event) => setPromptPreviewDraft(event.target.value)}
        />
      </div>
    </section>
  );
}
