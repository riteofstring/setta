import { updateMapPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import React from "react";
import { getSectionType } from "state/actions/sectionInfos";
import {
  useLocalStorage,
  useProjectState,
  useSettings,
} from "state/definitions";
import { getUIEditorTab } from "state/hooks/uiTypes";
import {
  OverviewTabKey,
  OverviewTabNameEnum,
  PaneName,
  PaneNameEnum,
  UIEditorTabName,
} from "utils/constants";
import { SectionType } from "utils/generatedTypes";
import { togglePaneVisibility } from "./paneLayout";

type TabButtonComponentType<T> = {
  id?: string;
  vis: boolean;
  selectedTabName: T | null;
  tabName: T;
  onTabClick: (x: T) => void;
  className: string;
  requiredTabs: Set<T> | null;
  icon: React.ReactElement;
};

export function TabButton<T>({
  id,
  vis,
  selectedTabName,
  tabName,
  onTabClick,
  className,
  requiredTabs,
  icon,
  ...props
}: TabButtonComponentType<T>) {
  const disabled = requiredTabs !== null && !requiredTabs.has(tabName);
  const color = getColor({
    vis,
    isCurrSelected: selectedTabName === tabName,
    disabled,
  });
  return (
    <button
      id={id}
      className={`${className} ${color}`}
      onClick={() => onTabClick(tabName)}
      disabled={disabled}
      {...props}
    >
      {icon}
    </button>
  );
}

function getColor({
  vis,
  isCurrSelected,
  disabled,
}: {
  vis: boolean;
  isCurrSelected: boolean;
  disabled: boolean;
}) {
  if (vis && isCurrSelected) {
    return "text-blue-500";
  } else if (disabled) {
    return "text-setta-300/50 dark:text-setta-700/50";
  }
  return "text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500";
}

function visToggle(
  paneName: PaneName,
  onResizeStop: ((x: number) => void) | null = null,
) {
  const { previous, next } = togglePaneVisibility(paneName);
  if (onResizeStop) {
    const widthDiff =
      paneName === PaneNameEnum.overview
        ? next.overviewTrueWidth - previous.overviewTrueWidth
        : next.uiEditorTrueWidth - previous.uiEditorTrueWidth;
    onResizeStop(widthDiff);
  }
}

export function openOverviewTab(tabValue: OverviewTabKey) {
  const { overviewVis, overviewTab } = useLocalStorage.getState();
  if (overviewTab !== tabValue) {
    useLocalStorage.setState({ overviewTab: tabValue });
  }
  if (!overviewVis) {
    visToggle(PaneNameEnum.overview, onOverviewResizeStop);
  }
}

export function onOverviewTabClick(tabValue: OverviewTabKey) {
  const { overviewTab } = useLocalStorage.getState();
  if (overviewTab !== tabValue) {
    openOverviewTab(tabValue);
    return;
  }
  visToggle(PaneNameEnum.overview, onOverviewResizeStop);
}

export function onOverviewResizeStop(widthDiff) {
  if (useSettings.getState().gui.leftSidePaneShiftsMap) {
    updateMapPosition(widthDiff);
  }
}

export function getOnUIEditorTabClick(sectionType: SectionType) {
  const setTab = (newTabState: UIEditorTabName) => {
    useLocalStorage.setState((state) => ({
      uiEditorTab: {
        ...state.uiEditorTab,
        [sectionType]: newTabState,
      },
    }));
  };

  return (tabValue: UIEditorTabName) => {
    const { uiEditorVis, uiEditorTab } = useLocalStorage.getState();
    const { selectedTabName } = getUIEditorTab(sectionType, uiEditorTab);
    if (selectedTabName !== tabValue) {
      setTab(tabValue);
      if (!uiEditorVis) {
        visToggle(PaneNameEnum.uiEditor);
      }
    } else {
      visToggle(PaneNameEnum.uiEditor);
    }
  };
}

export function getOnUIEditorTabClickNoSectionSelected() {
  visToggle(PaneNameEnum.uiEditor);
}

function changeUIEditorTab(tabName) {
  const activeId = useProjectState.getState().projectConfig.activeIds[0];
  if (!activeId) {
    return;
  }
  const uiTypeName = getSectionType(activeId);
  getOnUIEditorTabClick(uiTypeName)(tabName);
}

export function showVersionsTab() {
  changeUIEditorTab(SECTION_VARIANTS_TAB);
}

export function showParamUITypeTab() {
  changeUIEditorTab(UI_CONFIG_TAB);
}

export function showProjectOverviewTab() {
  onOverviewTabClick(OverviewTabNameEnum.Overview);
}
