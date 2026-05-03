import { callOpenAPI, res200 } from "@setta/app-subsystem-frontend-sdk";

import { getStateMachineNodePresentation } from "components/Section/Layouts/stateMachineNodePresentation";

import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";

import _ from "lodash";

import { setProjectConfigCodegenTargets } from "openapi/http";

import React from "react";

import { RiLoopRightFill, RiPlayMiniFill } from "react-icons/ri";

import {
  addOrGetCustomRunForCodeBlock,
  deleteCustomRun,
  ensureDefaultCustomRuns,
  runCustomRun,
  setCustomRunMode,
  toggleCustomRunInDropdown,
} from "state/actions/customRuns";

import { applyProjectCodegenTargetsResponse } from "state/actions/project/codegenTargets";

import {
  getActiveViewModeConfig,
  getCurrEffectiveSectionImpl,
  getSectionCore,
  getSectionImplChildren,
  getSectionShouldRender,
} from "state/actions/sectionInfos";

import {
  loadStateMachineRuns,
  resetStateMachineRun,
  startStateMachineRun,
  stopStateMachineRun,
} from "state/actions/stateMachineRuns";

import {
  CustomRunItem,
  useAIStore,
  useLocalStorage,
  useProjectState,
  useRunControl,
  useSettings,
  useShareSession,
  ZustandProjectState,
} from "state/definitions";

import { useShareCapabilities } from "state/hooks/share";

import {
  getPythonCodegenTarget,
  projectConfigHasPythonCodegen,
} from "utils/codegenTargets";

import {
  createCodeObjValuePolicy,
  createProjectCodegenPythonTarget,
  createSectionCodegenPolicy,
  isBaseParentSectionImpl,
  RunSnapshotModeUIConfig,
  SectionTypeEnum,
  type BaseSectionImplUnion,
  type Core,
  type ProjectCodegenPythonTarget,
  type ProjectCodegenTarget,
  type SectionType,
  type SettingsState,
  type ViewMode,
} from "utils/generatedTypes";

import { RunInstructionsAccordion } from "../RunInstructionsAccordion";

import {
  normalizeRunInstructionsAccordionOpenValues,
  RUN_INSTRUCTIONS_ACCORDION_DEFAULT_OPEN_VALUES,
  type RunInstructionsAccordionItemValue,
} from "../runInstructionsAccordionState";

import {
  RunInstructionsCodegenPolicy,
  type RunInstructionsCodegenPolicyStyles,
  type RunInstructionsCodeObjOption,
  type RunInstructionsSectionOption,
} from "../RunInstructionsCodegenPolicy";

import { getRunInstructionsCodeObjOptions } from "../runInstructionsCodeObjOptions";

import { isRunnableSectionForCustomRun } from "../runInstructionsRunnableCodeBlocks";

import {
  collectRunInstructionsStateMachineControls,
  type RunInstructionsStateMachineControl,
} from "../runInstructionsStateMachineControls";

import {
  AddFromCodeBlocksContent,
  CodegenTargetsContent,
  CustomRunsContent,
  RunSnapshotModeContent,
  WorkflowControlsContent,
} from "./runSnapshotContent";

export type RunnableCodeBlock = {
  sectionId: string;
  name: string;
  depth: number;
};

export type RunnableCodeBlockListingContext = {
  state: ZustandProjectState;
  viewMode: ViewMode;
  isEditingViewMode: boolean;
  outputList: Array<RunnableCodeBlock>;
};

export type RunSnapshotMode = SettingsState["backend"]["runSnapshotMode"];

export type RunSnapshotModeChoice = RunSnapshotMode | "default";

export type RunInstructionsAccordionItem = {
  value: RunInstructionsAccordionItemValue;
  title: string;
  triggerTestId: string;
  content: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
};

