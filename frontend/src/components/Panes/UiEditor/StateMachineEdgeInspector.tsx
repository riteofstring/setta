import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import { useEffect, useMemo, useState } from "react";
import {
  deleteSelectedStateMachineEdges,
  replaceStateMachineEdge,
} from "state/actions/stateMachineEdges";
import { useAIStore, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { ChatPermissionModeEnum, SectionTypeEnum } from "utils/generatedTypes";

type WorkflowEdge = ReturnType<
  typeof useProjectState.getState
>["projectConfig"]["stateMachineEdges"][number];
type WorkflowSourceFilterType = "run_completed" | "run_failed" | "signal";
type WorkflowTargetActionType = "send_prompt" | "reset_thread";
type WorkflowThreadStrategy =
  | "continue_current_thread"
  | "new_thread_before_send";

type WorkflowEdgeInspectorProps = {
  edgeId: string;
};

type WorkflowEdgeDetails = {
  edge: WorkflowEdge | null;
  sourceSectionName: string | null;
  targetSectionName: string | null;
  sourceType: SectionTypeEnum | null;
  targetType: SectionTypeEnum | null;
};

const SOURCE_FILTER_OPTIONS = [
  {
    group: "Chat Triggers",
    items: [
      { id: "run_completed", name: "Run Completed" },
      { id: "run_failed", name: "Run Failed" },
      { id: "signal", name: "Structured Signal" },
    ],
  },
];

const TARGET_ACTION_OPTIONS = [
  {
    group: "Chat Actions",
    items: [
      { id: "reset_thread", name: "Reset Thread" },
      { id: "send_prompt", name: "Send Prompt" },
    ],
  },
];

const THREAD_STRATEGY_OPTIONS = [
  {
    group: "Thread Strategy",
    items: [
      {
        id: "continue_current_thread",
        name: "Continue Current Thread",
      },
      {
        id: "new_thread_before_send",
        name: "New Thread Before Send",
      },
    ],
  },
];

const PERMISSION_MODE_OPTIONS = [
  {
    group: "Permissions",
    items: [
      { id: ChatPermissionModeEnum.minimal, name: "Minimal" },
      { id: ChatPermissionModeEnum.yolo, name: "Yolo" },
      {
        id: ChatPermissionModeEnum.config_toml_custom,
        name: "Config TOML Custom",
      },
    ],
  },
];

function cloneWorkflowEdge(edge: WorkflowEdge): WorkflowEdge {
  return {
    ...edge,
    sourceFilter: edge.sourceFilter ? { ...edge.sourceFilter } : null,
    targetAction: edge.targetAction ? { ...edge.targetAction } : null,
    style: edge.style ? { ...edge.style } : null,
  };
}

function getSectionTypeById(
  state: ReturnType<typeof useProjectState.getState>,
  sectionId: string,
): SectionTypeEnum | null {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    return null;
  }
  return impl.type ?? null;
}

