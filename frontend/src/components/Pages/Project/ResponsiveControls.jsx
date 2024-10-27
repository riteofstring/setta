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
  const [overviewWidth] = localStorageFns.overviewTrueWidth.hook();

  return (
    <Controls
      onFitView={() => {
        useReactFlow.setState({ fitViewOnInit: true });
      }}
      style={{ transform: `translateX(${overviewWidth}px)` }}
      className="transition-transform [&>button]:bg-setta-50 dark:[&>button]:border-setta-800 dark:[&>button]:bg-setta-700 dark:[&>button]:text-setta-300 dark:[&_svg]:fill-setta-300"
    >
      <ControlButton onClick={autoLayout}>
        <RiLayoutFill />
      </ControlButton>
      <ControlButton onClick={toggleSnapToGrid}>
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
