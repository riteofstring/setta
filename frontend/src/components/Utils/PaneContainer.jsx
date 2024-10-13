import { Resizable } from "re-resizable";
import { useEffect, useState } from "react";
import { useWindowSize } from "state/hooks/utils";
import { CLOSED_PANE_WIDTH } from "utils/constants";
import { clamp } from "utils/utils";

export function PaneContainer({
  onResizeStop = null,
  right,
  children,
  minimumWidth,
  vis,
  width,
  setWidth,
  setTrueWidth,
}) {
  const size = useWindowSize();
  const [vMax, setVMax] = useState(100000);
  const [vMin, setVMin] = useState(minimumWidth);

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
    ? "justify-self-end left-auto border-l pr-12 justify-items-end"
    : "justify-self-start right-auto border-r pl-12";

  // flex flex-grow flex-col

  return (
    <Resizable
      size={{ width, height: "100%" }}
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
      className={`single-cell-container z-10 col-start-1 col-end-2 row-start-2 row-end-3 -mx-1  min-h-0 min-w-0 border-setta-200 bg-setta-50 py-8 shadow-md transition-transform dark:border-setta-800 dark:bg-setta-900 ${rightCondition} overflow-clip`}
      style={{ transform: `translateX(${vis ? "0" : style})` }}
    >
      {children}
    </Resizable>
  );
}