function sanitizeWorkflowEdge(
  edge: WorkflowEdge,
  sourceType: SectionTypeEnum | null,
  targetType: SectionTypeEnum | null,
): WorkflowEdge {
  const nextEdge = cloneWorkflowEdge(edge);
  if (sourceType !== SectionTypeEnum.Chat) {
    nextEdge.sourceFilter = null;
  } else {
    const filterType = (nextEdge.sourceFilter?.type ??
      "run_completed") as WorkflowSourceFilterType;
    if (filterType === "signal") {
      nextEdge.sourceFilter = {
        type: "signal",
        signalName: nextEdge.sourceFilter?.signalName?.trim() || null,
        payloadField: nextEdge.sourceFilter?.payloadField?.trim() || null,
        equals: nextEdge.sourceFilter?.equals?.trim() || null,
      };
    } else {
      nextEdge.sourceFilter = {
        type: filterType,
        signalName: null,
        payloadField: null,
        equals: null,
      };
    }
  }

  if (targetType !== SectionTypeEnum.Chat) {
    nextEdge.targetAction = null;
    return nextEdge;
  }

  const actionType = (nextEdge.targetAction?.type ??
    "reset_thread") as WorkflowTargetActionType;
  const baseAction = {
    type: actionType,
    threadStrategy: (nextEdge.targetAction?.threadStrategy ??
      "continue_current_thread") as WorkflowThreadStrategy,
    stopIfRunning: nextEdge.targetAction?.stopIfRunning ?? false,
    engineConfigId: nextEdge.targetAction?.engineConfigId ?? null,
    agentProfileId: nextEdge.targetAction?.agentProfileId ?? null,
    permissionMode: nextEdge.targetAction?.permissionMode ?? null,
    searchEnabled: nextEdge.targetAction?.searchEnabled ?? null,
  };

  if (actionType === "reset_thread") {
    nextEdge.targetAction = {
      ...baseAction,
      type: "reset_thread",
      promptTemplateId: null,
      inlinePrompt: null,
    };
    return nextEdge;
  }

  nextEdge.targetAction = {
    ...baseAction,
    type: "send_prompt",
    promptTemplateId: nextEdge.targetAction?.promptTemplateId ?? null,
    inlinePrompt: nextEdge.targetAction?.inlinePrompt ?? null,
  };
  return nextEdge;
}

function getValidationError(
  edge: WorkflowEdge,
  sourceType: SectionTypeEnum | null,
  targetType: SectionTypeEnum | null,
): string | null {
  const sanitizedEdge = sanitizeWorkflowEdge(edge, sourceType, targetType);
  if (sourceType === SectionTypeEnum.Chat) {
    const sourceFilter = sanitizedEdge.sourceFilter;
    if (!sourceFilter) {
      return "Chat sources need a workflow trigger.";
    }
    if (sourceFilter.type === "signal" && !sourceFilter.signalName) {
      return "Signal triggers require a signal name.";
    }
    const hasPayloadField = Boolean(sourceFilter.payloadField);
    const hasEquals = Boolean(sourceFilter.equals);
    if (hasPayloadField !== hasEquals) {
      return "Signal payload matching requires both field and equals values.";
    }
  }

  if (targetType === SectionTypeEnum.Chat) {
    const targetAction = sanitizedEdge.targetAction;
    if (!targetAction) {
      return "Chat targets need a workflow action.";
    }
    if (targetAction.type === "send_prompt") {
      const hasTemplate = Boolean(targetAction.promptTemplateId);
      const hasInlinePrompt = Boolean(targetAction.inlinePrompt?.trim());
      if (hasTemplate === hasInlinePrompt) {
        return "Send Prompt requires exactly one prompt template or inline prompt.";
      }
    }
  }

  return null;
}

