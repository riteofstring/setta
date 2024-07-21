import { Resizable } from "re-resizable";
import { useEffect, useState } from "react";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi";
import { localStorageFns } from "state/hooks/localStorage";
import { useWindowSize } from "state/hooks/useWindowSize";
import { Button } from "utils/atoms/buttons/Button";
import { CLOSED_PANE_WIDTH } from "utils/constants";
import { clamp } from "utils/utils";

export function PaneContainer({
  paneTitle = null,
  onResizeStop = null,
  paneProps,
  children,
  minimumWidth = 325,
}) {
  const size = useWindowSize();
  const { right, paneName } = paneProps;
  const [vis, setVis] = localStorageFns[`${paneName}Vis`].hook();
  const [width, setWidth] = localStorageFns[`${paneName}Width`].hook();
  const [vMax, setVMax] = useState(100000);
  const [vMin, setVMin] = useState(minimumWidth);
  const [btnDir, setBtnDir] = useState(right ? vis : !vis);
  const height = "100%";
  const setTrueWidth = localStorageFns[`${paneName}TrueWidth`].state()[1];

  function uiToggle() {
    const newVis = !vis;
    setVis(newVis);
    setBtnDir(!btnDir);
    setTrueWidth(newVis ? width : CLOSED_PANE_WIDTH);
    if (onResizeStop) {
      const widthDiff = width - CLOSED_PANE_WIDTH;
      onResizeStop(newVis ? widthDiff : -widthDiff);
    }
  }

  function setNewWidth(newWidth) {
    setWidth(newWidth);
    setTrueWidth(vis ? newWidth : CLOSED_PANE_WIDTH);
  }

  useEffect(() => {
    const newVMax = size.winWidth / 2.1;
    const newVMin = Math.min(minimumWidth, newVMax);
    newVMax && setVMax(newVMax);
    newVMin && setVMin(newVMin);
    if (width > newVMax) {
      setNewWidth(newVMax);
    } else if (width < newVMin) {
      setNewWidth(newVMin);
    }
  }, [vis, size.winWidth]);

  function localOnResizeStop(e, direction, ref, d) {
    const newWidth = clamp(width + d.width, vMin, vMax);
    if (newWidth === width) {
      return;
    }
    setNewWidth(newWidth);
    if (onResizeStop) {
      onResizeStop(d.width);
    }
  }

  const style = `${!right ? "-" : ""}${width - 40}px`;

  const rightCondition = right
    ? "justify-self-end right-0 left-auto border-l"
    : "justify-self-start right-auto left-0 border-r";

  const rightButtonCon = right ? "left-0 right-auto" : "left-auto right-0";

  return (
    <Resizable
      size={{ width, height }}
      as="aside"
      onResizeStop={localOnResizeStop}
      maxWidth={vMax}
      minWidth={vMin}
      enable={{
        top: false,
        right: vis && !right,
        bottom: false,
        left: vis && right,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      className={`z-10 col-start-1 col-end-2 row-start-2 row-end-3 -mx-1 flex min-h-0 min-w-0 flex-grow  flex-col border-setta-200 bg-setta-50 px-12 py-8 shadow-md transition-transform dark:border-setta-800 dark:bg-setta-900 ${rightCondition}`}
      style={{ transform: `translateX(${vis ? "0" : style})` }}
      aria-label={`${paneTitle} Pane`}
    >
      {children}
      <Button
        twClasses={`text-setta-500 hover:bg-setta-100 dark:hover:bg-setta-800 rounded-md px-1 ${rightButtonCon} top-0 m-[0.33rem] self-center h-[calc(100%_-_.66rem)] absolute`}
        tabIndex="-1"
        onClick={uiToggle}
      >
        {btnDir ? <HiChevronRight /> : <HiChevronLeft />}
      </Button>
    </Resizable>
  );
}
