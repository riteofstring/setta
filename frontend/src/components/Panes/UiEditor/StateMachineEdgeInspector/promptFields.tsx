import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";

import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";

import { type ChangeEvent } from "react";

import { useProjectState } from "state/definitions";

import {
  SectionTypeEnum,
  StateMachineUIConfig,
  type StateMachineCountOperator,
} from "utils/generatedTypes";

export type WorkflowEdge = ReturnType<
  typeof useProjectState.getState
>["projectConfig"]["stateMachineEdges"][number];

export type WorkflowTargetAction = NonNullable<WorkflowEdge["targetAction"]>;

export type WorkflowSourceFilterType = NonNullable<
  NonNullable<WorkflowEdge["sourceFilter"]>["type"]
>;

export type WorkflowTargetActionType = NonNullable<
  WorkflowTargetAction["type"]
>;

export type WorkflowThreadStrategy =
  | "continue_current_thread"
  | "new_thread_before_send";

export type WorkflowCountOperator = StateMachineCountOperator;

export type WorkflowPromptSourceType =
  (typeof StateMachineUIConfig.promptSourceTypes)[keyof typeof StateMachineUIConfig.promptSourceTypes];

export type WorkflowSignalSourceFilterField = Exclude<
  keyof NonNullable<WorkflowEdge["sourceFilter"]>,
  "type"
>;

export type WorkflowEdgeInspectorProps = {
  edgeId: string;
};

export type WorkflowEdgeDetails = {
  edge: WorkflowEdge | null;
  sourceSectionName: string | null;
  targetSectionName: string | null;
  sourceType: SectionTypeEnum | null;
  targetType: SectionTypeEnum | null;
};

export type WorkflowEdgeUpdater = (current: WorkflowEdge) => WorkflowEdge;

export type WorkflowOptionGroups = Array<{
  group: string;
  items: Array<{ id: string; name: string }>;
}>;

export type WorkflowConfigOption<T extends string> = {
  value: T;
  label: string;
};

export type WorkflowDraftState = {
  draftEdge: WorkflowEdge | null;
  promptSourceType: WorkflowPromptSourceType;
  promptInputsText: string;
};

export type ResetPromptInputs = (promptInputs?: Record<string, string>) => void;

export type WorkflowTriggerSectionProps = {
  draftEdge: WorkflowEdge;
  isDisabled: boolean;
  updateDraft: (updater: WorkflowEdgeUpdater) => void;
};

export type WorkflowConditionSectionProps = WorkflowTriggerSectionProps;