export const TOGGLE_ROOT_CLASSES =
  "items-center p-[0.2rem] w-7 min-w-7 h-2.5 bg-setta-400 dark:bg-setta-600 rounded-full relative inline-flex cursor-pointer [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black data-[state='checked']:bg-blue-500 dark:data-[state='checked']:bg-blue-700 focus-visible:ring-2 disabled:pointer-events-none";

export const TOGGLE_THUMB_CLASSES =
  "block w-2.5 h-2.5 bg-white dark:bg-setta-800 rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4 flex";

export const TOGGLE_LABEL_CLASSES =
  "text-[10px] text-setta-500 dark:text-setta-400";

export const PANEL_CARD_CLASSES =
  "mx-[2px] rounded-md bg-setta-100/30 p-2 text-xs dark:bg-setta-900/40";

export const PANEL_ROW_CLASSES =
  "mx-[2px] rounded-md bg-setta-100/30 px-2 py-1 text-xs dark:bg-setta-900/40";

export const PANEL_SELECT_CLASSES =
  "min-w-0 rounded border border-setta-200 bg-white/70 px-2 py-1 text-[11px] text-setta-700 dark:border-setta-800 dark:bg-setta-950/40 dark:text-setta-200";

export const PANEL_COMPACT_SELECT_CLASSES =
  "min-w-0 rounded border border-setta-200 bg-white/70 px-1.5 py-0.5 text-[11px] text-setta-700 disabled:opacity-60 dark:border-setta-800 dark:bg-setta-950/40 dark:text-setta-200";

export const PANEL_ICON_BUTTON_CLASSES =
  "inline-flex h-6 w-6 items-center justify-center rounded text-setta-600 hover:bg-setta-200/40 hover:text-setta-900 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 dark:text-setta-300 dark:hover:bg-setta-800/40 dark:hover:text-setta-100";

export const PANEL_ICON_BUTTON_DESTRUCTIVE_CLASSES =
  "inline-flex h-6 w-6 items-center justify-center rounded text-setta-400 hover:bg-red-500/10 hover:text-red-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-setta-500 dark:hover:text-red-400";

export const RUN_INSTRUCTIONS_INLINE_INSET_CLASS = "pl-[0.375rem] pr-[0.75rem]";

export const CUSTOM_RUN_ROW_CLASSES =
  "mx-[2px] flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md bg-setta-100/30 px-2 py-0.5 text-xs dark:bg-setta-900/40";

export const CUSTOM_RUN_EMPTY_STATE_CLASSES =
  "mx-[2px] rounded-md bg-setta-100/30 px-2 py-1 text-xs text-setta-600 dark:bg-setta-900/40 dark:text-setta-300";

export const WORKFLOW_CONTROL_ROW_CLASSES =
  "mx-[2px] rounded-md bg-setta-100/30 px-2 py-1.5 text-xs dark:bg-setta-900/40";

export const WORKFLOW_CONTROL_BUTTON_CLASSES =
  "inline-flex h-6 items-center rounded px-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45";

export const WORKFLOW_CONTROL_START_BUTTON_CLASSES = `${WORKFLOW_CONTROL_BUTTON_CLASSES} border border-emerald-500/50 bg-emerald-500/15 text-emerald-900 hover:bg-emerald-500/25 dark:border-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-100 dark:hover:bg-emerald-500/30`;

export const WORKFLOW_CONTROL_STOP_BUTTON_CLASSES = `${WORKFLOW_CONTROL_BUTTON_CLASSES} border border-amber-500/50 bg-amber-500/15 text-amber-900 hover:bg-amber-500/25 dark:border-amber-600 dark:bg-amber-500/20 dark:text-amber-100 dark:hover:bg-amber-500/30`;

export const WORKFLOW_CONTROL_RESET_BUTTON_CLASSES = `${WORKFLOW_CONTROL_BUTTON_CLASSES} border border-slate-500/40 bg-slate-500/10 text-slate-900 hover:bg-slate-500/20 dark:border-slate-600 dark:bg-slate-500/15 dark:text-slate-100 dark:hover:bg-slate-500/25`;

