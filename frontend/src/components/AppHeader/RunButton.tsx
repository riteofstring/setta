import { NavbarMenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { useEffect } from "react";
import {
  RiArrowDownSLine,
  RiLoopRightFill,
  RiPlayMiniFill,
} from "react-icons/ri";
import { runFromMainRunButton } from "state/actions/runOrImportCode";
import { triggerListenerForceRefresh } from "state/actions/listeners";
import { usePendingOperations, useRunControl } from "state/definitions";

export function RunButton() {
  const runMode = useRunControl((x) => x.runMode);
  const mainIcon = runMode === "continuous" ? (
    <RiLoopRightFill />
  ) : (
    <RiPlayMiniFill />
  );

  const baseClasses =
    "relative transition-colors text-xs font-semibold text-setta-700 dark:text-setta-100 h-full rounded-md gap-1 select-none flex items-center hover:bg-setta-100 dark:hover:bg-setta-800 bg-transparent active:!bg-blue-100 active:dark:!bg-blue-950";

  // Menu item styling with proper hover effect that's contained within the button
  const menuItemClasses =
    "flex items-center gap-2 px-1.5 py-1.5 text-xs text-setta-700 dark:text-setta-200  mx-1 rounded-md text-left hover:bg-setta-600 hover:text-white dark:hover:bg-setta-900 dark:hover:text-white active:bg-blue-100 active:dark:bg-blue-950 cursor-pointer";

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
      void triggerListenerForceRefresh();
    });

    return unsubscribe;
  }, []);

  return (
    <div className="flex justify-stretch">
      <button
        onClick={runFromMainRunButton}
        className={`focus-visible:ring-2 inline-flex items-center nodrag cursor-pointer ${baseClasses} rounded-r-none px-2`}
        {...getFloatingBoxHandlers({ content: "Run your code." })}
      >
        {mainIcon}
        Run
      </button>
      <NavbarMenuDropdown
        triggerClassName="nodrag flex cursor-pointer select-none items-center justify-between gap-1 rounded-r-md py-1 px-1 text-xs font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800"
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
      </NavbarMenuDropdown>
    </div>
  );
}
