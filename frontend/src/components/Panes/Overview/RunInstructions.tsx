import * as Switch from "@radix-ui/react-switch";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
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
import {
  getActiveViewModeConfig,
  getCurrEffectiveSectionImpl,
  getSectionCore,
  getSectionShouldRender,
} from "state/actions/sectionInfos";
import {
  CustomRunItem,
  useAllProjectMetadata,
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
import { route_set_project_config_codegen_targets } from "utils/generatedEndpoints";
import {
  isBaseParentSectionImpl,
  createProjectCodegenPythonTarget,
  ProjectCodegenLanguageEnum,
  SectionTypeEnum,
  type BaseSectionImplUnion,
  type Core,
  type SettingsState,
  type ViewModeConfig,
} from "utils/generatedTypes";

type RunnableCodeBlock = { sectionId: string; name: string; depth: number };
type RunSnapshotMode = SettingsState["backend"]["runSnapshotMode"];
type RunSnapshotModeChoice = RunSnapshotMode | "default";

const TOGGLE_ROOT_CLASSES =
  "items-center p-[0.2rem] w-7 min-w-7 h-2.5 bg-setta-400 dark:bg-setta-600 rounded-full relative inline-flex cursor-pointer [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black data-[state='checked']:bg-blue-500 dark:data-[state='checked']:bg-blue-700 focus-visible:ring-2 disabled:pointer-events-none";
const TOGGLE_THUMB_CLASSES =
  "block w-2.5 h-2.5 bg-white dark:bg-setta-800 rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4 flex";
const TOGGLE_LABEL_CLASSES = "text-[10px] text-setta-500 dark:text-setta-400";

const RUN_SNAPSHOT_MODE_OPTIONS: Array<{
  value: RunSnapshotMode;
  label: string;
  description: string;
}> = [
  {
    value: "ephemeral",
    label: "Ephemeral",
    description: "Snapshot per run, cleaned up automatically.",
  },
  {
    value: "always",
    label: "Always",
    description: "Snapshot per run, stored under code history.",
  },
  {
    value: "never",
    label: "Never",
    description: "Run from canonical files without a snapshot.",
  },
];
const RUN_SNAPSHOT_MODE_CHOICES: Array<{
  value: RunSnapshotModeChoice;
  label: string;
  description: string;
}> = [
  {
    value: "default",
    label: "Use Settings",
    description: "Follow the settings default for this project.",
  },
  ...RUN_SNAPSHOT_MODE_OPTIONS,
];

export function RunInstructions() {
  const { canRun } = useShareCapabilities();
  const isShareMode = useShareSession((x) => x.isShareMode);
  const projectConfig = useProjectState((x) => x.projectConfig);
  const projectConfigId = projectConfig.id;
  const runSnapshotModeOverride = useLocalStorage(
    (x) => x.runSnapshotModeByProjectConfigId[projectConfigId],
  );
  const settingsRunSnapshotMode = useSettings((x) => x.backend.runSnapshotMode);
  const runSnapshotMode = runSnapshotModeOverride ?? settingsRunSnapshotMode;
  const selectedRunSnapshotMode: RunSnapshotModeChoice = runSnapshotModeOverride
    ? runSnapshotModeOverride
    : "default";
  const customRuns = useLocalStorage(
    (x) => x.customRunsByProjectConfigId[projectConfigId] ?? [],
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
  const nonPythonTargets = projectConfig.codegenTargets.filter(
    (target) => target.language !== ProjectCodegenLanguageEnum.python,
  );

  const handleCodegenTargetToggle = (checked: boolean): void => {
    if (isShareMode) {
      return;
    }
    const nextTargets = checked
      ? [
          ...nonPythonTargets,
          currentPythonTarget ?? createProjectCodegenPythonTarget(),
        ]
      : nonPythonTargets;
    void route_set_project_config_codegen_targets({
      projectConfigId,
      codegenTargets: nextTargets,
    });
    useAllProjectMetadata.setState((state) => ({
      ...state,
      projectMetadata: state.projectMetadata.map((entry) =>
        entry.id === projectConfigId
          ? { ...entry, codegenTargets: nextTargets }
          : entry,
      ),
    }));
    useProjectState.setState((state) => {
      state.projectConfig.codegenTargets = nextTargets;
    });
  };

  React.useEffect(() => {
    if (!canRun) {
      return;
    }
    ensureDefaultCustomRuns(projectConfigId);
  }, [projectConfigId, canRun]);

  if (!canRun) {
    return (
      <div className="mx-[2px] rounded border border-dashed border-setta-200 bg-white/40 p-3 text-xs text-setta-600 dark:border-setta-800 dark:bg-setta-900/40 dark:text-setta-300">
        Run controls are disabled in sharing mode.
      </div>
    );
  }

  const runSnapshotModeMeta =
    RUN_SNAPSHOT_MODE_OPTIONS.find(
      (option) => option.value === runSnapshotMode,
    ) ?? RUN_SNAPSHOT_MODE_OPTIONS[0];
  let runSnapshotModePrefix = "Using settings default.";
  if (runSnapshotModeOverride) {
    runSnapshotModePrefix = "Override for this project.";
  }

  const handleRunSnapshotModeChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ): void => {
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
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="mx-[2px] text-xs text-setta-500 dark:text-setta-300">
        Define custom run types (once or continuous) and choose which ones
        appear in the main Run dropdown.
      </p>
      {!isShareMode && (
        <div className="mx-[2px] flex items-center gap-2 rounded border border-setta-100 bg-white/40 px-2 py-1 text-xs dark:border-setta-800 dark:bg-setta-900/40">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-tight text-setta-400 dark:text-setta-500">
              Run Snapshot Mode
            </div>
            <div className="text-[11px] text-setta-600 dark:text-setta-300">
              {runSnapshotModeMeta.description}
            </div>
            <div className="text-[11px] text-setta-400 dark:text-setta-500">
              {runSnapshotModePrefix}
            </div>
          </div>
          <select
            className="rounded border border-setta-200 bg-transparent px-2 py-1 text-[11px] text-setta-700 dark:border-setta-800 dark:text-setta-200"
            value={selectedRunSnapshotMode}
            onChange={handleRunSnapshotModeChange}
            {...getFloatingBoxHandlers({ content: "Run snapshot mode" })}
          >
            {RUN_SNAPSHOT_MODE_CHOICES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {!isShareMode && (
        <div className="mx-[2px] flex items-center gap-2 rounded border border-setta-100 bg-white/40 px-2 py-1 text-xs dark:border-setta-800 dark:bg-setta-900/40">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-tight text-setta-400 dark:text-setta-500">
              Codegen Targets
            </div>
            <div className="text-[11px] text-setta-600 dark:text-setta-300">
              Enable generated code sections for this project.
            </div>
          </div>
          <div className="ml-2 flex items-center gap-1">
            <span className={TOGGLE_LABEL_CLASSES}>Python</span>
            <Switch.Root
              className={TOGGLE_ROOT_CLASSES}
              checked={pythonCodegenEnabled}
              disabled={isShareMode}
              onCheckedChange={handleCodegenTargetToggle}
            >
              <Switch.Thumb className={TOGGLE_THUMB_CLASSES} />
            </Switch.Root>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <h3 className="mb-1 px-1 text-[11px] font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500">
          Run Button Dropdown Items
        </h3>
        {customRuns.length === 0 ? (
          <div className="mx-[2px] rounded border border-setta-100 bg-white/40 p-2 text-xs text-setta-600 dark:border-setta-800 dark:bg-setta-900/40 dark:text-setta-300">
            No custom runs yet.
          </div>
        ) : (
          <div className="space-y-1">
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
        )}

        <h3 className="mb-1 mt-4 px-1 text-[11px] font-bold uppercase tracking-tight text-setta-300 dark:text-setta-500">
          Add From Code Blocks
        </h3>
        <div className="space-y-1">
          {runnableCodeBlocks.map((item) => (
            <AddCodeBlockRow
              key={item.sectionId}
              projectConfigId={projectConfigId}
              item={item}
            />
          ))}
        </div>
      </div>
    </div>
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
    <div className="mx-[2px] flex items-center gap-2 rounded border border-setta-100 bg-white/40 px-2 py-1 text-xs dark:border-setta-800 dark:bg-setta-900/40">
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
        className="rounded border border-setta-200 bg-transparent px-1 py-0.5 text-[11px] text-setta-700 dark:border-setta-800 dark:text-setta-200"
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
        className="inline-flex h-6 w-6 items-center justify-center rounded text-setta-400 hover:bg-red-500/10 hover:text-red-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-setta-500 dark:hover:text-red-400"
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
      className="mx-[2px] flex items-center gap-2 rounded border border-setta-100 bg-white/40 px-2 py-1 text-xs dark:border-setta-800 dark:bg-setta-900/40"
      style={{ marginLeft: `${0.5 * item.depth}rem` }}
    >
      <button
        className="inline-flex h-6 w-6 items-center justify-center rounded text-setta-600 hover:bg-setta-200/40 hover:text-setta-900 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-setta-300 dark:hover:bg-setta-800/40 dark:hover:text-setta-100"
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
  const isRunnable =
    sectionImpl.type === SectionTypeEnum.Code ||
    (pythonCodegenEnabled &&
      sectionImpl.type === SectionTypeEnum.GenPythonCode);

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
