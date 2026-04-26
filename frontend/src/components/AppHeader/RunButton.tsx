import * as Menubar from "@radix-ui/react-menubar";
import { resolveMainRunRequest } from "@setta/app-subsystem-frontend-sdk";
import { onOverviewTabClick } from "components/Panes/paneFns";
import { NavbarMenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { type ReactNode, useEffect } from "react";
import {
  RiArrowDownSLine,
  RiLoopRightFill,
  RiPlayList2Fill,
  RiPlayMiniFill,
} from "react-icons/ri";
import {
  ensureDefaultCustomRuns,
  runContinuousTick,
  runCustomRun,
} from "state/actions/customRuns";
import { runFromMainRunButton } from "state/actions/runOrImportCode";
import {
  type CustomRunItem,
  useLocalStorage,
  usePendingOperations,
  useProjectState,
  useRunControl,
} from "state/definitions";
import { OverviewTabNameEnum } from "utils/constants";

type RunModeOption = {
  label: string;
  mode: "once" | "continuous";
};

const BASE_CLASSES =
  "relative transition-colors text-xs font-semibold h-full rounded-md gap-1 select-none flex items-center";
const IDLE_BUTTON_CLASSES =
  "bg-transparent text-setta-700 dark:text-setta-100 hover:bg-setta-100 dark:hover:bg-setta-800 active:!bg-blue-800 active:!text-white active:dark:!bg-blue-800";
const ACTIVE_BUTTON_CLASSES =
  "bg-blue-800 text-white hover:bg-blue-700 dark:bg-blue-800 dark:text-white dark:hover:bg-blue-700";
const DISABLED_BUTTON_CLASSES =
  "cursor-not-allowed opacity-60 hover:bg-transparent dark:hover:bg-transparent";
const MENU_ITEM_CLASSES =
  "flex items-center gap-2 px-1.5 py-1.5 text-xs text-setta-700 dark:text-setta-200  mx-1 rounded-md text-left hover:bg-setta-600 hover:text-white dark:hover:bg-setta-900 dark:hover:text-white active:bg-blue-100 active:dark:bg-blue-950 cursor-pointer";
const INACTIVE_DROPDOWN_TRIGGER_CLASSES =
  "text-setta-700 dark:text-setta-200 hover:bg-setta-100 dark:hover:bg-setta-800 active:bg-blue-100 active:dark:bg-blue-950";
const RUN_MODE_OPTIONS: RunModeOption[] = [
  { label: "Run once", mode: "once" },
  { label: "Continuous run", mode: "continuous" },
];

function useDefaultCustomRuns(projectConfigId: string) {
  useEffect(() => {
    ensureDefaultCustomRuns(projectConfigId);
  }, [projectConfigId]);
}

function useContinuousRunPendingTick() {
  useEffect(() => {
    const unsubscribe = usePendingOperations.subscribe((state, prevState) => {
      const nextLen = state.pending.length;
      const prevLen = prevState.pending.length;
      if (prevLen === 0 || nextLen !== 0) {
        return;
      }
      const { runMode, continuousRunStarted } = useRunControl.getState();
      if (runMode !== "continuous" || !continuousRunStarted) {
        return;
      }
      void runContinuousTick();
    });

    return unsubscribe;
  }, []);
}

function setRunMode(mode: RunModeOption["mode"]) {
  useRunControl.setState({
    runMode: mode,
    continuousRunStarted: false,
    continuousRunCustomRunId: null,
  });
}

function renderRunModeIcon(mode: RunModeOption["mode"]) {
  return mode === "continuous" ? <RiLoopRightFill /> : <RiPlayMiniFill />;
}

function getMainRunTooltip(
  canRunFromMain: boolean,
  disabledReason: string | null,
) {
  if (canRunFromMain) {
    return "Run your code.";
  }
  return disabledReason ?? "Run is unavailable.";
}

function getBorderShellClassName(isContinuousActive: boolean) {
  return isContinuousActive
    ? "setta-gradient-border-shell setta-animated-gradient-border"
    : "setta-gradient-border-shell";
}

function getMainButtonClassName(
  isContinuousActive: boolean,
  canRunFromMain: boolean,
) {
  const interactionClassName = canRunFromMain
    ? "cursor-pointer"
    : DISABLED_BUTTON_CLASSES;

  return `nodrag inline-flex items-center focus-visible:ring-2 ${BASE_CLASSES} ${
    isContinuousActive ? ACTIVE_BUTTON_CLASSES : IDLE_BUTTON_CLASSES
  } ${interactionClassName} rounded-r-none px-2`;
}

function getDropdownTriggerClassName(isContinuousActive: boolean) {
  return `nodrag flex cursor-pointer select-none items-center justify-between gap-1 rounded-r-md py-1 px-1 text-xs font-semibold leading-none outline-none transition-colors duration-150 focus-visible:ring-2 ${
    isContinuousActive
      ? ACTIVE_BUTTON_CLASSES
      : INACTIVE_DROPDOWN_TRIGGER_CLASSES
  }`;
}

function getMenuSelectionClassName(isSelected: boolean) {
  return isSelected
    ? "text-blue-500 opacity-100 group-data-[highlighted]:text-white"
    : "";
}

function RunModeMenuItem({
  icon,
  isSelected,
  label,
  onClick,
}: {
  icon: ReactNode;
  isSelected: boolean;
  label: string;
  onClick: () => void;
}) {
  const selectedClassName = getMenuSelectionClassName(isSelected);

  return (
    <MenuItem className={MENU_ITEM_CLASSES} onClick={onClick}>
      <i className={`w-3 opacity-70 ${selectedClassName}`}>{icon}</i>
      <span className={`ml-0.5 ${selectedClassName}`}>{label}</span>
    </MenuItem>
  );
}

function CustomRunMenuItems({
  dropdownRuns,
  projectConfigId,
}: {
  dropdownRuns: CustomRunItem[];
  projectConfigId: string;
}) {
  if (dropdownRuns.length === 0) {
    return null;
  }

  return (
    <>
      <Menubar.Separator className="mx-2 my-1 h-px bg-setta-100 dark:bg-setta-700/60" />
      {dropdownRuns.map((run) => (
        <MenuItem
          key={run.id}
          className={MENU_ITEM_CLASSES}
          onClick={() => {
            void runCustomRun(projectConfigId, run.id);
          }}
        >
          <i className="w-3 opacity-80">{renderRunModeIcon(run.runMode)}</i>
          <span className="ml-0.5">{run.name}</span>
        </MenuItem>
      ))}
    </>
  );
}

function RunButtonDropdown({
  dropdownRuns,
  isContinuousActive,
  projectConfigId,
  runMode,
}: {
  dropdownRuns: CustomRunItem[];
  isContinuousActive: boolean;
  projectConfigId: string;
  runMode: RunModeOption["mode"];
}) {
  return (
    <NavbarMenuDropdown
      triggerClassName={getDropdownTriggerClassName(isContinuousActive)}
      trigger={<RiArrowDownSLine />}
    >
      {/*
      We don't use a checkmark indicator; the active mode is shown via blue text/icon.
      Blue is overridden to white on hover to keep menu highlight consistent.
    */}
      {RUN_MODE_OPTIONS.map((option) => (
        <RunModeMenuItem
          key={option.mode}
          icon={renderRunModeIcon(option.mode)}
          isSelected={runMode === option.mode}
          label={option.label}
          onClick={() => {
            setRunMode(option.mode);
          }}
        />
      ))}

      <Menubar.Separator className="mx-2 my-1 h-px bg-setta-100 dark:bg-setta-700/60" />
      <MenuItem
        className={MENU_ITEM_CLASSES}
        onClick={() => onOverviewTabClick(OverviewTabNameEnum.RunInstructions)}
      >
        <i className="w-3 opacity-80">
          <RiPlayList2Fill />
        </i>
        <span className="ml-0.5">Custom Runs...</span>
      </MenuItem>

      <CustomRunMenuItems
        dropdownRuns={dropdownRuns}
        projectConfigId={projectConfigId}
      />
    </NavbarMenuDropdown>
  );
}

export function RunButton() {
  const runMode = useRunControl((x) => x.runMode);
  const continuousRunStarted = useRunControl((x) => x.continuousRunStarted);
  const projectConfig = useProjectState((x) => x.projectConfig);
  const canRunFromMain = useProjectState(
    (state) => resolveMainRunRequest(state).canRun,
  );
  const mainRunDisabledReason = useProjectState(
    (state) => resolveMainRunRequest(state).disabledReason,
  );
  const projectConfigId = projectConfig.id;
  const customRuns = useLocalStorage(
    (x) => x.customRunsByProjectConfigId[projectConfigId] ?? [],
  );
  const dropdownRuns = customRuns.filter((x) => x.includeInRunDropdown);
  const isContinuous = runMode === "continuous";
  const isContinuousActive = isContinuous && continuousRunStarted;
  const mainIcon = renderRunModeIcon(runMode);
  const tooltipContent = getMainRunTooltip(
    canRunFromMain,
    mainRunDisabledReason,
  );

  useDefaultCustomRuns(projectConfigId);
  useContinuousRunPendingTick();

  return (
    <div className={getBorderShellClassName(isContinuousActive)}>
      <div className="flex justify-stretch">
        <button
          onClick={runFromMainRunButton}
          className={getMainButtonClassName(isContinuousActive, canRunFromMain)}
          disabled={!canRunFromMain}
          {...getFloatingBoxHandlers({ content: tooltipContent })}
        >
          {mainIcon}
          Run
        </button>
        <RunButtonDropdown
          dropdownRuns={dropdownRuns}
          isContinuousActive={isContinuousActive}
          projectConfigId={projectConfigId}
          runMode={runMode}
        />
      </div>
    </div>
  );
}
