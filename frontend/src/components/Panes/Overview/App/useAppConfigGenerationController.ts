import type { Spec } from "@json-render/core";
import { pickDefaultConfigId } from "components/Chat/llmConfigUtils";
import { useCallback, useEffect, useState } from "react";
import { resolveEngineConfigIdForChat } from "state/actions/ai/agentRuns";
import { submitMessage } from "state/actions/ai/chatCommands";
import { clearPendingChatDetails } from "state/actions/ai/chatRuntime";
import { addTemporaryNotification } from "state/actions/notifications";
import { useAIStore, useAppPreview } from "state/definitions";
import { applyPatchOp, parsePatchLine } from "utils/appSpecPatchStream";
import { C_ADDRESSES } from "utils/c_addresses";
import { RouteEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { buildSpecSeed, cloneSpecForPreview } from "./appConfigDefinitionUtils";
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
import {
  buildDefaultAppGenerationPrompt,
  buildHiddenChatAppGenerationPrompt,
  isJsonRenderMode,
  type AppGenerationMode,
} from "./appGenerationModes";

type HiddenChatGenerationMode = "prompt_builder" | "mcp_server";

export type UseAppConfigGenerationControllerArgs = {
  activeGenerationMode: AppGenerationMode;
  appGenerationPrompt: string;
  appGenerationReferenceImageNotes: string;
  appGenerationReferenceImageUrl: string;
  appSpec: unknown;
  catalogId: string;
  draftSpec: string;
  persistGeneratedSpec: (spec: Spec) => Promise<boolean>;
  projectConfigId: string;
  setCatalogId: (catalogId: string) => void;
  setErrorMessage: (errorMessage: string | null) => void;
};

export function useAppConfigGenerationController({
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
}: UseAppConfigGenerationControllerArgs) {
  const [generating, setGenerating] = useState(false);
  const [generationPatchCount, setGenerationPatchCount] = useState(0);
  const [generationHint, setGenerationHint] = useState<string | null>(null);
  const {
    engineConfigsInitialLoadComplete,
    allLLMConfigsInitialLoadComplete,
    apiKeysInitialLoadComplete,
    externalAgentHealthInitialLoadComplete,
  } = useAIStore(
    (state) => ({
      engineConfigsInitialLoadComplete: state.engineConfigsInitialLoadComplete,
      allLLMConfigsInitialLoadComplete: state.allLLMConfigsInitialLoadComplete,
      apiKeysInitialLoadComplete: state.apiKeysInitialLoadComplete,
      externalAgentHealthInitialLoadComplete:
        state.externalAgentHealthInitialLoadComplete,
    }),
    shallow,
  );

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
      setErrorMessage,
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
    [
      appGenerationPrompt,
      catalogId,
      projectConfigId,
      setCatalogId,
      setErrorMessage,
    ],
  );

  const handleGenerate = useCallback(async () => {
    if (isJsonRenderMode(activeGenerationMode)) {
      await runJsonRenderGeneration(activeGenerationMode);
      return;
    }
    if (
      activeGenerationMode === "prompt_builder" ||
      activeGenerationMode === "mcp_server"
    ) {
      await runHiddenChatGeneration({ mode: activeGenerationMode });
    }
  }, [activeGenerationMode, runHiddenChatGeneration, runJsonRenderGeneration]);

  return {
    generating,
    generationHint,
    generationPatchCount,
    handleGenerate,
  };
}