export type WorkflowControlAction = "start" | "stop" | "reset";

export type WorkflowControlPresentation = ReturnType<
  typeof getStateMachineNodePresentation
>;

export type WorkflowControlActionConfig = {
  action: WorkflowControlAction;
  label: string;
  className: string;
  isUnavailable: (machineRun: WorkflowControlPresentation) => boolean;
};

export const WORKFLOW_CONTROL_ACTIONS: WorkflowControlActionConfig[] = [
  {
    action: "start",
    label: "Start",
    className: WORKFLOW_CONTROL_START_BUTTON_CLASSES,
    isUnavailable: (machineRun) => machineRun.isRunning,
  },
  {
    action: "stop",
    label: "Stop",
    className: WORKFLOW_CONTROL_STOP_BUTTON_CLASSES,
    isUnavailable: (machineRun) => !machineRun.isRunning,
  },
  {
    action: "reset",
    label: "Reset",
    className: WORKFLOW_CONTROL_RESET_BUTTON_CLASSES,
    isUnavailable: (machineRun) => !machineRun.hasRun,
  },
];

export const RUN_SNAPSHOT_MODE_CHOICES: Array<{
  value: RunSnapshotModeChoice;
  label: string;
  description: string;
}> = [
  {
    value: "default",
    label: "Use Settings",
    description: "Follow the settings default for this project.",
  },
  ...RunSnapshotModeUIConfig.options,
];

export const RUN_INSTRUCTIONS_CODEGEN_POLICY_STYLES: RunInstructionsCodegenPolicyStyles =
  {
    toggleRoot: TOGGLE_ROOT_CLASSES,
    toggleThumb: TOGGLE_THUMB_CLASSES,
    toggleLabel: TOGGLE_LABEL_CLASSES,
    panelCard: PANEL_CARD_CLASSES,
    panelRow: PANEL_ROW_CLASSES,
    panelSelect: PANEL_SELECT_CLASSES,
    panelCompactSelect: PANEL_COMPACT_SELECT_CLASSES,
    panelIconButton: PANEL_ICON_BUTTON_CLASSES,
    panelIconButtonDestructive: PANEL_ICON_BUTTON_DESTRUCTIVE_CLASSES,
  };

