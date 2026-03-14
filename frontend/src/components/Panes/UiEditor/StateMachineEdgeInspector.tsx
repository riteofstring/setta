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
import {
  ChatPermissionModeEnum,
  SectionTypeEnum,
  StateMachineCountOperatorEnum,
  type StateMachineCountOperator,
} from "utils/generatedTypes";

type WorkflowEdge = ReturnType<
  typeof useProjectState.getState
>["projectConfig"]["stateMachineEdges"][number];
type WorkflowTargetAction = NonNullable<WorkflowEdge["targetAction"]>;
type WorkflowSourceFilterType = "run_completed" | "run_failed" | "signal";
type WorkflowTargetActionType = "send_prompt" | "reset_thread";
type WorkflowThreadStrategy =
  | "continue_current_thread"
  | "new_thread_before_send";
type WorkflowCountOperator = StateMachineCountOperator;
type WorkflowPromptSourceType =
  | "inline_prompt"
  | "prompt_template"
  | "prompt_section";

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

const PROMPT_SOURCE_OPTIONS = [
  {
    group: "Prompt Source",
    items: [
      { id: "inline_prompt", name: "Inline Prompt" },
      { id: "prompt_template", name: "Prompt Template" },
      { id: "prompt_section", name: "Prompt Section" },
    ],
  },
];

const PROMPT_INPUTS_PLACEHOLDER = '{\n  "name": "Kevin"\n}';

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

