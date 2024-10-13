import { localStorageFns } from "state/hooks/localStorage";
import { CLOSED_PANE_WIDTH } from "utils/constants";

export function usePaneFns({ paneName, onResizeStop }) {
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
  return { vis, width, setWidth, setTrueWidth, visToggle };
}
