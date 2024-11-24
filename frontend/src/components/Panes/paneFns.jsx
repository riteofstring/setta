import { localStorageFns } from "state/hooks/localStorage";
import { CLOSED_PANE_WIDTH, OVERVIEW } from "utils/constants";

export function usePaneFns({ paneName, onResizeStop, tab, setTab }) {
  const [vis, setVis] = localStorageFns[`${paneName}Vis`].hook();
  const [width] = localStorageFns[`${paneName}Width`].hook();
  const setTrueWidth = localStorageFns[`${paneName}TrueWidth`].state()[1];

  function visToggle() {
    const newVis = !vis;
    setVis(newVis);
    setTrueWidth(newVis ? width : CLOSED_PANE_WIDTH);
    if (onResizeStop) {
      const widthDiff = width - CLOSED_PANE_WIDTH;
      onResizeStop(newVis ? widthDiff : -widthDiff);
    }
  }

  function getOnTabClick(tabValue) {
    return () => {
      if (tab !== tabValue) {
        setTab(tabValue);
        if (!vis) {
          visToggle();
        }
      } else {
        visToggle();
      }
    };
  }

  return { vis, width, getOnTabClick };
}

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
  const [vis, setVis] = localStorageFns[`${paneName}Vis`].state();
  const [width] = localStorageFns[`${paneName}Width`].state();
  const setTrueWidth = localStorageFns[`${paneName}TrueWidth`].state()[1];
  const newVis = !vis;
  setVis(newVis);
  setTrueWidth(newVis ? width : CLOSED_PANE_WIDTH);
  if (onResizeStop) {
    const widthDiff = width - CLOSED_PANE_WIDTH;
    onResizeStop(newVis ? widthDiff : -widthDiff);
  }
}

export function getOnOverviewTabClick(onResizeStop) {
  return (tabValue) => {
    const [vis] = localStorageFns.overviewVis.state();
    const [tab, setTab] = localStorageFns.overviewTab.state();
    if (tab !== tabValue) {
      setTab(tabValue);
      if (!vis) {
        visToggle(OVERVIEW, onResizeStop);
      }
    } else {
      visToggle(OVERVIEW, onResizeStop);
    }
  };
}
