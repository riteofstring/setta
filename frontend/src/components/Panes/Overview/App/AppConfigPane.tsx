import * as Switch from "@radix-ui/react-switch";
import { useEffect, useMemo } from "react";
import {
  useAllProjectMetadata,
  useAppDefinition,
  useAppPreview,
  useLocalStorage,
  useProjectState,
} from "state/definitions";
import { shallow } from "zustand/shallow";
import { buildDefaultSpec } from "./appConfigDefinitionUtils";
import { type AppThemeMode } from "./appDraftPreview";
import {
  APP_GENERATION_MODE_OPTIONS,
  buildDefaultAppGenerationPrompt,
  coerceAppGenerationMode,
  isJsonRenderMode,
} from "./appGenerationModes";
import { useAppConfigDefinitionDrafts } from "./useAppConfigDefinitionDrafts";
import { useAppConfigGenerationController } from "./useAppConfigGenerationController";
import { useAppConfigPersistence } from "./useAppConfigPersistence";

const STREAMING_TOGGLE_ROOT_CLASSES =
  "nodrag relative inline-flex h-2.5 w-7 min-w-7 cursor-pointer items-center rounded-full p-[0.2rem] [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black focus-visible:ring-2 disabled:pointer-events-none bg-setta-400 data-[state='checked']:bg-blue-500 dark:bg-setta-600 dark:data-[state='checked']:bg-blue-700";
const STREAMING_TOGGLE_THUMB_CLASSES =
  "block h-2.5 w-2.5 rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4 bg-white dark:bg-setta-800";

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
  const { projectMetadata } = useAllProjectMetadata((x) => x);
  const {
    appSpecPath,
    catalogId,
    clearDraftErrors,
    draftAssets,
    draftAssetsError,
    draftSpec,
    draftSpecError,
    draftTheme,
    draftThemeError,
    hydrateSavedAppDefinition,
    setAppSpecPath,
    setCatalogId,
    setDraftAssets,
    setDraftSpec,
    setDraftTheme,
    setSpecVersion,
    setThemeMode,
    specVersion,
    themeMode,
  } = useAppConfigDefinitionDrafts();
  const {
    errorMessage,
    handleSave,
    handleValidate,
    loading,
    persistGeneratedSpec,
    setErrorMessage,
    validationResult,
    validating,
  } = useAppConfigPersistence({
    projectConfigId,
    appSpecPath,
    catalogId,
    clearDraftErrors,
    draftAssets,
    draftSpec,
    draftTheme,
    hydrateSavedAppDefinition,
    specVersion,
    themeMode,
  });
  const hasDraft = useMemo(() => draftSpec.trim().length > 0, [draftSpec]);
  const activeGenerationMode = coerceAppGenerationMode(appGenerationMode);
  const { generating, generationHint, generationPatchCount, handleGenerate } =
    useAppConfigGenerationController({
      activeGenerationMode,
      appGenerationPrompt,
      appGenerationReferenceImageNotes,
      appGenerationReferenceImageUrl,
      appSpec,
      catalogId,
      draftSpec,
      persistGeneratedSpec,
      projectConfigId,
      setCatalogId,
      setErrorMessage,
    });

  useEffect(() => {
    if (appGenerationMode === activeGenerationMode) {
      return;
    }
    useLocalStorage.setState({ appGenerationMode: activeGenerationMode });
  }, [activeGenerationMode, appGenerationMode]);

  function handleCreateDefault() {
    const spec = buildDefaultSpec();
    setDraftSpec(JSON.stringify(spec, null, 2));
    if (!appSpecPath) {
      setAppSpecPath("app_specs/app.json");
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
