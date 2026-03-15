import { getStateMachineNodePresentation } from "components/Section/Layouts/stateMachineNodePresentation";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import React from "react";
import { RiLoopRightFill, RiPlayMiniFill } from "react-icons/ri";
import { runCustomRun } from "state/actions/customRunExecution";
import {
  addOrGetCustomRunForCodeBlock,
  deleteCustomRun,
  ensureDefaultCustomRuns,
  setCustomRunMode,
  toggleCustomRunInDropdown,
} from "state/actions/customRunStorage";
import {
  getCurrEffectiveSectionImpl,
  getSectionCore,
} from "state/actions/sectionInfos";
import {
  getActiveViewModeConfig,
  getSectionShouldRender,
} from "state/actions/sectionViewModeVisibility";
import {
  resetStateMachineRun,
  startStateMachineRun,
  stopStateMachineRun,
} from "state/actions/stateMachineRunMutations";
import { subscribeStateMachineRunPolling } from "state/actions/stateMachineRunPolling";
import {
  useAIStore,
  useProjectState,
  ZustandProjectState,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import {
  useRunControl,
  type CustomRunItem,
} from "state/stores/projectStatusStores";
import { useShareSession } from "state/stores/sessionStores";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { projectConfigHasPythonCodegen } from "utils/codegenTargets";
import {
  isBaseParentSectionImpl,
  SectionTypeEnum,
  type BaseSectionImplUnion,
  type Core,
  type ViewModeConfig,
} from "utils/generatedTypes";
import { RunInstructionsAccordion } from "./RunInstructionsAccordion";
import {
  normalizeRunInstructionsAccordionOpenValues,
  RUN_INSTRUCTIONS_ACCORDION_DEFAULT_OPEN_VALUES,
} from "./runInstructionsAccordionState";
import {
  useRunInstructionsCodegenAccordionItems,
  type RunInstructionsAccordionItemDescriptor,
} from "./runInstructionsCodegenSections";
import { isRunnableSectionForCustomRun } from "./runInstructionsRunnableCodeBlocks";
import {
  collectRunInstructionsStateMachineControls,
  type RunInstructionsStateMachineControl,
} from "./runInstructionsStateMachineControls";

type RunnableCodeBlock = { sectionId: string; name: string; depth: number };
const PANEL_ROW_CLASSES =
  "mx-[2px] rounded-md bg-setta-100/30 px-2 py-1 text-xs dark:bg-setta-900/40";
const PANEL_COMPACT_SELECT_CLASSES =
  "min-w-0 rounded border border-setta-200 bg-white/70 px-1.5 py-0.5 text-[11px] text-setta-700 disabled:opacity-60 dark:border-setta-800 dark:bg-setta-950/40 dark:text-setta-200";
const PANEL_ICON_BUTTON_CLASSES =
  "inline-flex h-6 w-6 items-center justify-center rounded text-setta-600 hover:bg-setta-200/40 hover:text-setta-900 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 dark:text-setta-300 dark:hover:bg-setta-800/40 dark:hover:text-setta-100";
const PANEL_ICON_BUTTON_DESTRUCTIVE_CLASSES =
  "inline-flex h-6 w-6 items-center justify-center rounded text-setta-400 hover:bg-red-500/10 hover:text-red-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-setta-500 dark:hover:text-red-400";
const RUN_INSTRUCTIONS_INLINE_INSET_CLASS = "pl-[0.375rem] pr-[0.75rem]";
const CUSTOM_RUN_ROW_CLASSES =
  "mx-[2px] flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md bg-setta-100/30 px-2 py-0.5 text-xs dark:bg-setta-900/40";
const CUSTOM_RUN_EMPTY_STATE_CLASSES =
  "mx-[2px] rounded-md bg-setta-100/30 px-2 py-1 text-xs text-setta-600 dark:bg-setta-900/40 dark:text-setta-300";
const WORKFLOW_CONTROL_ROW_CLASSES =
  "mx-[2px] rounded-md bg-setta-100/30 px-2 py-1.5 text-xs dark:bg-setta-900/40";
const WORKFLOW_CONTROL_BUTTON_CLASSES =
  "inline-flex h-6 items-center rounded px-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45";
const WORKFLOW_CONTROL_START_BUTTON_CLASSES = `${WORKFLOW_CONTROL_BUTTON_CLASSES} border border-emerald-500/50 bg-emerald-500/15 text-emerald-900 hover:bg-emerald-500/25 dark:border-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-100 dark:hover:bg-emerald-500/30`;
const WORKFLOW_CONTROL_STOP_BUTTON_CLASSES = `${WORKFLOW_CONTROL_BUTTON_CLASSES} border border-amber-500/50 bg-amber-500/15 text-amber-900 hover:bg-amber-500/25 dark:border-amber-600 dark:bg-amber-500/20 dark:text-amber-100 dark:hover:bg-amber-500/30`;
const WORKFLOW_CONTROL_RESET_BUTTON_CLASSES = `${WORKFLOW_CONTROL_BUTTON_CLASSES} border border-slate-500/40 bg-slate-500/10 text-slate-900 hover:bg-slate-500/20 dark:border-slate-600 dark:bg-slate-500/15 dark:text-slate-100 dark:hover:bg-slate-500/25`;

export function RunInstructions() {
  const { canRun } = useShareCapabilities();
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const projectConfigId = useProjectState((x) => x.projectConfig.id);
  const customRuns = useLocalStorage(
    (x) => x.customRunsByProjectConfigId[projectConfigId] ?? [],
  );
  const workflowControls = useProjectState(
    (state) => collectRunInstructionsStateMachineControls(state),
    _.isEqual,
  );
  const storedAccordionOpenValues = useLocalStorage(
    (x) =>
      x.runInstructionsAccordionOpenValuesByProjectConfigId[projectConfigId] ??
      null,
  );
  const { runMode, continuousRunStarted, continuousRunCustomRunId } =
    useRunControl((x) => ({
      runMode: x.runMode,
      continuousRunStarted: x.continuousRunStarted,
      continuousRunCustomRunId: x.continuousRunCustomRunId,
    }));
  const runnableCodeBlocks = useRunnableCodeBlockListing();
  const codegenAccordionItems = useRunInstructionsCodegenAccordionItems();

  React.useEffect(() => {
    if (!canRun) {
      return;
    }
    ensureDefaultCustomRuns(projectConfigId);
  }, [projectConfigId, canRun]);

  React.useEffect(() => {
    if (isDeploymentMode || workflowControls.length === 0) {
      return;
    }
    return subscribeStateMachineRunPolling();
  }, [isDeploymentMode, workflowControls.length]);

  const resolvedAccordionOpenValues = React.useMemo(
    () =>
      normalizeRunInstructionsAccordionOpenValues(
        storedAccordionOpenValues ??
          RUN_INSTRUCTIONS_ACCORDION_DEFAULT_OPEN_VALUES,
      ),
    [storedAccordionOpenValues],
  );
  const setAccordionOpenValues = React.useCallback(
    (nextOpenValues: Array<string>) => {
      useLocalStorage.setState((state) => ({
        runInstructionsAccordionOpenValuesByProjectConfigId: {
          ...state.runInstructionsAccordionOpenValuesByProjectConfigId,
          [projectConfigId]:
            normalizeRunInstructionsAccordionOpenValues(nextOpenValues),
        },
      }));
    },
    [projectConfigId],
  );

  if (!canRun) {
    return (
      <div className={RUN_INSTRUCTIONS_INLINE_INSET_CLASS}>
        <div className="rounded border border-dashed border-setta-200 bg-white/40 p-3 text-xs text-setta-600 dark:border-setta-800 dark:bg-setta-900/40 dark:text-setta-300">
          Run controls are disabled in sharing mode.
        </div>
      </div>
    );
  }
  const accordionItems: RunInstructionsAccordionItemDescriptor[] = [
    ...codegenAccordionItems,
    {
      value: "run-instructions-workflow-controls",
      title: "Workflow Controls",
      triggerTestId: "run-instructions-accordion-workflow-controls",
      disabled: workflowControls.length === 0,
      disabledReason: "No workflow start sections are available",
      content: (
        <div className="space-y-1">
          {workflowControls.map((workflow) => (
            <WorkflowControlRow
              key={workflow.sectionId}
              workflow={workflow}
              projectConfigId={projectConfigId}
            />
          ))}
        </div>
      ),
    },
    {
      value: "run-instructions-custom-runs",
      title: "Run Button Dropdown Items",
      triggerTestId: "run-instructions-accordion-custom-runs",
      content:
        customRuns.length === 0 ? (
          <div className={CUSTOM_RUN_EMPTY_STATE_CLASSES}>
            No custom runs yet.
          </div>
        ) : (
          <div className="space-y-0.5">
            {customRuns.map((run) => {
              const isActiveContinuousRun =
                runMode === "continuous" &&
                continuousRunStarted &&
                continuousRunCustomRunId === run.id;

              return (
                <CustomRunRow
                  key={run.id}
                  run={run}
                  projectConfigId={projectConfigId}
                  isActiveContinuousRun={isActiveContinuousRun}
                />
              );
            })}
          </div>
        ),
    },
    {
      value: "run-instructions-add-from-code-blocks",
      title: "Add From Code Blocks",
      triggerTestId: "run-instructions-accordion-add-from-code-blocks",
      disabled: runnableCodeBlocks.length === 0,
      disabledReason: "No runnable code blocks are available",
      content: (
        <div className="space-y-1">
          {runnableCodeBlocks.map((item) => (
            <AddCodeBlockRow
              key={item.sectionId}
              projectConfigId={projectConfigId}
              item={item}
            />
          ))}
        </div>
      ),
    },
  ];
  const accordionItemValueSet = new Set<string>(
    accordionItems.map((item) => item.value),
  );
  const visibleAccordionOpenValues = resolvedAccordionOpenValues.filter(
    (value) => accordionItemValueSet.has(value),
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <p
        className={`${RUN_INSTRUCTIONS_INLINE_INSET_CLASS} text-xs text-setta-500 dark:text-setta-300`}
      >
        Start workflows here, then define custom run types and choose which ones
        appear in the main Run dropdown.
      </p>
      <div
        className={`setta-pane-scroll min-h-0 flex-1 ${RUN_INSTRUCTIONS_INLINE_INSET_CLASS}`}
        data-testid="run-instructions-scroll-region"
      >
        <RunInstructionsAccordion
          openValues={visibleAccordionOpenValues}
          onOpenValuesChange={setAccordionOpenValues}
          items={accordionItems}
        />
      </div>
    </div>
  );
}

function WorkflowControlRow({
  workflow,
  projectConfigId,
}: {
  workflow: RunInstructionsStateMachineControl;
  projectConfigId: string;
}) {
  const isDeploymentMode = useShareSession((state) => state.isDeploymentMode);
  const machineRun = useAIStore(
    (state) =>
      getStateMachineNodePresentation({
        runs: state.agentRuns,
        projectConfigId,
        machineGroupId: workflow.machineGroupId,
        sectionId: workflow.sectionId,
        sectionType: SectionTypeEnum.StateMachineStart,
      }),
    _.isEqual,
  );
  const [pendingAction, setPendingAction] = React.useState<
    "start" | "stop" | "reset" | null
  >(null);
  const activityLabel =
    machineRun.failureSummaryLabel ??
    machineRun.activityItems[0]?.label ??
    null;
  const controlsDisabled = pendingAction !== null || isDeploymentMode;

  async function handleStartClick(): Promise<void> {
    setPendingAction("start");
    try {
      await startStateMachineRun(workflow.machineGroupId, workflow.sectionId);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleStopClick(): Promise<void> {
    setPendingAction("stop");
    try {
      await stopStateMachineRun(workflow.machineGroupId);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleResetClick(): Promise<void> {
    setPendingAction("reset");
    try {
      await resetStateMachineRun(workflow.machineGroupId);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section
      className={WORKFLOW_CONTROL_ROW_CLASSES}
      data-testid={`run-instructions-workflow-control-row-${workflow.sectionId}`}
    >
      <div className="min-w-0">
        <div className="truncate text-[11px] font-semibold text-setta-800 dark:text-setta-100">
          {workflow.label}
        </div>
        <div className="truncate font-mono text-[10px] text-setta-500 dark:text-setta-400">
          {workflow.machineGroupId}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${machineRun.statusClasses}`}
          data-testid={`run-instructions-workflow-status-${workflow.sectionId}`}
        >
          {machineRun.statusLabel}
        </span>
      </div>
      {activityLabel ? (
        <p
          className={`mt-1 truncate text-[10px] ${
            machineRun.failureSummaryLabel
              ? "text-rose-700 dark:text-rose-300"
              : "text-setta-500 dark:text-setta-300"
          }`}
        >
          {activityLabel}
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <button
          className={WORKFLOW_CONTROL_START_BUTTON_CLASSES}
          data-testid={`run-instructions-workflow-start-${workflow.sectionId}`}
          disabled={controlsDisabled || machineRun.isRunning}
          onClick={() => {
            void handleStartClick();
          }}
          type="button"
        >
          Start
        </button>
        <button
          className={WORKFLOW_CONTROL_STOP_BUTTON_CLASSES}
          data-testid={`run-instructions-workflow-stop-${workflow.sectionId}`}
          disabled={controlsDisabled || !machineRun.isRunning}
          onClick={() => {
            void handleStopClick();
          }}
          type="button"
        >
          Stop
        </button>
        <button
          className={WORKFLOW_CONTROL_RESET_BUTTON_CLASSES}
          data-testid={`run-instructions-workflow-reset-${workflow.sectionId}`}
          disabled={controlsDisabled || !machineRun.hasRun}
          onClick={() => {
            void handleResetClick();
          }}
          type="button"
        >
          Reset
        </button>
      </div>
    </section>
  );
}

function CustomRunRow({
  run,
  projectConfigId,
  isActiveContinuousRun,
}: {
  run: CustomRunItem;
  projectConfigId: string;
  isActiveContinuousRun: boolean;
}) {
  const isContinuous = run.runMode === "continuous";
  const runIcon = isContinuous ? <RiLoopRightFill /> : <RiPlayMiniFill />;

  let runTooltip = "Run once";
  if (isContinuous) {
    runTooltip = isActiveContinuousRun
      ? "Stop continuous run"
      : "Start continuous run";
  }

  return (
    <div className={CUSTOM_RUN_ROW_CLASSES}>
      <input
        type="checkbox"
        checked={run.includeInRunDropdown}
        onChange={() => toggleCustomRunInDropdown(projectConfigId, run.id)}
        className="h-4 w-4 rounded-md bg-setta-500/10 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500"
        {...getFloatingBoxHandlers({ content: "Show in Run dropdown" })}
      />
      <div className="min-w-0 flex-1 truncate text-setta-800 dark:text-setta-200">
        {run.name}
      </div>
      <select
        className={`${PANEL_COMPACT_SELECT_CLASSES} min-w-[7.5rem] shrink-0`}
        value={run.runMode}
        onChange={(e) =>
          setCustomRunMode(
            projectConfigId,
            run.id,
            e.target.value === "continuous" ? "continuous" : "once",
          )
        }
        {...getFloatingBoxHandlers({ content: "Run mode" })}
      >
        <option value="once">once</option>
        <option value="continuous">continuous</option>
      </select>
      <button
        className={`inline-flex h-6 w-6 items-center justify-center rounded focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          isActiveContinuousRun
            ? "bg-blue-800 text-white hover:bg-blue-700"
            : "text-setta-600 hover:bg-green-500/10 hover:text-green-600 dark:text-setta-300 dark:hover:text-green-400"
        }`}
        onClick={() => {
          void runCustomRun(projectConfigId, run.id);
        }}
        type="button"
        {...getFloatingBoxHandlers({ content: runTooltip })}
      >
        {runIcon}
      </button>
      <button
        className={PANEL_ICON_BUTTON_DESTRUCTIVE_CLASSES}
        onClick={() => deleteCustomRun(projectConfigId, run.id)}
        type="button"
        {...getFloatingBoxHandlers({ content: "Delete" })}
      >
        <i className="gg-trash" />
      </button>
    </div>
  );
}

function AddCodeBlockRow({
  projectConfigId,
  item,
}: {
  projectConfigId: string;
  item: RunnableCodeBlock;
}) {
  return (
    <div
      className={`${PANEL_ROW_CLASSES} flex min-w-0 items-center gap-2`}
      style={{ paddingLeft: `${0.5 + 0.5 * item.depth}rem` }}
    >
      <button
        className={PANEL_ICON_BUTTON_CLASSES}
        onClick={() =>
          addOrGetCustomRunForCodeBlock(
            projectConfigId,
            item.sectionId,
            item.name,
          )
        }
        type="button"
        {...getFloatingBoxHandlers({ content: "Add custom run" })}
      >
        <i className="gg-add" />
      </button>
      <div className="min-w-0 flex-1 truncate text-setta-800 dark:text-setta-200">
        {item.name}
      </div>
    </div>
  );
}

function useRunnableCodeBlockListing() {
  return useProjectState((x) => {
    const outputList: Array<RunnableCodeBlock> = [];
    const viewMode = getActiveViewModeConfig(x);
    const { isEditingViewMode } = x.projectConfig;
    const pythonCodegenEnabled = projectConfigHasPythonCodegen(x.projectConfig);
    for (const sectionId of Object.keys(x.projectConfig.topLevelSections)) {
      const sectionImpl = getCurrEffectiveSectionImpl(x, sectionId);
      const sectionCore = getSectionCore(x, sectionId);
      getRunnableCodeBlockListingHelper(
        sectionCore,
        sectionImpl,
        0,
        x,
        viewMode,
        isEditingViewMode,
        pythonCodegenEnabled,
        outputList,
      );
    }
    return outputList;
  }, _.isEqual);
}

function getRunnableCodeBlockListingHelper(
  section: Core,
  sectionImpl: BaseSectionImplUnion,
  depth: number,
  x: ZustandProjectState,
  viewMode: ViewModeConfig,
  isEditingViewMode: boolean,
  pythonCodegenEnabled: boolean,
  outputList: Array<RunnableCodeBlock>,
) {
  const codeLanguage =
    sectionImpl.type === SectionTypeEnum.Code
      ? sectionImpl.codeLanguage
      : undefined;
  const isRunnable = isRunnableSectionForCustomRun(
    sectionImpl.type,
    pythonCodegenEnabled,
    codeLanguage,
  );

  const visibility = viewMode.visibilityBySectionId[section.id];
  if (visibility === undefined) {
    throw new Error(
      `Missing visibility for section ${section.id} in view mode ${viewMode.id}`,
    );
  }
  if (isRunnable && getSectionShouldRender(visibility, isEditingViewMode)) {
    outputList.push({ sectionId: section.id, name: section.name, depth });
  }

  if (isBaseParentSectionImpl(sectionImpl)) {
    for (const childId of sectionImpl.children) {
      const childSection = x.sections[childId];
      if (!childSection) {
        continue;
      }
      const childImpl = getCurrEffectiveSectionImpl(x, childId);
      getRunnableCodeBlockListingHelper(
        childSection,
        childImpl,
        depth + 1,
        x,
        viewMode,
        isEditingViewMode,
        pythonCodegenEnabled,
        outputList,
      );
    }
  }
}
