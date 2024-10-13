import { localStorageFns } from "state/hooks/localStorage";
import { CLOSED_PANE_WIDTH } from "utils/constants";

export function usePaneFns({ paneName, onResizeStop, tab, setTab }) {
  const [vis, setVis] = localStorageFns[`${paneName}Vis`].hook();
  const [width, setWidth] = localStorageFns[`${paneName}Width`].hook();
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

  return { vis, width, setWidth, setTrueWidth, getOnTabClick };
}

export function TabButton({
  vis,
  tab,
  tabName,
  getOnTabClick,
  children,
  className,
  requiredTabs,
}) {
  const disabled = requiredTabs && !requiredTabs.has(tabName);
  const color = getColor({ vis, isCurrSelected: tab === tabName, disabled });
  return (
    <button
      className={`${className} ${color}`}
      onClick={getOnTabClick(tabName)}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function getColor({ vis, isCurrSelected, disabled }) {
  if (vis && isCurrSelected) {
    return "text-blue-500";
  } else if (disabled) {
    return "text-setta-600 dark:text-setta-800";
  }
  return "text-setta-400 hover:text-setta-600 dark:text-setta-600 dark:hover:text-setta-500";
}