export function RunInstructions() {
  const { canRun } = useShareCapabilities();
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const projectConfig = useProjectState((x) => x.projectConfig);
  const projectConfigId = projectConfig.id;
  const runSnapshotModeState = useRunSnapshotModeState(projectConfigId);
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
  const pythonCodegenEnabled = projectConfigHasPythonCodegen(projectConfig);
  const currentPythonTarget = getPythonCodegenTarget(projectConfig);
  const defaultSectionPolicy = React.useMemo(
    () => createSectionCodegenPolicy(),
    [],
  );
  const defaultCodeObjValuePolicy = React.useMemo(
    () => createCodeObjValuePolicy(),
    [],
  );
  const pythonTarget = React.useMemo(
    () => currentPythonTarget ?? createProjectCodegenPythonTarget(),
    [currentPythonTarget],
  );
  const sectionPolicy = pythonTarget.sectionPolicy;
  const codeObjValuePolicy = pythonTarget.codeObjValuePolicy;
  const defaultAllowlist = defaultSectionPolicy.allowlist ?? [];
  const defaultMetaControlAllowlist =
    defaultSectionPolicy.metaControlAllowlist ?? [];
  const [cachedAllowlist, setCachedAllowlist] = React.useState<SectionType[]>(
    sectionPolicy.allowlist ?? defaultAllowlist,
  );
  const [pendingOverrideId, setPendingOverrideId] = React.useState("");
  const [pendingCodeObjOverrideId, setPendingCodeObjOverrideId] =
    React.useState("");
  const sectionOptions = useSectionOptions();
  const codeObjOptions = useCodeObjOptions();
  const sectionOptionsById = React.useMemo(() => {
    const entries = new Map<string, SectionOption>();
    for (const option of sectionOptions) {
      entries.set(option.id, option);
    }
    return entries;
  }, [sectionOptions]);
  const codeObjOptionsById = React.useMemo(() => {
    const entries = new Map<string, RunInstructionsCodeObjOption>();
    for (const option of codeObjOptions) {
      entries.set(option.id, option);
    }
    return entries;
  }, [codeObjOptions]);
  React.useEffect(() => {
    if (!sectionPolicy.allowlist) {
      return;
    }
    setCachedAllowlist((prev) =>
      _.isEqual(prev, sectionPolicy.allowlist) ? prev : sectionPolicy.allowlist,
    );
  }, [sectionPolicy.allowlist]);
  const applyCodegenTargets = (nextTargets: ProjectCodegenTarget[]): void => {
    void callOpenAPI(
      setProjectConfigCodegenTargets({
        body: {
          projectConfigId,
          codegenTargets: nextTargets,
        },
      } as Parameters<typeof setProjectConfigCodegenTargets>[0]),
    ).then((response) => {
      if (!res200(response) || !response.data) {
        return;
      }
      applyProjectCodegenTargetsResponse(response.data);
    });
  };
  const handleCodegenTargetToggle = (checked: boolean): void => {
    if (isDeploymentMode) {
      return;
    }
    const nextTargets = checked
      ? [currentPythonTarget ?? createProjectCodegenPythonTarget()]
      : [];
    applyCodegenTargets(nextTargets);
  };
  const updatePythonTarget = (
    updater: (target: ProjectCodegenPythonTarget) => ProjectCodegenPythonTarget,
  ): void => {
    if (isDeploymentMode || !pythonCodegenEnabled) {
      return;
    }
    const nextTarget = updater(pythonTarget);
    applyCodegenTargets([nextTarget]);
  };
  const updateSectionPolicy = (
    nextPolicy: ProjectCodegenPythonTarget["sectionPolicy"],
  ): void => {
    updatePythonTarget((target) => ({
      ...target,
      sectionPolicy: nextPolicy,
    }));
  };
  const updateCodeObjValuePolicy = (
    nextPolicy: ProjectCodegenPythonTarget["codeObjValuePolicy"],
  ): void => {
    updatePythonTarget((target) => ({
      ...target,
      codeObjValuePolicy: nextPolicy,
    }));
  };
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
    loadStateMachineRuns();
  }, [isDeploymentMode, workflowControls.length]);
  const allowlistEnabled = sectionPolicy.allowlist !== null;
  const allowlist = sectionPolicy.allowlist ?? cachedAllowlist;
  const metaControlAllowlist =
    sectionPolicy.metaControlAllowlist ?? defaultMetaControlAllowlist;
  const availableOverrideSections = sectionOptions
    .filter((option) => !sectionPolicy.sectionOverrides[option.id])
    .sort((a, b) => a.name.localeCompare(b.name));
  const overrideEntries = Object.entries(sectionPolicy.sectionOverrides)
    .map(([sectionId, override]) => {
      const section = sectionOptionsById.get(sectionId) ?? null;
      return {
        sectionId,
        override,
        name: section?.name ?? sectionId,
        type: section?.type ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const availableCodeObjOverrides = codeObjOptions
    .filter((option) => !codeObjValuePolicy.codeObjOverrides[option.id])
    .sort((a, b) => a.label.localeCompare(b.label));
  const codeObjOverrideEntries = Object.entries(
    codeObjValuePolicy.codeObjOverrides,
  )
    .map(([codeObjId, override]) => {
      const codeObj = codeObjOptionsById.get(codeObjId) ?? null;
      return {
        codeObjId,
        override,
        label: codeObj?.label ?? codeObjId,
        type: codeObj?.type ?? null,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  useSelectionAvailabilityReset(
    pendingOverrideId,
    setPendingOverrideId,
    availableOverrideSections.map((option) => option.id),
  );
  useSelectionAvailabilityReset(
    pendingCodeObjOverrideId,
    setPendingCodeObjOverrideId,
    availableCodeObjOverrides.map((option) => option.id),
  );
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
  const accordionItems = buildRunInstructionsAccordionItems({
    projectConfigId,
    isDeploymentMode,
    pythonCodegenEnabled,
    runSnapshotModeState,
    handleCodegenTargetToggle,
    codegenPolicyContent: (
      <RunInstructionsCodegenPolicy
        styles={RUN_INSTRUCTIONS_CODEGEN_POLICY_STYLES}
        isDeploymentMode={isDeploymentMode}
        pythonCodegenEnabled={pythonCodegenEnabled}
        pythonTarget={pythonTarget}
        sectionPolicy={sectionPolicy}
        codeObjValuePolicy={codeObjValuePolicy}
        defaultCodeObjValuePolicy={defaultCodeObjValuePolicy}
        allowlistEnabled={allowlistEnabled}
        allowlist={allowlist}
        metaControlAllowlist={metaControlAllowlist}
        pendingOverrideId={pendingOverrideId}
        pendingCodeObjOverrideId={pendingCodeObjOverrideId}
        availableOverrideSections={availableOverrideSections}
        overrideEntries={overrideEntries}
        availableCodeObjOverrides={availableCodeObjOverrides}
        codeObjOverrideEntries={codeObjOverrideEntries}
        sectionOptionsById={sectionOptionsById}
        codeObjOptionsById={codeObjOptionsById}
        setPendingOverrideId={setPendingOverrideId}
        setPendingCodeObjOverrideId={setPendingCodeObjOverrideId}
        updatePythonTarget={updatePythonTarget}
        updateSectionPolicy={updateSectionPolicy}
        updateCodeObjValuePolicy={updateCodeObjValuePolicy}
      />
    ),
    workflowControls,
    customRuns,
    runMode,
    continuousRunStarted,
    continuousRunCustomRunId,
    runnableCodeBlocks,
  });
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

export function WorkflowControlRow({
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
  const [pendingAction, setPendingAction] =
    React.useState<WorkflowControlAction | null>(null);
  const activityLabel = getWorkflowControlActivityLabel(machineRun);
  const controlsDisabled = pendingAction !== null || isDeploymentMode;
  async function handleActionClick(
    action: WorkflowControlAction,
  ): Promise<void> {
    setPendingAction(action);
    try {
      await runWorkflowControlAction(workflow, action);
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
          className={`mt-1 truncate text-[10px] ${getWorkflowControlActivityToneClasses(machineRun)}`}
        >
          {activityLabel}
        </p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {WORKFLOW_CONTROL_ACTIONS.map((action) => (
          <button
            key={action.action}
            className={action.className}
            data-testid={`run-instructions-workflow-${action.action}-${workflow.sectionId}`}
            disabled={controlsDisabled || action.isUnavailable(machineRun)}
            onClick={() => {
              void handleActionClick(action.action);
            }}
            type="button"
          >
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function CustomRunRow({
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

export function AddCodeBlockRow({
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

export function useRunnableCodeBlockListing() {
  return useProjectState((x) => {
    const outputList: Array<RunnableCodeBlock> = [];
    const viewMode = getActiveViewModeConfig(x);
    const listingContext: RunnableCodeBlockListingContext = {
      state: x,
      viewMode,
      isEditingViewMode: x.projectConfig.isEditingViewMode,
      outputList,
    };
    for (const sectionId of Object.keys(x.projectConfig.topLevelSections)) {
      const sectionImpl = getCurrEffectiveSectionImpl(x, sectionId);
      const sectionCore = getSectionCore(x, sectionId);
      getRunnableCodeBlockListingHelper(
        sectionCore,
        sectionImpl,
        0,
        listingContext,
      );
    }
    return outputList;
  }, _.isEqual);
}

export function useSectionOptions(): RunInstructionsSectionOption[] {
  return useProjectState((x) => {
    const outputList: Array<RunInstructionsSectionOption> = [];
    for (const [sectionId, section] of Object.entries(x.sections)) {
      const sectionImpl = getCurrEffectiveSectionImpl(x, sectionId);
      outputList.push({
        id: sectionId,
        name: section.name,
        type: sectionImpl.type,
      });
    }
    outputList.sort((a, b) => a.name.localeCompare(b.name));
    return outputList;
  }, _.isEqual);
}

export function useCodeObjOptions(): RunInstructionsCodeObjOption[] {
  return useProjectState(getRunInstructionsCodeObjOptions, _.isEqual);
}

export function getRunnableCodeBlockListingHelper(
  section: Core,
  sectionImpl: BaseSectionImplUnion,
  depth: number,
  context: RunnableCodeBlockListingContext,
) {
  const { state, viewMode, isEditingViewMode, outputList } = context;
  const isRunnable = isRunnableSectionForCustomRun(
    state.sectionCapabilities[section.id],
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
    for (const childId of getSectionImplChildren(sectionImpl)) {
      const childSection = state.sections[childId];
      if (!childSection) {
        continue;
      }
      const childImpl = getCurrEffectiveSectionImpl(state, childId);
      getRunnableCodeBlockListingHelper(
        childSection,
        childImpl,
        depth + 1,
        context,
      );
    }
  }
}

export function getWorkflowControlActivityLabel(
  machineRun: WorkflowControlPresentation,
): string | null {
  return (
    machineRun.failureSummaryLabel ?? machineRun.activityItems[0]?.label ?? null
  );
}

export function getWorkflowControlActivityToneClasses(
  machineRun: WorkflowControlPresentation,
): string {
  return machineRun.failureSummaryLabel
    ? "text-rose-700 dark:text-rose-300"
    : "text-setta-500 dark:text-setta-300";
}

export async function runWorkflowControlAction(
  workflow: RunInstructionsStateMachineControl,
  action: WorkflowControlAction,
): Promise<void> {
  if (action === "start") {
    await startStateMachineRun(workflow.machineGroupId, workflow.sectionId);
    return;
  }
  if (action === "stop") {
    await stopStateMachineRun(workflow.machineGroupId);
    return;
  }
  await resetStateMachineRun(workflow.machineGroupId);
}

export function useRunSnapshotModeState(projectConfigId: string) {
  const runSnapshotModeOverride = useLocalStorage(
    (state) => state.runSnapshotModeByProjectConfigId[projectConfigId],
  );
  const settingsRunSnapshotMode = useSettings(
    (state) => state.backend.runSnapshotMode,
  );
  const runSnapshotMode = runSnapshotModeOverride ?? settingsRunSnapshotMode;
  const selectedRunSnapshotMode: RunSnapshotModeChoice =
    runSnapshotModeOverride ?? "default";
  const runSnapshotModeMeta =
    RunSnapshotModeUIConfig.options.find(
      (option) => option.value === runSnapshotMode,
    ) ?? RunSnapshotModeUIConfig.options[0];
  const runSnapshotModePrefix = runSnapshotModeOverride
    ? "Override for this project."
    : "Using settings default.";
  const handleRunSnapshotModeChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>): void => {
      const nextValue = event.target.value as RunSnapshotModeChoice;
      if (nextValue === selectedRunSnapshotMode) {
        return;
      }
      if (nextValue === "default") {
        useLocalStorage.setState((state) => {
          const nextOverrides = {
            ...state.runSnapshotModeByProjectConfigId,
          };
          delete nextOverrides[projectConfigId];
          return { runSnapshotModeByProjectConfigId: nextOverrides };
        });
        return;
      }
      useLocalStorage.setState((state) => ({
        runSnapshotModeByProjectConfigId: {
          ...state.runSnapshotModeByProjectConfigId,
          [projectConfigId]: nextValue,
        },
      }));
    },
    [projectConfigId, selectedRunSnapshotMode],
  );

  return {
    selectedRunSnapshotMode,
    runSnapshotModeMeta,
    runSnapshotModePrefix,
    handleRunSnapshotModeChange,
  };
}

export function useSelectionAvailabilityReset(
  pendingId: string,
  setPendingId: React.Dispatch<React.SetStateAction<string>>,
  availableIds: readonly string[],
) {
  React.useEffect(() => {
    if (!pendingId || availableIds.includes(pendingId)) {
      return;
    }
    setPendingId("");
  }, [availableIds, pendingId, setPendingId]);
}

export function buildRunInstructionsAccordionItems({
  projectConfigId,
  isDeploymentMode,
  pythonCodegenEnabled,
  runSnapshotModeState,
  handleCodegenTargetToggle,
  codegenPolicyContent,
  workflowControls,
  customRuns,
  runMode,
  continuousRunStarted,
  continuousRunCustomRunId,
  runnableCodeBlocks,
}: {
  projectConfigId: string;
  isDeploymentMode: boolean;
  pythonCodegenEnabled: boolean;
  runSnapshotModeState: ReturnType<typeof useRunSnapshotModeState>;
  handleCodegenTargetToggle: (checked: boolean) => void;
  codegenPolicyContent: React.ReactNode;
  workflowControls: RunInstructionsStateMachineControl[];
  customRuns: CustomRunItem[];
  runMode: string;
  continuousRunStarted: boolean;
  continuousRunCustomRunId: string | null;
  runnableCodeBlocks: RunnableCodeBlock[];
}): RunInstructionsAccordionItem[] {
  const accordionItems: RunInstructionsAccordionItem[] = [];

  if (!isDeploymentMode) {
    accordionItems.push(
      {
        value: "run-instructions-run-snapshot-mode",
        title: "Run Snapshot Mode",
        triggerTestId: "run-instructions-accordion-run-snapshot-mode",
        content: <RunSnapshotModeContent state={runSnapshotModeState} />,
      },
      {
        value: "run-instructions-codegen-targets",
        title: "Codegen Targets",
        triggerTestId: "run-instructions-accordion-codegen-targets",
        content: (
          <CodegenTargetsContent
            pythonCodegenEnabled={pythonCodegenEnabled}
            onCheckedChange={handleCodegenTargetToggle}
          />
        ),
      },
    );
  }

  accordionItems.push(
    {
      value: "run-instructions-codegen-policy",
      title: "Codegen Policy",
      triggerTestId: "run-instructions-accordion-codegen-policy",
      content: codegenPolicyContent,
    },
    {
      value: "run-instructions-workflow-controls",
      title: "Workflow Controls",
      triggerTestId: "run-instructions-accordion-workflow-controls",
      disabled: workflowControls.length === 0,
      disabledReason: "No workflow start sections are available",
      content: (
        <WorkflowControlsContent
          workflowControls={workflowControls}
          projectConfigId={projectConfigId}
        />
      ),
    },
    {
      value: "run-instructions-custom-runs",
      title: "Run Button Dropdown Items",
      triggerTestId: "run-instructions-accordion-custom-runs",
      content: (
        <CustomRunsContent
          customRuns={customRuns}
          projectConfigId={projectConfigId}
          runMode={runMode}
          continuousRunStarted={continuousRunStarted}
          continuousRunCustomRunId={continuousRunCustomRunId}
        />
      ),
    },
    {
      value: "run-instructions-add-from-code-blocks",
      title: "Add From Code Blocks",
      triggerTestId: "run-instructions-accordion-add-from-code-blocks",
      disabled: runnableCodeBlocks.length === 0,
      disabledReason: "No runnable code blocks are available",
      content: (
        <AddFromCodeBlocksContent
          projectConfigId={projectConfigId}
          runnableCodeBlocks={runnableCodeBlocks}
        />
      ),
    },
  );

  return accordionItems;
}
