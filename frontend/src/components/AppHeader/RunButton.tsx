import * as Menubar from "@radix-ui/react-menubar";
import { onOverviewTabClick } from "components/Panes/paneFns";
import { NavbarMenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { useEffect } from "react";
import {
  RiArrowDownSLine,
  RiLoopRightFill,
  RiPlayList2Fill,
  RiPlayMiniFill,
} from "react-icons/ri";
import {
  runContinuousTick,
  runCustomRun,
} from "state/actions/customRunExecution";
import { getCustomRunDropdownRuns } from "state/actions/customRunQueries";
import { ensureDefaultCustomRuns } from "state/actions/customRunStorage";
import { runFromMainRunButton } from "state/actions/runCodeControls";
import { usePendingOperations, useProjectState } from "state/definitions";
import { useRunControl } from "state/stores/projectStatusStores";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { projectConfigHasPythonCodegen } from "utils/codegenTargets";
import { OverviewTabNameEnum } from "utils/constants";

export function RunButton() {
  const runMode = useRunControl((x) => x.runMode);
  const continuousRunStarted = useRunControl((x) => x.continuousRunStarted);
  const projectConfig = useProjectState((x) => x.projectConfig);
  const genPythonSectionId = useProjectState(
    (x) => x.singletonSections.GenPythonCode,
  );
  const projectConfigId = projectConfig.id;
  const pythonCodegenEnabled = projectConfigHasPythonCodegen(projectConfig);
  const entryCodeBlockId = projectConfig.entryCodeBlockId;
  const entryIsGenPython =
    entryCodeBlockId !== null && entryCodeBlockId === genPythonSectionId;
  const canRunFromMain =
    pythonCodegenEnabled || (Boolean(entryCodeBlockId) && !entryIsGenPython);
  const customRuns = useLocalStorage(
    (x) => x.customRunsByProjectConfigId[projectConfigId] ?? [],
  );
  const dropdownRuns = getCustomRunDropdownRuns(customRuns);
  const isContinuous = runMode === "continuous";
  const isContinuousActive = isContinuous && continuousRunStarted;
  const mainIcon =
    runMode === "continuous" ? <RiLoopRightFill /> : <RiPlayMiniFill />;

  const baseClasses =
    "relative transition-colors text-xs font-semibold h-full rounded-md gap-1 select-none flex items-center";

  const idleButtonClasses =
    "bg-transparent text-setta-700 dark:text-setta-100 hover:bg-setta-100 dark:hover:bg-setta-800 active:!bg-blue-800 active:!text-white active:dark:!bg-blue-800";

  const activeButtonClasses =
    "bg-blue-800 text-white hover:bg-blue-700 dark:bg-blue-800 dark:text-white dark:hover:bg-blue-700";
  const disabledButtonClasses =
    "cursor-not-allowed opacity-60 hover:bg-transparent dark:hover:bg-transparent";

  // Menu item styling with proper hover effect that's contained within the button
  const menuItemClasses =
    "flex items-center gap-2 px-1.5 py-1.5 text-xs text-setta-700 dark:text-setta-200  mx-1 rounded-md text-left hover:bg-setta-600 hover:text-white dark:hover:bg-setta-900 dark:hover:text-white active:bg-blue-100 active:dark:bg-blue-950 cursor-pointer";

  useEffect(() => {
    ensureDefaultCustomRuns(projectConfigId);
  }, [projectConfigId]);

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

  return (
    <div
      className={`setta-gradient-border-shell ${
        isContinuousActive ? "setta-animated-gradient-border" : ""
      }`}
    >
      <div className="flex justify-stretch">
        <button
          onClick={runFromMainRunButton}
          className={`nodrag inline-flex items-center focus-visible:ring-2 ${baseClasses} ${
            isContinuousActive ? activeButtonClasses : idleButtonClasses
          } ${canRunFromMain ? "cursor-pointer" : disabledButtonClasses} rounded-r-none px-2`}
          disabled={!canRunFromMain}
          {...getFloatingBoxHandlers({
            content: canRunFromMain
              ? "Run your code."
              : "Select a manual entry code block to run.",
          })}
        >
          {mainIcon}
          Run
        </button>
        <NavbarMenuDropdown
          triggerClassName={`nodrag flex cursor-pointer select-none items-center justify-between gap-1 rounded-r-md py-1 px-1 text-xs font-semibold leading-none outline-none transition-colors duration-150 focus-visible:ring-2 ${
            isContinuousActive
              ? activeButtonClasses
              : "text-setta-700 dark:text-setta-200 hover:bg-setta-100 dark:hover:bg-setta-800 active:bg-blue-100 active:dark:bg-blue-950"
          }`}
          trigger={<RiArrowDownSLine />}
        >
          {/*
          We don't use a checkmark indicator; the active mode is shown via blue text/icon.
          Blue is overridden to white on hover to keep menu highlight consistent.
        */}
          <MenuItem
            className={menuItemClasses}
            onClick={() => {
              useRunControl.setState({
                runMode: "once",
                continuousRunStarted: false,
                continuousRunCustomRunId: null,
              });
            }}
          >
            <i
              className={`w-3 opacity-70 ${
                runMode === "once"
                  ? "text-blue-500 opacity-100 group-data-[highlighted]:text-white"
                  : ""
              }`}
            >
              <RiPlayMiniFill />
            </i>
            <span
              className={`ml-0.5 ${
                runMode === "once"
                  ? "text-blue-500 group-data-[highlighted]:text-white"
                  : ""
              }`}
            >
              Run once
            </span>
          </MenuItem>
          <MenuItem
            className={menuItemClasses}
            onClick={() => {
              useRunControl.setState({
                runMode: "continuous",
                continuousRunStarted: false,
                continuousRunCustomRunId: null,
              });
            }}
          >
            <i
              className={`w-3 opacity-70 ${
                runMode === "continuous"
                  ? "text-blue-500 opacity-100 group-data-[highlighted]:text-white"
                  : ""
              }`}
            >
              <RiLoopRightFill />
            </i>
            <span
              className={`ml-0.5 ${
                runMode === "continuous"
                  ? "text-blue-500 group-data-[highlighted]:text-white"
                  : ""
              }`}
            >
              Continuous run
            </span>
          </MenuItem>

          <Menubar.Separator className="mx-2 my-1 h-px bg-setta-100 dark:bg-setta-700/60" />
          <MenuItem
            className={menuItemClasses}
            onClick={() =>
              onOverviewTabClick(OverviewTabNameEnum.RunInstructions)
            }
          >
            <i className="w-3 opacity-80">
              <RiPlayList2Fill />
            </i>
            <span className="ml-0.5">Custom Runs...</span>
          </MenuItem>

          {dropdownRuns.length > 0 && (
            <>
              <Menubar.Separator className="mx-2 my-1 h-px bg-setta-100 dark:bg-setta-700/60" />
              {dropdownRuns.map((run) => (
                <MenuItem
                  key={run.id}
                  className={menuItemClasses}
                  onClick={() => {
                    void runCustomRun(projectConfigId, run.id);
                  }}
                >
                  <i className="w-3 opacity-80">
                    {run.runMode === "continuous" ? (
                      <RiLoopRightFill />
                    ) : (
                      <RiPlayMiniFill />
                    )}
                  </i>
                  <span className="ml-0.5">{run.name}</span>
                </MenuItem>
              ))}
            </>
          )}
        </NavbarMenuDropdown>
      </div>
    </div>
  );
}