const SOURCE_ACTIVATION_COUNT_OPERATOR_OPTIONS = [
  {
    group: "Count Operators",
    items: [
      { id: StateMachineCountOperatorEnum.lt, name: "<" },
      { id: StateMachineCountOperatorEnum.lte, name: "<=" },
      { id: StateMachineCountOperatorEnum.eq, name: "=" },
      { id: StateMachineCountOperatorEnum.gte, name: ">=" },
      { id: StateMachineCountOperatorEnum.gt, name: ">" },
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
    sourceActivationCountCondition: edge.sourceActivationCountCondition
      ? { ...edge.sourceActivationCountCondition }
      : null,
    targetAction: edge.targetAction
      ? {
          ...edge.targetAction,
          promptInputs: { ...(edge.targetAction.promptInputs ?? {}) },
        }
      : null,
    style: edge.style ? { ...edge.style } : null,
  };
}

function createSendPromptAction(
  currentAction: WorkflowEdge["targetAction"],
): WorkflowTargetAction {
  return {
    type: "send_prompt",
    promptTemplateId:
      currentAction?.type === "send_prompt"
        ? currentAction.promptTemplateId ?? null
        : null,
    promptSectionId:
      currentAction?.type === "send_prompt"
        ? currentAction.promptSectionId ?? null
        : null,
    inlinePrompt:
      currentAction?.type === "send_prompt"
        ? currentAction.inlinePrompt ?? null
        : null,
    promptInputs:
      currentAction?.type === "send_prompt"
        ? { ...(currentAction.promptInputs ?? {}) }
        : {},
    threadStrategy: currentAction?.threadStrategy ?? "continue_current_thread",
    stopIfRunning: currentAction?.stopIfRunning ?? false,
    engineConfigId: currentAction?.engineConfigId ?? null,
    agentProfileId: currentAction?.agentProfileId ?? null,
    permissionMode: currentAction?.permissionMode ?? null,
    searchEnabled: currentAction?.searchEnabled ?? null,
  };
}

function createResetThreadAction(
  currentAction: WorkflowEdge["targetAction"],
): WorkflowTargetAction {
  return {
    type: "reset_thread",
    promptTemplateId: null,
    promptSectionId: null,
    inlinePrompt: null,
    promptInputs: {},
    threadStrategy: currentAction?.threadStrategy ?? "continue_current_thread",
    stopIfRunning: currentAction?.stopIfRunning ?? false,
    engineConfigId: currentAction?.engineConfigId ?? null,
    agentProfileId: currentAction?.agentProfileId ?? null,
    permissionMode: currentAction?.permissionMode ?? null,
    searchEnabled: currentAction?.searchEnabled ?? null,
  };
}

function getInitialPromptSourceType(
  edge: WorkflowEdge | null,
): WorkflowPromptSourceType {
  const targetAction = edge?.targetAction;
  if (targetAction?.type !== "send_prompt") {
    return "inline_prompt";
  }
  if (targetAction.promptSectionId) {
    return "prompt_section";
  }
  if (targetAction.promptTemplateId) {
    return "prompt_template";
  }
  return "inline_prompt";
}

function formatPromptInputsText(promptInputs: Record<string, string>): string {
  return JSON.stringify(promptInputs, null, 2);
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

function getPromptSectionOptions(
  state: ReturnType<typeof useProjectState.getState>,
) {
  return [
    {
      group: "Prompt Sections",
      items: Object.keys(state.projectConfig.sectionVariantMap)
        .filter(
          (sectionId) =>
            getSectionTypeById(state, sectionId) === SectionTypeEnum.Prompt,
        )
        .map((sectionId) => ({
          id: sectionId,
          name: state.sections[sectionId]?.name ?? sectionId,
        })),
    },
  ];
}

function sanitizeWorkflowEdge(
  edge: WorkflowEdge,
  sourceType: SectionTypeEnum | null,
  targetType: SectionTypeEnum | null,
  promptSourceType: WorkflowPromptSourceType,
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

  if (actionType === "reset_thread") {
    nextEdge.targetAction = createResetThreadAction(nextEdge.targetAction);
    return nextEdge;
  }

  const sendPromptAction = createSendPromptAction(nextEdge.targetAction);
  if (promptSourceType === "prompt_template") {
    nextEdge.targetAction = {
      ...sendPromptAction,
      promptTemplateId: sendPromptAction.promptTemplateId ?? null,
      promptSectionId: null,
      inlinePrompt: null,
    };
    return nextEdge;
  }
  if (promptSourceType === "prompt_section") {
    nextEdge.targetAction = {
      ...sendPromptAction,
      promptTemplateId: null,
      promptSectionId: sendPromptAction.promptSectionId ?? null,
      inlinePrompt: null,
    };
    return nextEdge;
  }
  nextEdge.targetAction = {
    ...sendPromptAction,
    promptTemplateId: null,
    promptSectionId: null,
    inlinePrompt: sendPromptAction.inlinePrompt ?? null,
    promptInputs: {},
  };
  return nextEdge;
}

function getValidationError(
  edge: WorkflowEdge,
  sourceType: SectionTypeEnum | null,
  targetType: SectionTypeEnum | null,
  promptSourceType: WorkflowPromptSourceType,
  promptInputsError: string | null,
): string | null {
  if (promptInputsError) {
    return promptInputsError;
  }
  const sanitizedEdge = sanitizeWorkflowEdge(
    edge,
    sourceType,
    targetType,
    promptSourceType,
  );
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
      const configuredSourceCount = [
        Boolean(targetAction.promptTemplateId),
        Boolean(targetAction.promptSectionId),
        Boolean(targetAction.inlinePrompt?.trim()),
      ].filter(Boolean).length;
      if (configuredSourceCount > 1) {
        return "Send Prompt requires exactly one prompt template, prompt section, or inline prompt.";
      }
      if (promptSourceType === "prompt_template") {
        if (!targetAction.promptTemplateId) {
          return "Select a prompt template.";
        }
        return null;
      }
      if (promptSourceType === "prompt_section") {
        if (!targetAction.promptSectionId) {
          return "Select a prompt section.";
        }
        return null;
      }
      const hasTemplate = Boolean(targetAction.promptTemplateId);
      const hasPromptSection = Boolean(targetAction.promptSectionId);
      const hasInlinePrompt = Boolean(targetAction.inlinePrompt?.trim());
      if (
        [hasTemplate, hasPromptSection, hasInlinePrompt].filter(Boolean)
          .length !== 1
      ) {
        return "Send Prompt requires exactly one prompt template, prompt section, or inline prompt.";
      }
    }
  }

  if (
    sanitizedEdge.sourceActivationCountCondition &&
    (!Number.isInteger(sanitizedEdge.sourceActivationCountCondition.value) ||
      sanitizedEdge.sourceActivationCountCondition.value < 0)
  ) {
    return "Source activation count conditions require a non-negative integer value.";
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
  const promptSectionOptions = useProjectState(
    (state) => getPromptSectionOptions(state),
    _.isEqual,
  );
  const [draftEdge, setDraftEdge] = useState<WorkflowEdge | null>(
    edgeDetails.edge ? cloneWorkflowEdge(edgeDetails.edge) : null,
  );
  const [promptSourceType, setPromptSourceType] =
    useState<WorkflowPromptSourceType>(
      getInitialPromptSourceType(edgeDetails.edge),
    );
  const [promptInputsText, setPromptInputsText] = useState(
    formatPromptInputsText(edgeDetails.edge?.targetAction?.promptInputs ?? {}),
  );
  const [promptInputsError, setPromptInputsError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setDraftEdge(edgeDetails.edge ? cloneWorkflowEdge(edgeDetails.edge) : null);
    setPromptSourceType(getInitialPromptSourceType(edgeDetails.edge));
    setPromptInputsText(
      formatPromptInputsText(
        edgeDetails.edge?.targetAction?.promptInputs ?? {},
      ),
    );
    setPromptInputsError(null);
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
  const validationError = getValidationError(
    draftEdge,
    edgeDetails.sourceType,
    edgeDetails.targetType,
    promptSourceType,
    promptInputsError,
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

  function handlePromptInputsChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const nextText = event.target.value;
    setPromptInputsText(nextText);
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
        current.targetAction?.type === "send_prompt"
          ? {
              ...current.targetAction,
              promptInputs: nextPromptInputs,
            }
          : current.targetAction,
    }));
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

      <section className="rounded-md border border-setta-200/70 p-3 dark:border-setta-700/70">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-setta-700 dark:text-setta-300">
          Condition
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex items-center gap-2 text-xs text-setta-600 dark:text-setta-300">
            <input
              data-testid="workflow-edge-enable-source-activation-condition"
              type="checkbox"
              checked={draftEdge.sourceActivationCountCondition !== null}
              disabled={isDisabled}
              onChange={(event) =>
                updateDraft((current) => ({
                  ...current,
                  sourceActivationCountCondition: event.target.checked
                    ? {
                        operator: StateMachineCountOperatorEnum.eq,
                        value: 0,
                      }
                    : null,
                }))
              }
            />
            Limit this edge by source activation count (0-indexed)
          </label>

          {draftEdge.sourceActivationCountCondition ? (
            <div className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] gap-3">
              <IdNameCombobox
                allItems={SOURCE_ACTIVATION_COUNT_OPERATOR_OPTIONS}
                value={draftEdge.sourceActivationCountCondition.operator}
                inputDivId="workflow-edge-source-activation-operator"
                onSelectedItemChange={(value) => {
                  if (!value) {
                    return;
                  }
                  updateDraft((current) => ({
                    ...current,
                    sourceActivationCountCondition:
                      current.sourceActivationCountCondition
                        ? {
                            ...current.sourceActivationCountCondition,
                            operator: value as WorkflowCountOperator,
                          }
                        : {
                            operator: value as WorkflowCountOperator,
                            value: 0,
                          },
                  }));
                }}
                isDisabled={isDisabled}
                placeholder="Operator"
              />
              <label className="flex flex-col gap-1 text-xs text-setta-600 dark:text-setta-300">
                Source Count
                <input
                  data-testid="workflow-edge-source-activation-value"
                  type="number"
                  min={0}
                  step={1}
                  value={draftEdge.sourceActivationCountCondition.value}
                  disabled={isDisabled}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    updateDraft((current) => ({
                      ...current,
                      sourceActivationCountCondition:
                        current.sourceActivationCountCondition
                          ? {
                              ...current.sourceActivationCountCondition,
                              value:
                                Number.isInteger(parsed) && parsed >= 0
                                  ? parsed
                                  : 0,
                            }
                          : {
                              operator: StateMachineCountOperatorEnum.eq,
                              value:
                                Number.isInteger(parsed) && parsed >= 0
                                  ? parsed
                                  : 0,
                            },
                    }));
                  }}
                  className="rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                />
              </label>
            </div>
          ) : null}
        </div>
      </section>

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
                      ? createSendPromptAction(current.targetAction)
                      : createResetThreadAction(current.targetAction),
                }));
                if (value === "send_prompt") {
                  setPromptSourceType(
                    (currentPromptSourceType) =>
                      currentPromptSourceType ?? "inline_prompt",
                  );
                  return;
                }
                setPromptInputsText(formatPromptInputsText({}));
                setPromptInputsError(null);
              }}
              isDisabled={isDisabled}
              placeholder="Choose a chat action"
            />

            {draftEdge.targetAction?.type === "send_prompt" ? (
              <>
                <IdNameCombobox
                  allItems={PROMPT_SOURCE_OPTIONS}
                  value={promptSourceType}
                  inputDivId="workflow-edge-prompt-source"
                  onSelectedItemChange={(value) => {
                    if (!value) {
                      return;
                    }
                    const nextPromptSourceType =
                      value as WorkflowPromptSourceType;
                    setPromptSourceType(nextPromptSourceType);
                    updateDraft((current) => {
                      const nextTargetAction = createSendPromptAction(
                        current.targetAction,
                      );
                      if (nextPromptSourceType === "inline_prompt") {
                        return {
                          ...current,
                          targetAction: {
                            ...nextTargetAction,
                            promptTemplateId: null,
                            promptSectionId: null,
                            promptInputs: {},
                          },
                        };
                      }
                      return {
                        ...current,
                        targetAction: {
                          ...nextTargetAction,
                          inlinePrompt: null,
                          promptTemplateId:
                            nextPromptSourceType === "prompt_template"
                              ? nextTargetAction.promptTemplateId
                              : null,
                          promptSectionId:
                            nextPromptSourceType === "prompt_section"
                              ? nextTargetAction.promptSectionId
                              : null,
                        },
                      };
                    });
                    if (nextPromptSourceType === "inline_prompt") {
                      setPromptInputsText(formatPromptInputsText({}));
                      setPromptInputsError(null);
                    }
                  }}
                  isDisabled={isDisabled}
                  placeholder="Prompt source"
                />

                {promptSourceType === "prompt_template" ? (
                  <IdNameCombobox
                    allItems={promptTemplateOptions}
                    value={draftEdge.targetAction.promptTemplateId}
                    inputDivId="workflow-edge-prompt-template"
                    onSelectedItemChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        targetAction: {
                          ...createSendPromptAction(current.targetAction),
                          promptTemplateId: value,
                          promptSectionId: null,
                          inlinePrompt: null,
                        },
                      }))
                    }
                    isDisabled={isDisabled}
                    placeholder="Prompt template"
                    selectedItemCanBeNull
                  />
                ) : null}

                {promptSourceType === "prompt_section" ? (
                  <IdNameCombobox
                    allItems={promptSectionOptions}
                    value={draftEdge.targetAction.promptSectionId}
                    inputDivId="workflow-edge-prompt-section"
                    onSelectedItemChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        targetAction: {
                          ...createSendPromptAction(current.targetAction),
                          promptTemplateId: null,
                          promptSectionId: value,
                          inlinePrompt: null,
                        },
                      }))
                    }
                    isDisabled={isDisabled}
                    placeholder="Prompt section"
                    selectedItemCanBeNull
                  />
                ) : null}

                {promptSourceType === "inline_prompt" ? (
                  <label className="flex flex-col gap-1 text-xs text-setta-600 dark:text-setta-300">
                    Inline Prompt
                    <textarea
                      data-testid="workflow-edge-inline-prompt"
                      value={draftEdge.targetAction.inlinePrompt ?? ""}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          targetAction: {
                            ...createSendPromptAction(current.targetAction),
                            promptTemplateId: null,
                            promptSectionId: null,
                            inlinePrompt: event.target.value,
                            promptInputs: {},
                          },
                        }))
                      }
                      disabled={isDisabled}
                      placeholder="Write the prompt this edge should send."
                      className="min-h-[110px] resize-y rounded border border-setta-300 bg-white px-2 py-2 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                    />
                  </label>
                ) : null}

                {promptSourceType !== "inline_prompt" ? (
                  <label className="flex flex-col gap-1 text-xs text-setta-600 dark:text-setta-300">
                    Prompt Bindings JSON
                    <textarea
                      data-testid="workflow-edge-prompt-inputs"
                      value={promptInputsText}
                      onChange={handlePromptInputsChange}
                      disabled={isDisabled}
                      placeholder={PROMPT_INPUTS_PLACEHOLDER}
                      spellCheck="false"
                      className="min-h-[110px] resize-y rounded border border-setta-300 bg-white px-2 py-2 font-mono text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
                    />
                    <p className="text-[11px] text-setta-500 dark:text-setta-400">
                      Edge bindings provide values for Jinja placeholders when
                      this workflow step runs.
                    </p>
                  </label>
                ) : null}

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
                  value={draftEdge.targetAction.engineConfigId}
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
                  value={draftEdge.targetAction.permissionMode}
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
                    checked={Boolean(draftEdge.targetAction.searchEnabled)}
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
                        ...createResetThreadAction(current.targetAction),
                        stopIfRunning: event.target.checked,
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
            onClick={() => {
              setDraftEdge(
                edgeDetails.edge ? cloneWorkflowEdge(edgeDetails.edge) : null,
              );
              setPromptSourceType(getInitialPromptSourceType(edgeDetails.edge));
              setPromptInputsText(
                formatPromptInputsText(
                  edgeDetails.edge?.targetAction?.promptInputs ?? {},
                ),
              );
              setPromptInputsError(null);
            }}
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
