import { getErrorDetail, res200 } from "@setta/app-subsystem-frontend-sdk";

import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";

import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";

import _ from "lodash";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import {
  deleteSelectedStateMachineEdges,
  replaceStateMachineEdge,
} from "state/actions/stateMachineEdges";

import { useAIStore, useProjectState } from "state/definitions";

import { useShareCapabilities } from "state/hooks/share";

import { SectionTypeEnum, StateMachineUIConfig } from "utils/generatedTypes";

import {
  PERMISSION_MODE_OPTIONS,
  PROMPT_SOURCE_OPTIONS,
  SEND_PROMPT_ACTION_TYPE,
  TARGET_ACTION_OPTIONS,
  THREAD_STRATEGY_OPTIONS,
  WorkflowActionSectionProps,
  WorkflowConditionSection,
  WorkflowEdge,
  WorkflowEdgeInspectorProps,
  WorkflowEdgeUpdater,
  WorkflowFooterProps,
  WorkflowPromptSourceSpecificFields,
  WorkflowPromptSourceType,
  WorkflowTargetActionType,
  WorkflowThreadStrategy,
  WorkflowTriggerSection,
  WorkflowTriggerSectionProps,
  buildPromptSourceTargetAction,
  buildWorkflowDraftState,
  createResetThreadAction,
  createSendPromptAction,
  formatPromptInputsText,
  getPromptSectionOptions,
  getWorkflowEdgeDetails,
  sanitizeWorkflowEdge,
} from "./promptFields";

function WorkflowSendPromptFields({
  draftEdge,
  isDisabled,
  updateDraft,
  promptSourceType,
  setPromptSourceType,
  promptTemplateOptions,
  promptSectionOptions,
  engineConfigOptions,
  promptInputsText,
  handlePromptInputsChange,
  resetPromptInputs,
}: WorkflowActionSectionProps) {
  return (
    <>
      <IdNameCombobox
        allItems={PROMPT_SOURCE_OPTIONS}
        value={promptSourceType}
        inputDivId="workflow-edge-prompt-source"
        onSelectedItemChange={(value) => {
          if (!value) {
            return;
          }
          const nextPromptSourceType = value as WorkflowPromptSourceType;
          setPromptSourceType(nextPromptSourceType);
          updateDraft((current) => ({
            ...current,
            targetAction: buildPromptSourceTargetAction(
              createSendPromptAction(current.targetAction),
              nextPromptSourceType,
            ),
          }));
          if (
            nextPromptSourceType ===
            StateMachineUIConfig.promptSourceTypes.inline
          ) {
            resetPromptInputs();
          }
        }}
        isDisabled={isDisabled}
        placeholder="Prompt source"
      />

      <WorkflowPromptSourceSpecificFields
        draftEdge={draftEdge}
        isDisabled={isDisabled}
        updateDraft={updateDraft}
        promptSourceType={promptSourceType}
        promptTemplateOptions={promptTemplateOptions}
        promptSectionOptions={promptSectionOptions}
        promptInputsText={promptInputsText}
        handlePromptInputsChange={handlePromptInputsChange}
      />

      <IdNameCombobox
        allItems={THREAD_STRATEGY_OPTIONS}
        value={
          draftEdge.targetAction?.threadStrategy ??
          (StateMachineUIConfig.defaultThreadStrategy as WorkflowThreadStrategy)
        }
        inputDivId="workflow-edge-thread-strategy"
        onSelectedItemChange={(value) => {
          if (!value) {
            return;
          }
          updateDraft((current) => ({
            ...current,
            targetAction: {
              ...createSendPromptAction(current.targetAction),
              threadStrategy: value as WorkflowThreadStrategy,
            },
          }));
        }}
        isDisabled={isDisabled}
        placeholder="Thread strategy"
      />
      <IdNameCombobox
        allItems={engineConfigOptions}
        value={draftEdge.targetAction?.engineConfigId ?? null}
        inputDivId="workflow-edge-engine-config"
        onSelectedItemChange={(value) =>
          updateDraft((current) => ({
            ...current,
            targetAction: {
              ...createSendPromptAction(current.targetAction),
              engineConfigId: value,
            },
          }))
        }
        isDisabled={isDisabled}
        placeholder="Engine config (optional)"
        selectedItemCanBeNull
      />
      <IdNameCombobox
        allItems={PERMISSION_MODE_OPTIONS}
        value={draftEdge.targetAction?.permissionMode ?? null}
        inputDivId="workflow-edge-permission-mode"
        onSelectedItemChange={(value) =>
          updateDraft((current) => ({
            ...current,
            targetAction: {
              ...createSendPromptAction(current.targetAction),
              permissionMode: value,
            },
          }))
        }
        isDisabled={isDisabled}
        placeholder="Permission mode (optional)"
        selectedItemCanBeNull
      />
      <label className="flex items-center gap-2 text-xs text-setta-600 dark:text-setta-300">
        <input
          data-testid="workflow-edge-search-enabled"
          type="checkbox"
          checked={Boolean(draftEdge.targetAction?.searchEnabled)}
          disabled={isDisabled}
          onChange={(event) =>
            updateDraft((current) => ({
              ...current,
              targetAction: {
                ...createSendPromptAction(current.targetAction),
                searchEnabled: event.target.checked,
              },
            }))
          }
        />
        Enable search
      </label>
    </>
  );
}

