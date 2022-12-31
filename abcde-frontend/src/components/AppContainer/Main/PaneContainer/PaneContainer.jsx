import { motion } from "framer-motion";
import useWindowSize from "hooks/useWindowSize";
import { usePanes } from "models/panes";
import { Resizable } from "re-resizable";
import { useEffect, useState } from "react";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi";
import Button from "utils/atoms/buttons/Button";
import { MIN_PANE_WIDTH } from "utils/constants";
import { clamp } from "utils/utils";

export default function PaneContainer({
  paneTitle = null,
  onResizeStop = null,
  paneProps,
  children,
}) {
  const size = useWindowSize();
  const { right, paneName } = paneProps;
  const vis = usePanes((x) => x.vis[paneName]);
  const setVis = usePanes((x) => x.setVis);
  const setTrueWidth = usePanes((x) => x.setTrueWidth);
  function uiToggle() {
    const newVis = !vis;
    setVis({ paneName, vis: newVis });
    btnDirFlip();
    setTrueWidth({ paneName, trueWidth: newVis ? width : MIN_PANE_WIDTH });
    if (onResizeStop) {
      const widthDiff = width - MIN_PANE_WIDTH;
      onResizeStop(newVis ? widthDiff : -widthDiff);
    }
  }
  const [btnDir, setBtnDir] = useState(right ? vis : !vis);
  function btnDirFlip() {
    setBtnDir(!btnDir);
  }

  const [vMax, setVMax] = useState(50);
  const [vMin, setVMin] = useState(50);

  useEffect(() => {
    const newVMax = size.winWidth / 2.1;
    const newVMin = 340;
    newVMax && setVMax(newVMax);
    newVMin && setVMin(newVMin);
    if (width > newVMax) {
      setWidth({ paneName, width: newVMax });
      setTrueWidth({ paneName, trueWidth: vis ? newVMax : MIN_PANE_WIDTH });
    } else if (width < newVMin) {
      setWidth({ paneName, width: newVMin });
      setTrueWidth({ paneName, trueWidth: vis ? newVMin : MIN_PANE_WIDTH });
    }
  }, [vis, size.winWidth]);

  const width = usePanes((x) => x.width[paneName]);
  const setWidth = usePanes((x) => x.setWidth);
  const height = "100%";

  const variants = {
    open: { x: "0rem" },
    closed: { x: `${!right ? "-" : ""}${width / 16 - 2.5}rem` },
  };

  function localOnResizeStop(e, direction, ref, d) {
    const newWidth = clamp(width + d.width, vMin, vMax);
    if (newWidth === width) {
      return;
    }
    setWidth({ paneName, width: newWidth });
    setTrueWidth({
      paneName,
      trueWidth: vis ? newWidth : MIN_PANE_WIDTH,
    });
    if (onResizeStop) {
      onResizeStop(d.width);
    }
  }

  const rightCondition = right
    ? "justify-self-end right-0 left-auto"
    : "justify-self-start right-auto left-0";

  const rightButtonCon = right ? "left-0 right-auto" : "left-auto right-0";
  return (
    <motion.div
      className={`h-full col-start-1 col-end-2 row-start-2 row-end-3 min-h-0 min-w-0 z-10 ${rightCondition} `}
      animate={vis ? "open" : "closed"}
      variants={variants}
      initial={vis ? "open" : "closed"}
      outline="none"
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
        <div className="h-[inherit] w-full border-r border-gray-200 shadow-md inline-block py-8 px-[2.66rem] bg-gray-50">
          <h2 className="text-base font-bold text-gray-400  pb-3 uppercase tracking-widest">
            {paneTitle}
          </h2>
          {children}
          <Button
            tailwindClasses={`text-gray-500 hover:bg-gray-200 rounded-md px-1 ${rightButtonCon} top-0 m-[0.33rem] self-center h-[calc(100%_-_.66rem)] absolute`}
            tabIndex="-1"
            onClick={uiToggle}
          >
            {btnDir ? <HiChevronRight /> : <HiChevronLeft />}
          </Button>
        </div>
      </Resizable>
    </motion.div>
  );
}
