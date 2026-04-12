import { useHydrateAgenticState } from "components/Panes/Overview/ProjectLevelAI/useHydrateAgenticState";
import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import _ from "lodash";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  deleteSelectedStateMachineEdges,
  replaceStateMachineEdge,
} from "state/actions/stateMachineEdges";
import { useAIStore, useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  SectionTypeEnum,
  StateMachineUIConfig,
  type StateMachineCountOperator,
} from "utils/generatedTypes";

type WorkflowEdge = ReturnType<
  typeof useProjectState.getState
>["projectConfig"]["stateMachineEdges"][number];
type WorkflowTargetAction = NonNullable<WorkflowEdge["targetAction"]>;
type WorkflowSourceFilterType = NonNullable<
  NonNullable<WorkflowEdge["sourceFilter"]>["type"]
>;
type WorkflowTargetActionType = NonNullable<WorkflowTargetAction["type"]>;
type WorkflowThreadStrategy =
  | "continue_current_thread"
  | "new_thread_before_send";
type WorkflowCountOperator = StateMachineCountOperator;
type WorkflowPromptSourceType =
  (typeof StateMachineUIConfig.promptSourceTypes)[keyof typeof StateMachineUIConfig.promptSourceTypes];

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
type WorkflowEdgeUpdater = (current: WorkflowEdge) => WorkflowEdge;
type WorkflowOptionGroups = Array<{
  group: string;
  items: Array<{ id: string; name: string }>;
}>;
type WorkflowConfigOption<T extends string> = {
  value: T;
  label: string;
};
type WorkflowDraftState = {
  draftEdge: WorkflowEdge | null;
  promptSourceType: WorkflowPromptSourceType;
  promptInputsText: string;
};
type ResetPromptInputs = (promptInputs?: Record<string, string>) => void;
type WorkflowTriggerSectionProps = {
  draftEdge: WorkflowEdge;
  isDisabled: boolean;
  updateDraft: (updater: WorkflowEdgeUpdater) => void;
};
type WorkflowConditionSectionProps = WorkflowTriggerSectionProps;
type WorkflowActionSectionProps = {
  draftEdge: WorkflowEdge;
  isDisabled: boolean;
  updateDraft: (updater: WorkflowEdgeUpdater) => void;
  promptSourceType: WorkflowPromptSourceType;
  setPromptSourceType: (value: WorkflowPromptSourceType) => void;
  promptTemplateOptions: WorkflowOptionGroups;
  promptSectionOptions: WorkflowOptionGroups;
  engineConfigOptions: WorkflowOptionGroups;
  promptInputsText: string;
  handlePromptInputsChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  resetPromptInputs: ResetPromptInputs;
};
type WorkflowFooterProps = {
  isDisabled: boolean;
  isDirty: boolean;
  promptInputsError: string | null;
  applyChanges: () => Promise<void>;
  onReset: () => void;
};

const DEFAULT_SOURCE_FILTER_TYPE: WorkflowSourceFilterType =
  StateMachineUIConfig.defaultSourceFilterType as WorkflowSourceFilterType;
const SIGNAL_SOURCE_FILTER_TYPE: WorkflowSourceFilterType = "signal";
const SEND_PROMPT_ACTION_TYPE: WorkflowTargetActionType = "send_prompt";
const RESET_THREAD_ACTION_TYPE: WorkflowTargetActionType =
  StateMachineUIConfig.defaultTargetActionType as WorkflowTargetActionType;
const DEFAULT_THREAD_STRATEGY: WorkflowThreadStrategy =
  StateMachineUIConfig.defaultThreadStrategy as WorkflowThreadStrategy;
const DEFAULT_SOURCE_ACTIVATION_COUNT_OPERATOR: WorkflowCountOperator =
  StateMachineUIConfig.defaultSourceActivationCountOperator as WorkflowCountOperator;
const DEFAULT_PROMPT_SOURCE_TYPE: WorkflowPromptSourceType =
  StateMachineUIConfig.defaultPromptSourceType;
