import * as Switch from "@radix-ui/react-switch";

import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";

import { CustomRunItem } from "state/definitions";

import { type RunInstructionsStateMachineControl } from "./runInstructionsStateMachineControls";

import {
  AddCodeBlockRow,
  CUSTOM_RUN_EMPTY_STATE_CLASSES,
  CustomRunRow,
  PANEL_ROW_CLASSES,
  PANEL_SELECT_CLASSES,
  RUN_SNAPSHOT_MODE_CHOICES,
  RunnableCodeBlock,
  TOGGLE_LABEL_CLASSES,
  TOGGLE_ROOT_CLASSES,
  TOGGLE_THUMB_CLASSES,
  useRunSnapshotModeState,
  WorkflowControlRow,
} from "./runInstructions";

export function RunSnapshotModeContent({
  state,
}: {
  state: ReturnType<typeof useRunSnapshotModeState>;
}) {
  return (
    <div className={`${PANEL_ROW_CLASSES} flex min-w-0 flex-col gap-2`}>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-setta-600 dark:text-setta-300">
          {state.runSnapshotModeMeta.description}
        </div>
        <div className="text-[11px] text-setta-400 dark:text-setta-500">
          {state.runSnapshotModePrefix}
        </div>
      </div>
      <select
        className={`${PANEL_SELECT_CLASSES} w-full`}
        value={state.selectedRunSnapshotMode}
        onChange={state.handleRunSnapshotModeChange}
        {...getFloatingBoxHandlers({
          content: "Run snapshot mode",
        })}
      >
        {RUN_SNAPSHOT_MODE_CHOICES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CodegenTargetsContent({
  pythonCodegenEnabled,
  onCheckedChange,
}: {
  pythonCodegenEnabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className={`${PANEL_ROW_CLASSES} flex min-w-0 flex-col gap-2`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-setta-600 dark:text-setta-300">
            Enable generated code sections for this project.
          </div>
        </div>
        <div
          className="ml-auto flex items-center gap-1"
          data-setting-anchor="core.run_instructions.python_codegen_enabled"
        >
          <span className={TOGGLE_LABEL_CLASSES}>Python</span>
          <Switch.Root
            className={TOGGLE_ROOT_CLASSES}
            checked={pythonCodegenEnabled}
            data-testid="run-instructions-python-codegen-toggle"
            onCheckedChange={onCheckedChange}
          >
            <Switch.Thumb className={TOGGLE_THUMB_CLASSES} />
          </Switch.Root>
        </div>
      </div>
    </div>
  );
}

export function WorkflowControlsContent({
  workflowControls,
  projectConfigId,
}: {
  workflowControls: RunInstructionsStateMachineControl[];
  projectConfigId: string;
}) {
  return (
    <div className="space-y-1">
      {workflowControls.map((workflow) => (
        <WorkflowControlRow
          key={workflow.sectionId}
          workflow={workflow}
          projectConfigId={projectConfigId}
        />
      ))}
    </div>
  );
}

export function CustomRunsContent({
  customRuns,
  projectConfigId,
  runMode,
  continuousRunStarted,
  continuousRunCustomRunId,
}: {
  customRuns: CustomRunItem[];
  projectConfigId: string;
  runMode: string;
  continuousRunStarted: boolean;
  continuousRunCustomRunId: string | null;
}) {
  if (customRuns.length === 0) {
    return (
      <div className={CUSTOM_RUN_EMPTY_STATE_CLASSES}>No custom runs yet.</div>
    );
  }

  return (
    <div className="space-y-0.5">
      {customRuns.map((run) => (
        <CustomRunRow
          key={run.id}
          run={run}
          projectConfigId={projectConfigId}
          isActiveContinuousRun={
            runMode === "continuous" &&
            continuousRunStarted &&
            continuousRunCustomRunId === run.id
          }
        />
      ))}
    </div>
  );
}

export function AddFromCodeBlocksContent({
  projectConfigId,
  runnableCodeBlocks,
}: {
  projectConfigId: string;
  runnableCodeBlocks: RunnableCodeBlock[];
}) {
  return (
    <div className="space-y-1">
      {runnableCodeBlocks.map((item) => (
        <AddCodeBlockRow
          key={item.sectionId}
          projectConfigId={projectConfigId}
          item={item}
        />
      ))}
    </div>
  );
}
