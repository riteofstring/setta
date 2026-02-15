import { Resizable } from "re-resizable";
import { useEffect, useState } from "react";
import { useLocalStorage } from "state/definitions";
import { useWindowSize } from "state/hooks/utils";
import { CLOSED_PANE_WIDTH } from "utils/constants";
import { clamp } from "utils/utils";

export function PaneContainer({
  paneName,
  right,
  children,
  minimumWidth,
  vis,
  width,
  onResizeStop,
  paddingClassName,
}: {
  paneName: string;
  right: boolean;
  children: React.ReactNode;
  minimumWidth: number;
  vis: boolean;
  width: number;
  onResizeStop?: (widthDiff: number) => void;
  paddingClassName?: string;
}) {
  const size = useWindowSize();
  const [vMax, setVMax] = useState(100000);
  const [vMin, setVMin] = useState(minimumWidth);

  function setNewWidth(newWidth: number) {
    useLocalStorage.setState({
      [`${paneName}Width`]: newWidth,
      [`${paneName}TrueWidth`]: vis ? newWidth : CLOSED_PANE_WIDTH,
    });
  }

  useEffect(() => {
    if (size.winWidth === undefined || size.winHeight === undefined) {
      return;
    }
    const newVMax = size.winWidth / 2.1;
    const newVMin = Math.min(minimumWidth, newVMax);
    if (newVMax) setVMax(newVMax);
    if (newVMin) setVMin(newVMin);
    if (width > newVMax) {
      setNewWidth(newVMax);
    } else if (width < newVMin) {
      setNewWidth(newVMin);
    }
  }, [vis, size.winWidth]);

  function localOnResizeStop(_e, _direction, _ref, d) {
    const newWidth = clamp(width + d.width, vMin, vMax);
    if (newWidth === width) {
      return;
    }
    setNewWidth(newWidth);
    if (onResizeStop) {
      onResizeStop(d.width);
    }
  }

  const style = `${!right ? "-" : ""}${width - CLOSED_PANE_WIDTH}px`;

  const rightCondition = right
    ? "justify-self-end left-auto border-l pr-7 place-items-center"
    : "justify-self-start right-auto border-r pl-9 place-items-center";
  const paddingClasses = paddingClassName ?? "py-2.5";

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
      className={`single-cell-container z-10 col-start-1 col-end-2 row-start-2 row-end-3  min-h-0 min-w-0 border-setta-200 bg-setta-50 shadow-md transition-transform dark:border-setta-800 dark:bg-setta-900 ${paddingClasses} ${rightCondition} overflow-clip`}
      style={{ transform: `translateX(${vis ? "0" : style})` }}
    >
      {children}
    </Resizable>
  );
}