function WorkflowResetThreadFields({
  draftEdge,
  isDisabled,
  updateDraft,
}: WorkflowTriggerSectionProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-setta-600 dark:text-setta-300">
      <input
        data-testid="workflow-edge-stop-if-running"
        type="checkbox"
        checked={draftEdge.targetAction?.stopIfRunning ?? false}
        disabled={isDisabled}
        onChange={(event) =>
          updateDraft((current) => ({
            ...current,
            targetAction: {
              ...createResetThreadAction(current.targetAction),
              stopIfRunning: event.target.checked,
            },
          }))
        }
      />
      Stop an active run before resetting the thread
    </label>
  );
}

function WorkflowActionSection({
  draftEdge,
  isDisabled,
  updateDraft,
  promptSourceType,
  setPromptSourceType,
  promptTemplateOptions,
  promptSectionOptions,
  engineConfigOptions,
  promptInputsText,
  handlePromptInputsChange,
  resetPromptInputs,
}: WorkflowActionSectionProps) {
  return (
    <section className="rounded-md border border-setta-200/70 p-3 dark:border-setta-700/70">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-setta-700 dark:text-setta-300">
        Action
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <IdNameCombobox
          allItems={TARGET_ACTION_OPTIONS}
          value={
            draftEdge.targetAction?.type ??
            (StateMachineUIConfig.defaultTargetActionType as WorkflowTargetActionType)
          }
          inputDivId="workflow-edge-target-action"
          onSelectedItemChange={(value) => {
            if (!value) {
              return;
            }
            const nextActionType = value as WorkflowTargetActionType;
            updateDraft((current) => ({
              ...current,
              targetAction:
                nextActionType === SEND_PROMPT_ACTION_TYPE
                  ? createSendPromptAction(current.targetAction)
                  : createResetThreadAction(current.targetAction),
            }));
            if (
              nextActionType ===
              (StateMachineUIConfig.defaultTargetActionType as WorkflowTargetActionType)
            ) {
              resetPromptInputs();
            }
          }}
          isDisabled={isDisabled}
          placeholder="Choose a chat action"
        />

        {draftEdge.targetAction?.type === SEND_PROMPT_ACTION_TYPE ? (
          <WorkflowSendPromptFields
            draftEdge={draftEdge}
            isDisabled={isDisabled}
            updateDraft={updateDraft}
            promptSourceType={promptSourceType}
            setPromptSourceType={setPromptSourceType}
            promptTemplateOptions={promptTemplateOptions}
            promptSectionOptions={promptSectionOptions}
            engineConfigOptions={engineConfigOptions}
            promptInputsText={promptInputsText}
            handlePromptInputsChange={handlePromptInputsChange}
            resetPromptInputs={resetPromptInputs}
          />
        ) : (
          <WorkflowResetThreadFields
            draftEdge={draftEdge}
            isDisabled={isDisabled}
            updateDraft={updateDraft}
          />
        )}
      </div>
    </section>
  );
}