const INLINE_PROMPT_SOURCE: WorkflowPromptSourceType =
  StateMachineUIConfig.promptSourceTypes.inline;
const PROMPT_TEMPLATE_SOURCE: WorkflowPromptSourceType =
  StateMachineUIConfig.promptSourceTypes.promptTemplate;
const PROMPT_SECTION_SOURCE: WorkflowPromptSourceType =
  StateMachineUIConfig.promptSourceTypes.promptSection;

function buildComboboxItems<T extends string>(
  group: string,
  options: ReadonlyArray<WorkflowConfigOption<T>>,
): AllItemsType<T> {
  return [
    {
      group,
      items: options.map((option) => ({
        id: option.value,
        name: option.label,
      })),
    },
  ];
}

const SOURCE_FILTER_OPTIONS = buildComboboxItems(
  "Chat Triggers",
  StateMachineUIConfig.sourceFilterOptions,
);

const TARGET_ACTION_OPTIONS = buildComboboxItems(
  "Chat Actions",
  StateMachineUIConfig.targetActionOptions,
);

const PROMPT_SOURCE_OPTIONS = buildComboboxItems(
  "Prompt Source",
  StateMachineUIConfig.promptSourceOptions,
);

const PROMPT_INPUTS_PLACEHOLDER = '{\n  "name": "Kevin"\n}';

const THREAD_STRATEGY_OPTIONS = buildComboboxItems(
  "Thread Strategy",
  StateMachineUIConfig.threadStrategyOptions,
);

const SOURCE_ACTIVATION_COUNT_OPERATOR_OPTIONS = buildComboboxItems(
  "Count Operators",
  StateMachineUIConfig.sourceActivationCountOperatorOptions,
);

const PERMISSION_MODE_OPTIONS = buildComboboxItems(
  "Permissions",
  StateMachineUIConfig.permissionModeOptions,
);

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

function clonePromptInputs(
  promptInputs: Record<string, string> | null | undefined,
): Record<string, string> {
  return { ...(promptInputs ?? {}) };
}