function getWorkflowEdgeDetails(
  state: ReturnType<typeof useProjectState.getState>,
  edgeId: string,
): WorkflowEdgeDetails {
  const edge =
    state.projectConfig.stateMachineEdges.find(
      (candidate) => candidate.id === edgeId,
    ) ?? null;
  if (!edge) {
    return {
      edge: null,
      sourceSectionName: null,
      targetSectionName: null,
      sourceType: null,
      targetType: null,
    };
  }
  return {
    edge,
    sourceSectionName:
      state.sections[edge.sourceSectionId]?.name ?? edge.sourceSectionId,
    targetSectionName:
      state.sections[edge.targetSectionId]?.name ?? edge.targetSectionId,
    sourceType: getSectionTypeById(state, edge.sourceSectionId),
    targetType: getSectionTypeById(state, edge.targetSectionId),
  };
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
  const [draftEdge, setDraftEdge] = useState<WorkflowEdge | null>(
    edgeDetails.edge ? cloneWorkflowEdge(edgeDetails.edge) : null,
  );

  useEffect(() => {
    setDraftEdge(edgeDetails.edge ? cloneWorkflowEdge(edgeDetails.edge) : null);
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
  );
  const validationError = getValidationError(
    draftEdge,
    edgeDetails.sourceType,
    edgeDetails.targetType,
  );
  const isDirty = !_.isEqual(sanitizedDraftEdge, edgeDetails.edge);
  const isDisabled = !canEditStructure;

  function updateDraft(updater: (current: WorkflowEdge) => WorkflowEdge): void {
    setDraftEdge((current) => {
      if (!current) {
        return current;
      }
      return updater(current);
    });
  }

  function applyChanges(): void {
    if (isDisabled || validationError || !isDirty) {
      return;
    }
    replaceStateMachineEdge(sanitizedDraftEdge);
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
        <section className="rounded-md border border-setta-200/70 p-3 dark:border-setta-700/70">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-setta-700 dark:text-setta-300">
            Trigger
          </p>
          <div className="mt-3 flex flex-col gap-3">
            <IdNameCombobox
              allItems={SOURCE_FILTER_OPTIONS}
              value={draftEdge.sourceFilter?.type ?? "run_completed"}
              inputDivId="workflow-edge-source-filter"
              onSelectedItemChange={(value) => {
                if (!value) {
                  return;
                }
                updateDraft((current) => ({
                  ...current,
                  sourceFilter:
                    value === "signal"
                      ? {
                          type: "signal",
                          signalName: current.sourceFilter?.signalName ?? null,
                          payloadField:
                            current.sourceFilter?.payloadField ?? null,
                          equals: current.sourceFilter?.equals ?? null,
                        }
                      : {
                          type: value as WorkflowSourceFilterType,
                          signalName: null,
                          payloadField: null,
                          equals: null,
                        },
                }));
              }}
              isDisabled={isDisabled}
              placeholder="Choose a chat trigger"
            />

            {draftEdge.sourceFilter?.type === "signal" ? (
              <>
                <label className="flex flex-col gap-1 text-xs text-setta-600 dark:text-setta-300">
                  Signal Name
                  <input
                    data-testid="workflow-edge-signal-name"
                    value={draftEdge.sourceFilter.signalName ?? ""}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        sourceFilter: {
                          type: "signal",
                          signalName: event.target.value,
                          payloadField:
                            current.sourceFilter?.payloadField ?? null,
                          equals: current.sourceFilter?.equals ?? null,
                        },
                      }))
                    }
                    disabled={isDisabled}
                    placeholder="merge_decision"
                    className="rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-setta-600 dark:text-setta-300">
                  Payload Field
                  <input
                    data-testid="workflow-edge-signal-payload-field"
                    value={draftEdge.sourceFilter.payloadField ?? ""}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        sourceFilter: {
                          type: "signal",
                          signalName: current.sourceFilter?.signalName ?? null,
                          payloadField: event.target.value,
                          equals: current.sourceFilter?.equals ?? null,
                        },
                      }))
                    }
                    disabled={isDisabled}
                    placeholder="decision"
                    className="rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-setta-600 dark:text-setta-300">
                  Equals
                  <input
                    data-testid="workflow-edge-signal-equals"
                    value={draftEdge.sourceFilter.equals ?? ""}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        sourceFilter: {
                          type: "signal",
                          signalName: current.sourceFilter?.signalName ?? null,
                          payloadField:
                            current.sourceFilter?.payloadField ?? null,
                          equals: event.target.value,
                        },
                      }))
                    }
                    disabled={isDisabled}
                    placeholder="retry"
                    className="rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                  />
                </label>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {edgeDetails.targetType === SectionTypeEnum.Chat ? (
        <section className="rounded-md border border-setta-200/70 p-3 dark:border-setta-700/70">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-setta-700 dark:text-setta-300">
            Action
          </p>
          <div className="mt-3 flex flex-col gap-3">
            <IdNameCombobox
              allItems={TARGET_ACTION_OPTIONS}
              value={draftEdge.targetAction?.type ?? "reset_thread"}
              inputDivId="workflow-edge-target-action"
              onSelectedItemChange={(value) => {
                if (!value) {
                  return;
                }
                updateDraft((current) => ({
                  ...current,
                  targetAction:
                    value === "send_prompt"
                      ? {
                          type: "send_prompt",
                          promptTemplateId:
                            current.targetAction?.type === "send_prompt"
                              ? current.targetAction.promptTemplateId
                              : null,
                          inlinePrompt:
                            current.targetAction?.type === "send_prompt"
                              ? current.targetAction.inlinePrompt
                              : null,
                          threadStrategy:
                            current.targetAction?.threadStrategy ??
                            "continue_current_thread",
                          stopIfRunning:
                            current.targetAction?.stopIfRunning ?? false,
                          engineConfigId:
                            current.targetAction?.engineConfigId ?? null,
                          agentProfileId:
                            current.targetAction?.agentProfileId ?? null,
                          permissionMode:
                            current.targetAction?.permissionMode ?? null,
                          searchEnabled:
                            current.targetAction?.searchEnabled ?? null,
                        }
                      : {
                          type: "reset_thread",
                          promptTemplateId: null,
                          inlinePrompt: null,
                          threadStrategy:
                            current.targetAction?.threadStrategy ??
                            "continue_current_thread",
                          stopIfRunning:
                            current.targetAction?.stopIfRunning ?? false,
                          engineConfigId:
                            current.targetAction?.engineConfigId ?? null,
                          agentProfileId:
                            current.targetAction?.agentProfileId ?? null,
                          permissionMode:
                            current.targetAction?.permissionMode ?? null,
                          searchEnabled:
                            current.targetAction?.searchEnabled ?? null,
                        },
                }));
              }}
              isDisabled={isDisabled}
              placeholder="Choose a chat action"
            />

            {draftEdge.targetAction?.type === "send_prompt" ? (
              <>
                <IdNameCombobox
                  allItems={promptTemplateOptions}
                  value={draftEdge.targetAction.promptTemplateId}
                  inputDivId="workflow-edge-prompt-template"
                  onSelectedItemChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      targetAction: {
                        ...(current.targetAction ?? {
                          type: "send_prompt",
                          threadStrategy: "continue_current_thread",
                          stopIfRunning: false,
                          engineConfigId: null,
                          agentProfileId: null,
                          permissionMode: null,
                          searchEnabled: null,
                        }),
                        type: "send_prompt",
                        promptTemplateId: value,
                        inlinePrompt: value
                          ? null
                          : current.targetAction?.inlinePrompt ?? null,
                      },
                    }))
                  }
                  isDisabled={isDisabled}
                  placeholder="Prompt template (optional)"
                  selectedItemCanBeNull
                />
                <label className="flex flex-col gap-1 text-xs text-setta-600 dark:text-setta-300">
                  Inline Prompt
                  <textarea
                    data-testid="workflow-edge-inline-prompt"
                    value={draftEdge.targetAction.inlinePrompt ?? ""}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        targetAction: {
                          ...(current.targetAction ?? {
                            type: "send_prompt",
                            threadStrategy: "continue_current_thread",
                            stopIfRunning: false,
                            engineConfigId: null,
                            agentProfileId: null,
                            permissionMode: null,
                            searchEnabled: null,
                          }),
                          type: "send_prompt",
                          inlinePrompt: event.target.value,
                          promptTemplateId: event.target.value.trim()
                            ? null
                            : current.targetAction?.promptTemplateId ?? null,
                        },
                      }))
                    }
                    disabled={isDisabled}
                    placeholder="Write the prompt this edge should send."
                    className="min-h-[110px] resize-y rounded border border-setta-300 bg-white px-2 py-2 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                  />
                </label>
                <IdNameCombobox
                  allItems={THREAD_STRATEGY_OPTIONS}
                  value={
                    draftEdge.targetAction.threadStrategy ??
                    "continue_current_thread"
                  }
                  inputDivId="workflow-edge-thread-strategy"
                  onSelectedItemChange={(value) => {
                    if (!value) {
                      return;
                    }
                    updateDraft((current) => ({
                      ...current,
                      targetAction: {
                        ...(current.targetAction ?? {
                          type: "send_prompt",
                          promptTemplateId: null,
                          inlinePrompt: null,
                          stopIfRunning: false,
                          engineConfigId: null,
                          agentProfileId: null,
                          permissionMode: null,
                          searchEnabled: null,
                        }),
                        type: "send_prompt",
                        threadStrategy: value as WorkflowThreadStrategy,
                      },
                    }));
                  }}
                  isDisabled={isDisabled}
                  placeholder="Thread strategy"
                />
                <IdNameCombobox
                  allItems={engineConfigOptions}
                  value={draftEdge.targetAction.engineConfigId}
                  inputDivId="workflow-edge-engine-config"
                  onSelectedItemChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      targetAction: {
                        ...(current.targetAction ?? {
                          type: "send_prompt",
                          promptTemplateId: null,
                          inlinePrompt: null,
                          threadStrategy: "continue_current_thread",
                          stopIfRunning: false,
                          agentProfileId: null,
                          permissionMode: null,
                          searchEnabled: null,
                        }),
                        type: "send_prompt",
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
                  value={draftEdge.targetAction.permissionMode}
                  inputDivId="workflow-edge-permission-mode"
                  onSelectedItemChange={(value) =>
                    updateDraft((current) => ({
                      ...current,
                      targetAction: {
                        ...(current.targetAction ?? {
                          type: "send_prompt",
                          promptTemplateId: null,
                          inlinePrompt: null,
                          threadStrategy: "continue_current_thread",
                          stopIfRunning: false,
                          engineConfigId: null,
                          agentProfileId: null,
                          searchEnabled: null,
                        }),
                        type: "send_prompt",
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
                    checked={Boolean(draftEdge.targetAction.searchEnabled)}
                    disabled={isDisabled}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        targetAction: {
                          ...(current.targetAction ?? {
                            type: "send_prompt",
                            promptTemplateId: null,
                            inlinePrompt: null,
                            threadStrategy: "continue_current_thread",
                            stopIfRunning: false,
                            engineConfigId: null,
                            agentProfileId: null,
                            permissionMode: null,
                          }),
                          type: "send_prompt",
                          searchEnabled: event.target.checked,
                        },
                      }))
                    }
                  />
                  Enable search
                </label>
              </>
            ) : (
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
                        ...(current.targetAction ?? {
                          type: "reset_thread",
                          promptTemplateId: null,
                          inlinePrompt: null,
                          threadStrategy: "continue_current_thread",
                          engineConfigId: null,
                          agentProfileId: null,
                          permissionMode: null,
                          searchEnabled: null,
                        }),
                        type: "reset_thread",
                        stopIfRunning: event.target.checked,
                        promptTemplateId: null,
                        inlinePrompt: null,
                      },
                    }))
                  }
                />
                Stop an active run before resetting the thread
              </label>
            )}
          </div>
        </section>
      ) : null}

      {validationError ? (
        <p
          data-testid="workflow-edge-validation-error"
          className="text-xs text-red-600 dark:text-red-400"
        >
          {validationError}
        </p>
      ) : null}

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
            onClick={() =>
              setDraftEdge(
                edgeDetails.edge ? cloneWorkflowEdge(edgeDetails.edge) : null,
              )
            }
            disabled={isDisabled || !isDirty}
            className="rounded border border-setta-200 px-3 py-1.5 text-xs font-medium text-setta-700 disabled:opacity-50 dark:border-setta-700 dark:text-setta-200"
          >
            Reset
          </button>
          <button
            type="button"
            data-testid="workflow-edge-apply"
            onClick={applyChanges}
            disabled={isDisabled || !isDirty || Boolean(validationError)}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </section>
  );
}
