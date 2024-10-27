import { ControlButton, Controls } from "forks/xyflow/controls";
import "forks/xyflow/controls/style.css";
import { resetZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { IoMapOutline } from "react-icons/io5";
import { RiLayoutFill } from "react-icons/ri";
import { TbGrid4X4, TbZoomReset } from "react-icons/tb";
import { toggleMiniMap, toggleSnapToGrid } from "state/actions/localStorage";
import { autoLayout } from "state/actions/sections/sectionPositions";
import { localStorageFns } from "state/hooks/localStorage";

export function ResponsiveControls() {
  const [snapToGrid] = localStorageFns.snapToGrid.hook();
  const [overviewWidth] = localStorageFns.overviewTrueWidth.hook();
  const styleForActive = "!bg-red-900";

  return (
    <Controls
      showInteractive={false}
      onFitView={() => {
        useReactFlow.setState({ fitViewOnInit: true });
      }}
      style={{ transform: `translateX(${overviewWidth}px)` }}
      styleForActive={styleForActive}
      className="transition-transform [&>button]:bg-setta-50 dark:[&>button]:border-setta-800 dark:[&>button]:bg-setta-700 dark:[&>button]:text-setta-300 dark:[&_svg]:fill-setta-300"
    >
      <ControlButton onClick={autoLayout}>
        <RiLayoutFill />
      </ControlButton>
      <ControlButton
        onClick={toggleSnapToGrid}
        className={snapToGrid ? styleForActive : ""}
      >
        <TbGrid4X4 />
      </ControlButton>
      <ControlButton onClick={resetZoom}>
        <TbZoomReset />
      </ControlButton>
      <ControlButton onClick={toggleMiniMap}>
        <IoMapOutline />
      </ControlButton>
    </Controls>
  );
}
