import { localStorageFns } from "state/hooks/localStorage";
import { getTabAndTabSetter } from "state/hooks/uiTypes";
import { CLOSED_PANE_WIDTH } from "utils/constants";

export function usePaneVisAndWidth(paneName) {
  const [vis] = localStorageFns[`${paneName}Vis`].hook();
  const [width] = localStorageFns[`${paneName}Width`].hook();
  return { vis, width };
}

export function TabButton({
  id,
  vis,
  tab,
  tabName,
  getOnTabClick,
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
      onClick={getOnTabClick(tabName)}
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

function visToggle({ paneName, onResizeStop }) {
  const [vis, setVis] = localStorageFns[`${paneName}Vis`].state();
  const [width] = localStorageFns[`${paneName}Width`].state();
  const setTrueWidth = localStorageFns[`${paneName}TrueWidth`].state()[1];
  const newVis = !vis;
  console.log("newVis", paneName, newVis);
  setVis(newVis);
  setTrueWidth(newVis ? width : CLOSED_PANE_WIDTH);
  if (onResizeStop) {
    const widthDiff = width - CLOSED_PANE_WIDTH;
    onResizeStop(newVis ? widthDiff : -widthDiff);
  }
}

export function getOnTabClick({ paneName, uiTypeName, onResizeStop }) {
  return (tabValue) => {
    const { tab, setTab } = getTabAndTabSetter(paneName, uiTypeName);
    console.log("tab, tabValue", tab, tabValue)
    if (tab !== tabValue) {
      setTab(tabValue);
      const [vis] = localStorageFns[`${paneName}Vis`].state();
      if (!vis) {
        visToggle({ paneName, onResizeStop });
      }
    } else {
      visToggle({ paneName, onResizeStop });
    }
  };
}

export function useSetPaneWidthAndTrueWidth(paneName) {
  const setWidth = localStorageFns[`${paneName}Width`].hook()[1];
  const setTrueWidth = localStorageFns[`${paneName}Width`].hook()[1];
  return { setWidth, setTrueWidth };
}