export type WorkflowActionSectionProps = {
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

export type WorkflowFooterProps = {
  isDisabled: boolean;
  isDirty: boolean;
  promptInputsError: string | null;
  applyChanges: () => Promise<void>;
  onReset: () => void;
};

export const SIGNAL_SOURCE_FILTER_TYPE: WorkflowSourceFilterType = "signal";

export const SEND_PROMPT_ACTION_TYPE: WorkflowTargetActionType = "send_prompt";

export function buildComboboxItems<T extends string>(
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

export const SOURCE_FILTER_OPTIONS = buildComboboxItems(
  "Chat Triggers",
  StateMachineUIConfig.sourceFilterOptions,
);

export const TARGET_ACTION_OPTIONS = buildComboboxItems(
  "Chat Actions",
  StateMachineUIConfig.targetActionOptions,
);

export const PROMPT_SOURCE_OPTIONS = buildComboboxItems(
  "Prompt Source",
  StateMachineUIConfig.promptSourceOptions,
);

export const PROMPT_INPUTS_PLACEHOLDER = '{\n  "name": "Kevin"\n}';

export const THREAD_STRATEGY_OPTIONS = buildComboboxItems(
  "Thread Strategy",
  StateMachineUIConfig.threadStrategyOptions,
);

export const SOURCE_ACTIVATION_COUNT_OPERATOR_OPTIONS = buildComboboxItems(
  "Count Operators",
  StateMachineUIConfig.sourceActivationCountOperatorOptions,
);

export const PERMISSION_MODE_OPTIONS = buildComboboxItems(
  "Permissions",
  StateMachineUIConfig.permissionModeOptions,
);

export function cloneWorkflowEdge(edge: WorkflowEdge): WorkflowEdge {
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

export function clonePromptInputs(
  promptInputs: Record<string, string> | null | undefined,
): Record<string, string> {
  return { ...(promptInputs ?? {}) };
}

export function normalizeOptionalSignalText(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getSharedTargetActionSettings(
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
    threadStrategy = StateMachineUIConfig.defaultThreadStrategy as WorkflowThreadStrategy,
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

export function getCurrentSendPromptAction(
  currentAction: WorkflowEdge["targetAction"],
): WorkflowTargetAction | null {
  return currentAction?.type === SEND_PROMPT_ACTION_TYPE ? currentAction : null;
}

export function createSendPromptAction(
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

export function createResetThreadAction(
  currentAction: WorkflowEdge["targetAction"],
): WorkflowTargetAction {
  return {
    type: StateMachineUIConfig.defaultTargetActionType as WorkflowTargetActionType,
    promptTemplateId: null,
    promptSectionId: null,
    inlinePrompt: null,
    promptInputs: {},
    ...getSharedTargetActionSettings(currentAction),
  };
}

export function getInitialPromptSourceType(
  edge: WorkflowEdge | null,
): WorkflowPromptSourceType {
  const targetAction = edge?.targetAction;
  if (targetAction?.type !== SEND_PROMPT_ACTION_TYPE) {
    return StateMachineUIConfig.defaultPromptSourceType;
  }
  if (targetAction.promptSectionId) {
    return StateMachineUIConfig.promptSourceTypes.promptSection;
  }
  if (targetAction.promptTemplateId) {
    return StateMachineUIConfig.promptSourceTypes.promptTemplate;
  }
  return StateMachineUIConfig.defaultPromptSourceType;
}

export function formatPromptInputsText(
  promptInputs: Record<string, string>,
): string {
  return JSON.stringify(promptInputs, null, 2);
}

export function buildWorkflowDraftState(
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

export function getSectionTypeById(
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

export function getPromptSectionOptions(
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

export function createSignalSourceFilter(
  sourceFilter: WorkflowEdge["sourceFilter"],
): NonNullable<WorkflowEdge["sourceFilter"]> {
  return {
    type: SIGNAL_SOURCE_FILTER_TYPE,
    signalName: normalizeOptionalSignalText(sourceFilter?.signalName),
    payloadField: normalizeOptionalSignalText(sourceFilter?.payloadField),
    equals: normalizeOptionalSignalText(sourceFilter?.equals),
  };
}

export function sanitizeSourceFilter(
  sourceFilter: WorkflowEdge["sourceFilter"],
  sourceType: SectionTypeEnum | null,
): WorkflowEdge["sourceFilter"] {
  if (sourceType !== SectionTypeEnum.Chat) {
    return null;
  }
  const filterType =
    sourceFilter?.type ??
    (StateMachineUIConfig.defaultSourceFilterType as WorkflowSourceFilterType);
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

export function buildPromptSourceTargetAction(
  sendPromptAction: WorkflowTargetAction,
  promptSourceType: WorkflowPromptSourceType,
): WorkflowTargetAction {
  switch (promptSourceType) {
    case StateMachineUIConfig.promptSourceTypes.promptTemplate:
      return {
        ...sendPromptAction,
        promptTemplateId: sendPromptAction.promptTemplateId ?? null,
        promptSectionId: null,
        inlinePrompt: null,
      };
    case StateMachineUIConfig.promptSourceTypes.promptSection:
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

export function sanitizeTargetAction(
  targetAction: WorkflowEdge["targetAction"],
  targetType: SectionTypeEnum | null,
  promptSourceType: WorkflowPromptSourceType,
): WorkflowEdge["targetAction"] {
  if (targetType !== SectionTypeEnum.Chat) {
    return null;
  }
  const actionType =
    targetAction?.type ??
    (StateMachineUIConfig.defaultTargetActionType as WorkflowTargetActionType);
  if (
    actionType ===
    (StateMachineUIConfig.defaultTargetActionType as WorkflowTargetActionType)
  ) {
    return createResetThreadAction(targetAction);
  }
  return buildPromptSourceTargetAction(
    createSendPromptAction(targetAction),
    promptSourceType,
  );
}

export function sanitizeWorkflowEdge(
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

export function buildSelectedSourceFilter(
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

export function updateSignalSourceFilterField(
  sourceFilter: WorkflowEdge["sourceFilter"],
  field: WorkflowSignalSourceFilterField,
  value: string,
): NonNullable<WorkflowEdge["sourceFilter"]> {
  const nextSourceFilter = createSignalSourceFilter(sourceFilter);
  nextSourceFilter[field] = value;
  return nextSourceFilter;
}

export function normalizeSourceActivationValue(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function buildSourceActivationCountCondition(
  current:
    | NonNullable<WorkflowEdge["sourceActivationCountCondition"]>
    | null
    | undefined,
  operator: WorkflowCountOperator,
  value: number,
): NonNullable<WorkflowEdge["sourceActivationCountCondition"]> {
  return current ? { ...current, operator, value } : { operator, value };
}

export function getWorkflowEdgeDetails(
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

export function WorkflowSignalSourceFilterFields({
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

export function WorkflowTriggerSection({
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
          value={
            draftEdge.sourceFilter?.type ??
            (StateMachineUIConfig.defaultSourceFilterType as WorkflowSourceFilterType)
          }
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

export function WorkflowConditionSection({
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
                      operator:
                        StateMachineUIConfig.defaultSourceActivationCountOperator as WorkflowCountOperator,
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
                          (StateMachineUIConfig.defaultSourceActivationCountOperator as WorkflowCountOperator),
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

export function WorkflowPromptSourceSpecificFields({
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
    case StateMachineUIConfig.promptSourceTypes.promptTemplate:
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
    case StateMachineUIConfig.promptSourceTypes.promptSection:
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
    case StateMachineUIConfig.promptSourceTypes.inline:
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