function WorkflowEdgeFooter({
  isDisabled,
  isDirty,
  promptInputsError,
  applyChanges,
  onReset,
}: WorkflowFooterProps) {
  return (
    <div className="mt-auto flex items-center justify-between gap-2">
      <button
        type="button"
        data-testid="workflow-edge-delete"
        onClick={() => deleteSelectedStateMachineEdges()}
        disabled={isDisabled}
        className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300"
      >
        Delete Edge
      </button>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={isDisabled || !isDirty}
          className="rounded border border-setta-200 px-3 py-1.5 text-xs font-medium text-setta-700 disabled:opacity-50 dark:border-setta-700 dark:text-setta-200"
        >
          Reset
        </button>
        <button
          type="button"
          data-testid="workflow-edge-apply"
          onClick={() => {
            void applyChanges();
          }}
          disabled={isDisabled || !isDirty || Boolean(promptInputsError)}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Apply Changes
        </button>
      </div>
    </div>
  );
}

export function StateMachineEdgeInspector({
  edgeId,
}: WorkflowEdgeInspectorProps) {
  useHydrateAgenticState();
  const { canEditStructure } = useShareCapabilities();
  const edgeDetails = useProjectState(
    (state) => getWorkflowEdgeDetails(state, edgeId),
    _.isEqual,
  );
  const { promptTemplates, engineConfigs } = useAIStore(
    (state) => ({
      promptTemplates: state.promptTemplates,
      engineConfigs: state.engineConfigs,
    }),
    _.isEqual,
  );
  const promptSectionOptions = useProjectState(
    (state) => getPromptSectionOptions(state),
    _.isEqual,
  );
  const initialDraftState = buildWorkflowDraftState(edgeDetails.edge);
  const [draftEdge, setDraftEdge] = useState<WorkflowEdge | null>(
    initialDraftState.draftEdge,
  );
  const [promptSourceType, setPromptSourceType] =
    useState<WorkflowPromptSourceType>(initialDraftState.promptSourceType);
  const [promptInputsText, setPromptInputsText] = useState(
    initialDraftState.promptInputsText,
  );
  const [promptInputsError, setPromptInputsError] = useState<string | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  function resetPromptInputs(promptInputs: Record<string, string> = {}): void {
    setPromptInputsText(formatPromptInputsText(promptInputs));
    setPromptInputsError(null);
  }

  function resetDraftState(): void {
    const nextDraftState = buildWorkflowDraftState(edgeDetails.edge);
    setDraftEdge(nextDraftState.draftEdge);
    setPromptSourceType(nextDraftState.promptSourceType);
    setPromptInputsText(nextDraftState.promptInputsText);
    setPromptInputsError(null);
    setSaveError(null);
  }

  useEffect(() => {
    const nextDraftState = buildWorkflowDraftState(edgeDetails.edge);
    setDraftEdge(nextDraftState.draftEdge);
    setPromptSourceType(nextDraftState.promptSourceType);
    setPromptInputsText(nextDraftState.promptInputsText);
    setPromptInputsError(null);
    setSaveError(null);
  }, [edgeDetails.edge]);

  const promptTemplateOptions = useMemo(
    () => [
      {
        group: "Prompt Templates",
        items: promptTemplates.map((template) => ({
          id: template.id,
          name: template.name || template.id,
        })),
      },
    ],
    [promptTemplates],
  );
  const engineConfigOptions = useMemo(
    () => [
      {
        group: "Engine Configs",
        items: engineConfigs.map((config) => ({
          id: config.id,
          name: config.name || config.id,
        })),
      },
    ],
    [engineConfigs],
  );

  if (!edgeDetails.edge || !draftEdge) {
    return (
      <aside className="mx-auto grid h-full min-h-0 w-[calc(100%_-_1rem)]">
        <div className="place-self-center text-sm text-setta-500 dark:text-setta-400">
          Select a workflow edge to edit.
        </div>
      </aside>
    );
  }

  const sanitizedDraftEdge = sanitizeWorkflowEdge(
    draftEdge,
    edgeDetails.sourceType,
    edgeDetails.targetType,
    promptSourceType,
  );
  const inlineError = promptInputsError ?? saveError;
  const isDirty = !_.isEqual(sanitizedDraftEdge, edgeDetails.edge);
  const isDisabled = !canEditStructure;

  function updateDraft(updater: WorkflowEdgeUpdater): void {
    setSaveError(null);
    setDraftEdge((current) => {
      if (!current) {
        return current;
      }
      return updater(current);
    });
  }

  function handlePromptInputsChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const nextText = event.target.value;
    setPromptInputsText(nextText);
    setSaveError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(nextText);
    } catch {
      setPromptInputsError("Prompt bindings must be valid JSON.");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setPromptInputsError("Prompt bindings must be a JSON object.");
      return;
    }
    const nextPromptInputs: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof value !== "string") {
        setPromptInputsError("Prompt binding values must be strings.");
        return;
      }
      nextPromptInputs[key] = value;
    }
    setPromptInputsError(null);
    updateDraft((current) => ({
      ...current,
      targetAction:
        current.targetAction?.type === SEND_PROMPT_ACTION_TYPE
          ? {
              ...current.targetAction,
              promptInputs: nextPromptInputs,
            }
          : current.targetAction,
    }));
  }

  async function applyChanges(): Promise<void> {
    if (isDisabled || promptInputsError || !isDirty) {
      return;
    }
    setSaveError(null);
    const response = await replaceStateMachineEdge(sanitizedDraftEdge);
    if (!response) {
      return;
    }
    if (res200(response)) {
      setSaveError(null);
      return;
    }
    setSaveError(
      getErrorDetail(response.data) ?? "Failed to update workflow edge.",
    );
  }

  return (
    <section
      data-testid="workflow-edge-inspector"
      className="setta-pane-scroll flex min-h-0 flex-1 flex-col gap-3 pb-4"
    >
      <div className="rounded-md border border-setta-200/70 bg-white/70 p-3 dark:border-setta-700/70 dark:bg-setta-900/60">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-setta-500 dark:text-setta-400">
          Workflow Edge
        </p>
        <p className="mt-2 text-sm font-semibold text-setta-800 dark:text-setta-100">
          {edgeDetails.sourceSectionName} to {edgeDetails.targetSectionName}
        </p>
        <p className="mt-1 text-xs text-setta-500 dark:text-setta-400">
          Machine group: {edgeDetails.edge.machineGroupId}
        </p>
      </div>

      {edgeDetails.sourceType === SectionTypeEnum.Chat ? (
        <WorkflowTriggerSection
          draftEdge={draftEdge}
          isDisabled={isDisabled}
          updateDraft={updateDraft}
        />
      ) : null}

      <WorkflowConditionSection
        draftEdge={draftEdge}
        isDisabled={isDisabled}
        updateDraft={updateDraft}
      />

      {edgeDetails.targetType === SectionTypeEnum.Chat ? (
        <WorkflowActionSection
          draftEdge={draftEdge}
          isDisabled={isDisabled}
          updateDraft={updateDraft}
          promptSourceType={promptSourceType}
          setPromptSourceType={setPromptSourceType}
          promptTemplateOptions={promptTemplateOptions}
          promptSectionOptions={promptSectionOptions}
          engineConfigOptions={engineConfigOptions}
          promptInputsText={promptInputsText}
          handlePromptInputsChange={handlePromptInputsChange}
          resetPromptInputs={resetPromptInputs}
        />
      ) : null}

      {inlineError ? (
        <p
          data-testid="workflow-edge-validation-error"
          className="text-xs text-red-600 dark:text-red-400"
        >
          {inlineError}
        </p>
      ) : null}

      <WorkflowEdgeFooter
        isDisabled={isDisabled}
        isDirty={isDirty}
        promptInputsError={promptInputsError}
        applyChanges={applyChanges}
        onReset={resetDraftState}
      />
    </section>
  );
}
