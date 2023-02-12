import { useWindowSize } from "hooks/useWindowSize";
import { usePanes } from "models/panes";
import { Resizable } from "re-resizable";
import { useEffect, useState } from "react";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi";
import { Button } from "utils/atoms/buttons/Button";
import { MIN_PANE_WIDTH } from "utils/constants";
import { clamp } from "utils/utils";

export function PaneContainer({
  paneTitle = null,
  onResizeStop = null,
  paneProps,
  children,
}) {
  const size = useWindowSize();
  const { right, paneName, initialWidth } = paneProps;
  const vis = usePanes((x) => x.vis[paneName]);
  const setVis = usePanes((x) => x.setVis);
  const setTrueWidth = usePanes((x) => x.setTrueWidth);
  const [width, setWidth] = useState(initialWidth);
  const [vMax, setVMax] = useState(50);
  const [vMin, setVMin] = useState(50);
  const [btnDir, setBtnDir] = useState(right ? vis : !vis);
  const height = "100%";

  function uiToggle() {
    const newVis = !vis;
    setVis({ paneName, vis: newVis });
    setBtnDir(!btnDir);
    setTrueWidth({ paneName, trueWidth: newVis ? width : MIN_PANE_WIDTH });
    if (onResizeStop) {
      const widthDiff = width - MIN_PANE_WIDTH;
      onResizeStop(newVis ? widthDiff : -widthDiff);
    }
  }

  function setNewWidth(newWidth) {
    setWidth(newWidth);
    setTrueWidth({ paneName, trueWidth: vis ? newWidth : MIN_PANE_WIDTH });
  }

  useEffect(() => {
    const newVMax = size.winWidth / 2.1;
    const newVMin = Math.min(340, newVMax);
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
    ? "justify-self-end right-0 left-auto"
    : "justify-self-start right-auto left-0";

  const rightButtonCon = right ? "left-0 right-auto" : "left-auto right-0";

  return (
    <div
      className={`z-10 col-start-1 col-end-2 row-start-2 row-end-3 flex min-h-0 min-w-0 ${rightCondition} transition-all [&>div]:flex [&>div]:flex-grow [&>div]:flex-col [&>div]:border-r  [&>div]:border-slate-200 [&>div]:bg-slate-50 [&>div]:py-8 [&>div]:px-[2.66rem] [&>div]:shadow-md`}
      style={{ transform: `translateX(${vis ? "0" : style})` }}
      aria-label={`${paneTitle} Pane`}
    >
      <Resizable
        size={{ width, height }}
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
      >
        {/* <h2 className="pb-3 text-base font-bold  uppercase tracking-widest text-slate-400">
          {paneTitle}
        </h2> */}
        {children}
        <Button
          twClasses={`text-slate-500 hover:bg-slate-200 rounded-md px-1 ${rightButtonCon} top-0 m-[0.33rem] self-center h-[calc(100%_-_.66rem)] absolute`}
          tabIndex="-1"
          onClick={uiToggle}
        >
          {btnDir ? <HiChevronRight /> : <HiChevronLeft />}
        </Button>
      </Resizable>
    </div>
  );
}
