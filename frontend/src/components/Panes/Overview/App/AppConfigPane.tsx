import { useCallback, useEffect, useMemo, useState } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  useAllProjectMetadata,
  useAppDefinition,
  useAppPreview,
  useProjectState,
} from "state/definitions";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_app_definition,
  route_set_app_definition,
  route_validate_app_definition,
} from "utils/generatedEndpoints";
import { type AppDefinition } from "utils/generatedTypes";
import {
  parseDraftAppAssets,
  parseDraftAppSpec,
  parseDraftAppTheme,
  type AppThemeMode,
} from "./appDraftPreview";

type AppSpecPayload = Record<string, unknown>;

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

export function AppConfigPane() {
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const appSpec = useAppDefinition((state) => state.appSpec);
  const isPreviewEnabled = useAppPreview((state) => state.isPreviewEnabled);
  const previewConfigId = useAppPreview((state) => state.previewConfigId);
  const { projectMetadata } = useAllProjectMetadata((state) => state);
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
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
      const response = await route_get_app_definition({});
      setLoading(false);
      if (!res200(response)) {
        if (isMounted) {
          const detail = getErrorDetail(response.data);
          setErrorMessage(detail ?? "Failed to load app spec.");
        }
        return;
      }
      const nextSpec = response.data.appSpec ?? null;
      useAppDefinition.setState({
        appSpec: nextSpec,
        appDefinition: response.data.appDefinition ?? null,
      });
      if (!isMounted) {
        return;
      }
      setDraftSpec(nextSpec ? JSON.stringify(nextSpec, null, 2) : "");
      setCatalogId(
        response.data.appDefinition?.catalogId ?? DEFAULT_CATALOG_ID,
      );
      setSpecVersion(
        response.data.appDefinition?.appSpecVersion ?? DEFAULT_SPEC_VERSION,
      );
      setAppSpecPath(response.data.appDefinition?.appSpecPath ?? "");
      const theme = response.data.appDefinition?.theme ?? null;
      setDraftTheme(theme ? JSON.stringify(theme, null, 2) : "");
      setDraftAssets(
        JSON.stringify(response.data.appDefinition?.assets ?? [], null, 2),
      );
      setThemeMode(resolveThemeMode(theme));
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
      const response = await route_set_app_definition({
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
      if (!res200(response)) {
        const detail = getErrorDetail(response.data);
        setErrorMessage(detail ?? failureMessage);
        return false;
      }
      hydrateSavedAppDefinition({
        savedSpec: response.data.appSpec ?? null,
        savedDefinition: response.data.appDefinition ?? null,
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
    const response = await route_validate_app_definition({
      appSpec: specPayload.value,
      appSpecVersion: specVersion.trim() ? specVersion.trim() : undefined,
      catalogId: catalogId.trim() ? catalogId.trim() : undefined,
      theme: themePayload.value,
      assets: assetsPayload.value,
    });
    setValidating(false);
    if (!res200(response)) {
      const detail = getErrorDetail(response.data);
      setErrorMessage(detail ?? "Failed to validate app spec.");
      return;
    }
    setValidationResult(response.data);
    if (response.data.errors.length === 0) {
      addTemporaryNotification(
        response.data.warnings.length > 0
          ? `Validation passed with ${response.data.warnings.length} warning(s).`
          : "Validation passed.",
      );
    }
  }

  return (
    <section className="setta-pane-scroll flex min-h-0 flex-1 flex-col gap-4 pb-4 text-sm text-setta-600 dark:text-setta-300">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-2xl flex-col gap-1">
          <p className="text-xs text-setta-500 dark:text-setta-400">
            Advanced app-definition workbench for previewing, validating,
            saving, and editing the current app spec.
          </p>
          <p className="text-xs text-setta-500 dark:text-setta-400">
            Use Project Chat slash commands like <code>/app-json</code>,{" "}
            <code>/app-image</code>, <code>/app-prompt</code>, and{" "}
            <code>/app-mcp</code> to initiate generation.
          </p>
        </div>
        <button
          className="rounded-full border border-setta-200 px-3 py-1 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
          onClick={() =>
            useAppPreview.setState((state) => ({
              isPreviewEnabled: !state.isPreviewEnabled,
            }))
          }
          type="button"
        >
          {isPreviewEnabled ? "Hide Preview" : "Show Preview"}
        </button>
      </header>

      {errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200">
          {errorMessage}
        </div>
      ) : null}

      {validationResult ? (
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
          {validationResult.errors.length > 0 ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200">
              <div className="font-semibold">Errors</div>
              <ul className="mt-1 list-disc pl-4">
                {validationResult.errors.map((err, idx) => (
                  <li key={`${idx}-${err.message}`}>{err.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {validationResult.warnings.length > 0 ? (
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
          ) : null}
          <div className="text-[11px] text-setta-500 dark:text-setta-400">
            Capabilities: {validationResult.capabilities.catalogId}{" "}
            {validationResult.capabilities.catalogVersion
              ? `(${validationResult.capabilities.catalogVersion})`
              : ""}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between text-xs text-setta-500 dark:text-setta-400">
        <span>App Spec JSON</span>
        <div className="flex gap-2">
          <button
            className="rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            disabled={loading}
            onClick={handleCreateDefault}
            type="button"
          >
            Create Default
          </button>
          <button
            className="rounded-full border border-setta-200 px-3 py-1 text-[11px] font-semibold text-setta-600 transition-colors hover:bg-setta-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            disabled={loading || validating || !hasDraft}
            onClick={() => void handleValidate()}
            type="button"
          >
            {validating ? "Validating..." : "Validate"}
          </button>
          <button
            className="rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading || validating || !hasDraft}
            onClick={() => void handleSave()}
            type="button"
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
      {draftSpecError ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200"
        >
          {draftSpecError}
        </div>
      ) : null}

      <div className="rounded-lg border border-setta-200 bg-white/70 p-4 dark:border-setta-700 dark:bg-setta-900/60">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
              Advanced
            </span>
            <span className="text-[11px] text-setta-500 dark:text-setta-400">
              Theme, assets, preview targeting, and metadata.
            </span>
          </div>
          <button
            aria-expanded={showAdvanced}
            className="rounded-full border border-setta-200 px-3 py-1 text-xs font-semibold text-setta-600 transition-colors hover:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:hover:bg-setta-800"
            onClick={() => setShowAdvanced((current) => !current)}
            type="button"
          >
            Advanced
          </button>
        </div>

        {showAdvanced ? (
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid gap-3">
              <label
                className="flex flex-col gap-1 text-xs"
                data-setting-anchor="core.app.catalog_id"
              >
                Catalog ID
                <input
                  aria-label="Catalog ID"
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
                  aria-label="Spec version"
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
                  aria-label="Theme mode"
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
                  App deployments default to auto. Force dark or light here,
                  then republish.
                </span>
              </label>
              <label
                className="flex flex-col gap-1 text-xs"
                data-setting-anchor="core.app.spec_path"
              >
                Spec path
                <input
                  aria-label="Spec path"
                  className="rounded-md border border-setta-200 bg-white px-3 py-2 text-sm text-setta-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-200"
                  placeholder="app_specs/app.json"
                  value={appSpecPath}
                  onChange={(event) => setAppSpecPath(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Preview config
                <select
                  aria-label="Preview config"
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
              <div className="text-xs text-setta-500 dark:text-setta-400">
                <span>Theme JSON</span>
                <span className="ml-2 text-[11px]">
                  Advanced styling can be set via <code>vars</code> (keys must
                  start with <code>--app-</code>).
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
              {draftThemeError ? (
                <div
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200"
                >
                  {draftThemeError}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-xs text-setta-500 dark:text-setta-400">
                <span>Assets JSON</span>
                <span className="ml-2 text-[11px]">
                  Links are injected as <code>&lt;link&gt;</code> tags. External
                  URLs are gated by the deployment policy.
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
              {draftAssetsError ? (
                <div
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-700/70 dark:bg-red-900/40 dark:text-red-200"
                >
                  {draftAssetsError}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