function normalizeOptionalSignalText(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getSharedTargetActionSettings(
  currentAction: WorkflowEdge["targetAction"],
): Pick<
  WorkflowTargetAction,
  | "threadStrategy"
  | "stopIfRunning"
  | "engineConfigId"
  | "agentProfileId"
  | "permissionMode"
  | "searchEnabled"
> {
  const {
    threadStrategy = DEFAULT_THREAD_STRATEGY,
    stopIfRunning = false,
    engineConfigId = null,
    agentProfileId = null,
    permissionMode = null,
    searchEnabled = null,
  } = currentAction ?? {};
  return {
    threadStrategy,
    stopIfRunning,
    engineConfigId,
    agentProfileId,
    permissionMode,
    searchEnabled,
  };
}

function getCurrentSendPromptAction(
  currentAction: WorkflowEdge["targetAction"],
): WorkflowTargetAction | null {
  return currentAction?.type === SEND_PROMPT_ACTION_TYPE ? currentAction : null;
}

function createSendPromptAction(
  currentAction: WorkflowEdge["targetAction"],
): WorkflowTargetAction {
  const sendPromptAction = getCurrentSendPromptAction(currentAction);
  return {
    type: SEND_PROMPT_ACTION_TYPE,
    promptTemplateId: sendPromptAction?.promptTemplateId ?? null,
    promptSectionId: sendPromptAction?.promptSectionId ?? null,
    inlinePrompt: sendPromptAction?.inlinePrompt ?? null,
    promptInputs: clonePromptInputs(sendPromptAction?.promptInputs),
    ...getSharedTargetActionSettings(currentAction),
  };
}

function createResetThreadAction(
  currentAction: WorkflowEdge["targetAction"],
): WorkflowTargetAction {
  return {
    type: RESET_THREAD_ACTION_TYPE,
    promptTemplateId: null,
    promptSectionId: null,
    inlinePrompt: null,
    promptInputs: {},
    ...getSharedTargetActionSettings(currentAction),
  };
}

function getInitialPromptSourceType(
  edge: WorkflowEdge | null,
): WorkflowPromptSourceType {
  const targetAction = edge?.targetAction;
  if (targetAction?.type !== SEND_PROMPT_ACTION_TYPE) {
    return DEFAULT_PROMPT_SOURCE_TYPE;
  }
  if (targetAction.promptSectionId) {
    return PROMPT_SECTION_SOURCE;
  }
  if (targetAction.promptTemplateId) {
    return PROMPT_TEMPLATE_SOURCE;
  }
  return DEFAULT_PROMPT_SOURCE_TYPE;
}

function formatPromptInputsText(promptInputs: Record<string, string>): string {
  return JSON.stringify(promptInputs, null, 2);
}

function buildWorkflowDraftState(
  edge: WorkflowEdge | null,
): WorkflowDraftState {
  return {
    draftEdge: edge ? cloneWorkflowEdge(edge) : null,
    promptSourceType: getInitialPromptSourceType(edge),
    promptInputsText: formatPromptInputsText(
      edge?.targetAction?.promptInputs ?? {},
    ),
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

function createSignalSourceFilter(
  sourceFilter: WorkflowEdge["sourceFilter"],
): NonNullable<WorkflowEdge["sourceFilter"]> {
  return {
    type: SIGNAL_SOURCE_FILTER_TYPE,
    signalName: normalizeOptionalSignalText(sourceFilter?.signalName),
    payloadField: normalizeOptionalSignalText(sourceFilter?.payloadField),
    equals: normalizeOptionalSignalText(sourceFilter?.equals),
  };
}

function sanitizeSourceFilter(
  sourceFilter: WorkflowEdge["sourceFilter"],
  sourceType: SectionTypeEnum | null,
): WorkflowEdge["sourceFilter"] {
  if (sourceType !== SectionTypeEnum.Chat) {
    return null;
  }
  const filterType = sourceFilter?.type ?? DEFAULT_SOURCE_FILTER_TYPE;
  if (filterType === SIGNAL_SOURCE_FILTER_TYPE) {
    return createSignalSourceFilter(sourceFilter);
  }
  return {
    type: filterType,
    signalName: null,
    payloadField: null,
    equals: null,
  };
}

function buildPromptSourceTargetAction(
  sendPromptAction: WorkflowTargetAction,
  promptSourceType: WorkflowPromptSourceType,
): WorkflowTargetAction {
  switch (promptSourceType) {
    case PROMPT_TEMPLATE_SOURCE:
      return {
        ...sendPromptAction,
        promptTemplateId: sendPromptAction.promptTemplateId ?? null,
        promptSectionId: null,
        inlinePrompt: null,
      };
    case PROMPT_SECTION_SOURCE:
      return {
        ...sendPromptAction,
        promptTemplateId: null,
        promptSectionId: sendPromptAction.promptSectionId ?? null,
        inlinePrompt: null,
      };
    default:
      return {
        ...sendPromptAction,
        promptTemplateId: null,
        promptSectionId: null,
        inlinePrompt: sendPromptAction.inlinePrompt ?? null,
        promptInputs: {},
      };
  }
}

function sanitizeTargetAction(
  targetAction: WorkflowEdge["targetAction"],
  targetType: SectionTypeEnum | null,
  promptSourceType: WorkflowPromptSourceType,
): WorkflowEdge["targetAction"] {
  if (targetType !== SectionTypeEnum.Chat) {
    return null;
  }
  const actionType = targetAction?.type ?? RESET_THREAD_ACTION_TYPE;
  if (actionType === RESET_THREAD_ACTION_TYPE) {
    return createResetThreadAction(targetAction);
  }
  return buildPromptSourceTargetAction(
    createSendPromptAction(targetAction),
    promptSourceType,
  );
}

function sanitizeWorkflowEdge(
  edge: WorkflowEdge,
  sourceType: SectionTypeEnum | null,
  targetType: SectionTypeEnum | null,
  promptSourceType: WorkflowPromptSourceType,
): WorkflowEdge {
  const nextEdge = cloneWorkflowEdge(edge);
  nextEdge.sourceFilter = sanitizeSourceFilter(
    nextEdge.sourceFilter,
    sourceType,
  );
  nextEdge.targetAction = sanitizeTargetAction(
    nextEdge.targetAction,
    targetType,
    promptSourceType,
  );
  return nextEdge;
}

function buildSelectedSourceFilter(
  value: WorkflowSourceFilterType,
  sourceFilter: WorkflowEdge["sourceFilter"],
): NonNullable<WorkflowEdge["sourceFilter"]> {
  if (value === SIGNAL_SOURCE_FILTER_TYPE) {
    return {
      type: SIGNAL_SOURCE_FILTER_TYPE,
      signalName: sourceFilter?.signalName ?? null,
      payloadField: sourceFilter?.payloadField ?? null,
      equals: sourceFilter?.equals ?? null,
    };
  }
  return {
    type: value,
    signalName: null,
    payloadField: null,
    equals: null,
  };
}

function updateSignalSourceFilterField(
  sourceFilter: WorkflowEdge["sourceFilter"],
  field: "signalName" | "payloadField" | "equals",
  value: string,
): NonNullable<WorkflowEdge["sourceFilter"]> {
  return {
    type: SIGNAL_SOURCE_FILTER_TYPE,
    signalName:
      field === "signalName" ? value : sourceFilter?.signalName ?? null,
    payloadField:
      field === "payloadField" ? value : sourceFilter?.payloadField ?? null,
    equals: field === "equals" ? value : sourceFilter?.equals ?? null,
  };
}

function normalizeSourceActivationValue(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function buildSourceActivationCountCondition(
  current:
    | NonNullable<WorkflowEdge["sourceActivationCountCondition"]>
    | null
    | undefined,
  operator: WorkflowCountOperator,
  value: number,
): NonNullable<WorkflowEdge["sourceActivationCountCondition"]> {
  return current ? { ...current, operator, value } : { operator, value };
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

function WorkflowSignalSourceFilterFields({
  draftEdge,
  isDisabled,
  updateDraft,
}: WorkflowTriggerSectionProps) {
  return (
    <>
      <label className="flex flex-col gap-1 text-xs text-setta-600 dark:text-setta-300">
        Signal Name
        <input
          data-testid="workflow-edge-signal-name"
          value={draftEdge.sourceFilter?.signalName ?? ""}
          onChange={(event) =>
            updateDraft((current) => ({
              ...current,
              sourceFilter: updateSignalSourceFilterField(
                current.sourceFilter,
                "signalName",
                event.target.value,
              ),
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
          value={draftEdge.sourceFilter?.payloadField ?? ""}
          onChange={(event) =>
            updateDraft((current) => ({
              ...current,
              sourceFilter: updateSignalSourceFilterField(
                current.sourceFilter,
                "payloadField",
                event.target.value,
              ),
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
          value={draftEdge.sourceFilter?.equals ?? ""}
          onChange={(event) =>
            updateDraft((current) => ({
              ...current,
              sourceFilter: updateSignalSourceFilterField(
                current.sourceFilter,
                "equals",
                event.target.value,
              ),
            }))
          }
          disabled={isDisabled}
          placeholder="retry"
          className="rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
        />
      </label>
    </>
  );
}

function WorkflowTriggerSection({
  draftEdge,
  isDisabled,
  updateDraft,
}: WorkflowTriggerSectionProps) {
  return (
    <section className="rounded-md border border-setta-200/70 p-3 dark:border-setta-700/70">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-setta-700 dark:text-setta-300">
        Trigger
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <IdNameCombobox
          allItems={SOURCE_FILTER_OPTIONS}
          value={draftEdge.sourceFilter?.type ?? DEFAULT_SOURCE_FILTER_TYPE}
          inputDivId="workflow-edge-source-filter"
          onSelectedItemChange={(value) => {
            if (!value) {
              return;
            }
            updateDraft((current) => ({
              ...current,
              sourceFilter: buildSelectedSourceFilter(
                value as WorkflowSourceFilterType,
                current.sourceFilter,
              ),
            }));
          }}
          isDisabled={isDisabled}
          placeholder="Choose a chat trigger"
        />
        {draftEdge.sourceFilter?.type === SIGNAL_SOURCE_FILTER_TYPE ? (
          <WorkflowSignalSourceFilterFields
            draftEdge={draftEdge}
            isDisabled={isDisabled}
            updateDraft={updateDraft}
          />
        ) : null}
      </div>
    </section>
  );
}

function WorkflowConditionSection({
  draftEdge,
  isDisabled,
  updateDraft,
}: WorkflowConditionSectionProps) {
  return (
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
                      operator: DEFAULT_SOURCE_ACTIVATION_COUNT_OPERATOR,
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
                    buildSourceActivationCountCondition(
                      current.sourceActivationCountCondition,
                      value as WorkflowCountOperator,
                      current.sourceActivationCountCondition?.value ?? 0,
                    ),
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
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    sourceActivationCountCondition:
                      buildSourceActivationCountCondition(
                        current.sourceActivationCountCondition,
                        current.sourceActivationCountCondition?.operator ??
                          DEFAULT_SOURCE_ACTIVATION_COUNT_OPERATOR,
                        normalizeSourceActivationValue(event.target.value),
                      ),
                  }))
                }
                className="rounded border border-setta-300 bg-white px-2 py-1 text-xs text-setta-700 outline-none focus-visible:border-blue-400 disabled:opacity-50 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-100"
              />
            </label>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function WorkflowPromptSourceSpecificFields({
  draftEdge,
  isDisabled,
  updateDraft,
  promptSourceType,
  promptTemplateOptions,
  promptSectionOptions,
  promptInputsText,
  handlePromptInputsChange,
}: Pick<
  WorkflowActionSectionProps,
  | "draftEdge"
  | "isDisabled"
  | "updateDraft"
  | "promptSourceType"
  | "promptTemplateOptions"
  | "promptSectionOptions"
  | "promptInputsText"
  | "handlePromptInputsChange"
>) {
  const targetAction = draftEdge.targetAction;
  if (!targetAction || targetAction.type !== SEND_PROMPT_ACTION_TYPE) {
    return null;
  }
  switch (promptSourceType) {
    case PROMPT_TEMPLATE_SOURCE:
      return (
        <IdNameCombobox
          allItems={promptTemplateOptions}
          value={targetAction.promptTemplateId}
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
      );
    case PROMPT_SECTION_SOURCE:
      return (
        <IdNameCombobox
          allItems={promptSectionOptions}
          value={targetAction.promptSectionId}
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
      );
    case INLINE_PROMPT_SOURCE:
      return (
        <label className="flex flex-col gap-1 text-xs text-setta-600 dark:text-setta-300">
          Inline Prompt
          <textarea
            data-testid="workflow-edge-inline-prompt"
            value={targetAction.inlinePrompt ?? ""}
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
      );
    default:
      return (
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
            Edge bindings provide values for Jinja placeholders when this
            workflow step runs.
          </p>
        </label>
      );
  }
}

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
          if (nextPromptSourceType === INLINE_PROMPT_SOURCE) {
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
          draftEdge.targetAction?.threadStrategy ?? DEFAULT_THREAD_STRATEGY
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
          value={draftEdge.targetAction?.type ?? RESET_THREAD_ACTION_TYPE}
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
            if (nextActionType === RESET_THREAD_ACTION_TYPE) {
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
