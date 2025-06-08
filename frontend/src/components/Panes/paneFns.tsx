import { updateMapPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { getSectionType } from "state/actions/sectionInfos";
import {
  useLocalStorage,
  useProjectState,
  useSettings,
} from "state/definitions";
import { getUIEditorTab } from "state/hooks/uiTypes";
import {
  CLOSED_PANE_WIDTH,
  OVERVIEW,
  SECTION_VARIANTS_TAB,
  UI_CONFIG_TAB,
  UI_EDITOR,
} from "utils/constants";

export function TabButton({
  id,
  vis,
  tab,
  tabName,
  onTabClick,
  children,
  className,
  requiredTabs,
  ...props
}) {
  const disabled = requiredTabs && !requiredTabs.has(tabName);
  const color = getColor({ vis, isCurrSelected: tab === tabName, disabled });
  return (
    <button
      id={id}
      className={`${className} ${color}`}
      onClick={() => onTabClick(tabName)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

function getColor({ vis, isCurrSelected, disabled }) {
  if (vis && isCurrSelected) {
    return "text-blue-500";
  } else if (disabled) {
    return "text-setta-300/50 dark:text-setta-700/50";
  }
  return "text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500";
}

function visToggle(paneName, onResizeStop) {
  const vis = useLocalStorage.getState()[`${paneName}Vis`];
  const width = useLocalStorage.getState()[`${paneName}Width`];
  const newVis = !vis;
  useLocalStorage.setState({
    [`${paneName}Vis`]: newVis,
    [`${paneName}TrueWidth`]: newVis ? width : CLOSED_PANE_WIDTH,
  });
  if (onResizeStop) {
    const widthDiff = width - CLOSED_PANE_WIDTH;
    onResizeStop(newVis ? widthDiff : -widthDiff);
  }
}

export function onOverviewTabClick(tabValue) {
  const vis = useLocalStorage.getState().overviewVis;
  const tab = useLocalStorage.getState().overviewTab;
  if (tab !== tabValue) {
    useLocalStorage.setState({ overviewTab: tabValue });
    if (!vis) {
      visToggle(OVERVIEW, onOverviewResizeStop);
    }
  } else {
    visToggle(OVERVIEW, onOverviewResizeStop);
  }
}

export function onOverviewResizeStop(widthDiff) {
  if (useSettings.getState().gui.leftSidePaneShiftsMap) {
    updateMapPosition(widthDiff);
  }
}

export function getOnUIEditorTabClick(uiTypeName) {
  const setTab = (newTabState) => {
    useLocalStorage.setState((state) => ({
      uiEditorTab: {
        ...state.uiEditorTab,
        [uiTypeName]: newTabState,
      },
    }));
  };

  return (tabValue) => {
    const vis = useLocalStorage.getState().uiEditorVis;
    const storedTab = useLocalStorage.getState().uiEditorTab;
    const { tab } = getUIEditorTab(uiTypeName, storedTab);
    if (tab !== tabValue) {
      setTab(tabValue);
      if (!vis) {
        visToggle(UI_EDITOR);
      }
    } else {
      visToggle(UI_EDITOR);
    }
  };
}

function changeUIEditorTab(tabName) {
  const activeId = useProjectState.getState().activeIds[0];
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
  onOverviewTabClick("tab1");
}
