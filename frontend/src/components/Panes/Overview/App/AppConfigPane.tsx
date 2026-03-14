import * as Switch from "@radix-ui/react-switch";
import { pickDefaultConfigId } from "components/Chat/llmConfigUtils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveEngineConfigIdForChat } from "state/actions/ai/agentRuns";
import { submitMessage } from "state/actions/ai/chatCommands";
import { clearPendingChatDetails } from "state/actions/ai/chatRuntime";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  useAIStore,
  useAllProjectMetadata,
  useAppDefinition,
  useAppPreview,
  useLocalStorage,
  useProjectState,
} from "state/definitions";
import { applyPatchOp, parsePatchLine } from "utils/appSpecPatchStream";
import { C_ADDRESSES } from "utils/c_addresses";
import { RouteEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  buildDefaultSpec,
  buildSpecSeed,
  cloneSpecForPreview,
} from "./appConfigDefinitionUtils";
import {
  buildAvailableHiddenGenerationLLMConfigIds,
  buildExternalAgentHealthByConfigId,
  ensureAppConfigHiddenGenerationResources,
  prepareAppConfigPromptContext,
} from "./appConfigGenerationSupport";
import {
  resolveGenerationFailureMessage,
  resolveHiddenGenerationEngineSelection,
  resolveHiddenGenerationErrorMessage,
} from "./appConfigHiddenGenerationUtils";
import { type AppThemeMode } from "./appDraftPreview";
import {
  APP_GENERATION_MODE_OPTIONS,
  buildDefaultAppGenerationPrompt,
  buildHiddenChatAppGenerationPrompt,
  coerceAppGenerationMode,
  isJsonRenderMode,
  type AppGenerationMode,
} from "./appGenerationModes";
import { useAppConfigDefinitionDrafts } from "./useAppConfigDefinitionDrafts";
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
  const [generating, setGenerating] = useState(false);
  const [generationPatchCount, setGenerationPatchCount] = useState(0);
  const [generationHint, setGenerationHint] = useState<string | null>(null);
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
    void ensureAppConfigHiddenGenerationResources({
      allLLMConfigsInitialLoadComplete,
      apiKeysInitialLoadComplete,
      engineConfigsInitialLoadComplete,
      externalAgentHealthInitialLoadComplete,
    });
  }, [
    activeGenerationMode,
    allLLMConfigsInitialLoadComplete,
    apiKeysInitialLoadComplete,
    engineConfigsInitialLoadComplete,
    externalAgentHealthInitialLoadComplete,
  ]);

  type HiddenChatGenerationMode = "prompt_builder" | "mcp_server";

  const runJsonRenderGeneration = useCallback(
    async (mode: AppGenerationMode) => {
      setGenerating(true);
      setGenerationPatchCount(0);
      setGenerationHint(null);
      setErrorMessage(null);
      try {
        const { catalogSummary, sectionsSummary } =
          await prepareAppConfigPromptContext({
            catalogId,
            setCatalogId,
          });
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
      catalogId,
      draftSpec,
      persistGeneratedSpec,
      setCatalogId,
    ],
  );

  const runHiddenChatGeneration = useCallback(
    async ({ mode }: { mode: HiddenChatGenerationMode }) => {
      setGenerating(true);
      setGenerationPatchCount(0);
      setErrorMessage(null);
      setGenerationHint(null);
      try {
        await ensureAppConfigHiddenGenerationResources();
        const aiState = useAIStore.getState();
        const { catalogSummary, sectionsSummary } =
          await prepareAppConfigPromptContext({
            catalogId,
            setCatalogId,
          });
        const activeChatId = aiState.activeChatId ?? null;
        const activeChatEngineConfigId = activeChatId
          ? await resolveEngineConfigIdForChat(activeChatId, null)
          : null;
        const engineSelection = resolveHiddenGenerationEngineSelection({
          activeChatEngineConfigId,
          engineConfigs: aiState.engineConfigs,
          availableLLMConfigIds:
            buildAvailableHiddenGenerationLLMConfigIds(aiState),
          externalAgentHealthByConfigId:
            buildExternalAgentHealthByConfigId(aiState),
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
    [appGenerationPrompt, catalogId, setCatalogId],
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
