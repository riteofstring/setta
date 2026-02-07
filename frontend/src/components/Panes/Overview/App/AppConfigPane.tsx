import { useEffect, useMemo, useState } from "react";
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
import { OverviewTabNameEnum } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_get_app_catalog,
  route_get_app_definition,
  route_set_app_definition,
} from "utils/generatedEndpoints";
import {
  CodeObjTypeEnum,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";

type AppSpecPayload = Record<string, unknown>;
type AppThemeMode = "auto" | "light" | "dark";

const DEFAULT_CATALOG_ID = "setta.app.default";
const DEFAULT_SPEC_VERSION = "v1";
const DEFAULT_THEME_MODE: AppThemeMode = "auto";

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
    props: { direction: "column", gap: 16 },
    children: [
      {
        key: "app-hero",
        type: "Card",
        props: {
          title: "App Inputs",
          description: "Bind inputs to Setta params.",
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
        key: "app-output",
        type: "Card",
        props: { title: "Output" },
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
              .join(", ")}${entry.params.length > MAX_PARAMS ? ` (+${entry.params.length - MAX_PARAMS} more)` : ""}`
          : "";
      return `- ${entry.label} (${entry.sectionId})${typeSuffix}${params}`;
    })
    .join("\n");
}

  export function AppConfigPane() {
  const projectConfigId = useProjectState((x) => x.projectConfig.id);
  const appSpec = useAppDefinition((x) => x.appSpec);
  const isPreviewEnabled = useAppPreview((x) => x.isPreviewEnabled);
  const previewConfigId = useAppPreview((x) => x.previewConfigId);
  const { projectMetadata } = useAllProjectMetadata((x) => x);
  const [draftSpec, setDraftSpec] = useState("");
  const [catalogId, setCatalogId] = useState(DEFAULT_CATALOG_ID);
  const [specVersion, setSpecVersion] = useState(DEFAULT_SPEC_VERSION);
  const [appSpecPath, setAppSpecPath] = useState("");
  const [themeMode, setThemeMode] = useState<AppThemeMode>(DEFAULT_THEME_MODE);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasDraft = useMemo(() => draftSpec.trim().length > 0, [draftSpec]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!projectConfigId) {
        return;
      }
      setLoading(true);
      setErrorMessage(null);
      const res = await route_get_app_definition({});
      setLoading(false);
      if (!res200(res)) {
        if (isMounted) {
          setErrorMessage("Failed to load app spec.");
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
        setThemeMode(resolveThemeMode(res.data.appDefinition?.theme ?? null));
      }
    }

    void load();
    return () => {
      isMounted = false;
    };
  }, [projectConfigId]);

  async function handleGeneratePrompt() {
    let catalogSummary = `Catalog: ${catalogId}`;
    const catalogRes = await route_get_app_catalog();
    if (res200(catalogRes)) {
      const catalog = catalogRes.data;
      catalogSummary = formatCatalogForPrompt(catalog);
      if (typeof catalog.id === "string") {
        setCatalogId(catalog.id);
      }
    } else {
      addTemporaryNotification("Failed to load app catalog.");
    }
    const sections = formatSectionsForAppPrompt(useProjectState.getState());
    const prompt = `Generate a JSON Render app spec using the catalog below.\n\nRules:\n- Use only catalog components.\n- Bind ParamInput with sectionId + paramId (or dataPath -> dataBindings).\n- Do not bind ParamInput to CodeParam params; CodeParam edits are blocked in app deployments.\n- dataPath values must be JSON Pointer strings (example: /params/name).\n- Include one ActionButton with action \"run\" and set its sectionId.\n- Return JSON only (no prose).\n\n${catalogSummary}\n\nAvailable sections (use ids as sectionId; param ids are paramId):\n${sections || "No sections yet."}\n\nOutput format should be a UITree object: { root: UIElement, elements: { [key]: UIElement } }.`;
    useAIStore.setState({ pendingProjectChatPrompt: prompt });
    useLocalStorage.setState({
      overviewTab: OverviewTabNameEnum.ProjectAIChat,
      overviewVis: true,
    });
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
    let parsed: AppSpecPayload | null = null;
    try {
      parsed = JSON.parse(draftSpec) as AppSpecPayload;
    } catch (err) {
      setErrorMessage("Invalid JSON in app spec.");
      return;
    }
    const existingTheme = useAppDefinition.getState().appDefinition?.theme ?? null;
    const themePayload = {
      ...(isRecord(existingTheme) ? existingTheme : {}),
      mode: themeMode,
    };
    setLoading(true);
    const res = await route_set_app_definition({
      appSpec: parsed,
      appSpecPath: appSpecPath.trim() ? appSpecPath.trim() : undefined,
      appSpecVersion: specVersion.trim() ? specVersion.trim() : undefined,
      catalogId: catalogId.trim() ? catalogId.trim() : undefined,
      theme: themePayload,
    });
    setLoading(false);
    if (!res200(res)) {
      setErrorMessage("Failed to save app spec.");
      return;
    }
    useAppDefinition.setState({
      appSpec: res.data.appSpec ?? null,
      appDefinition: res.data.appDefinition ?? null,
    });
    addTemporaryNotification("App spec saved.");
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
            className="rounded-full border border-setta-200 px-3 py-1 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={handleGeneratePrompt}
          >
            Generate App
          </button>
        </div>
      </header>

      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200">
          {errorMessage}
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
              className="rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void handleSave()}
              disabled={loading || !hasDraft}
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        <textarea
          className="min-h-[280px] w-full resize-y rounded-lg border border-setta-200 bg-white/90 px-3 py-2 font-mono text-xs text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
          placeholder={
            appSpec
              ? "Edit the app spec JSON."
              : "No app spec yet. Create or generate one."
          }
          value={draftSpec}
          onChange={(event) => setDraftSpec(event.target.value)}
        />
      </div>
    </section>
  );
}
