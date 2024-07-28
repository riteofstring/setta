import { ControlButton, Controls } from "forks/xyflow/controls";
import "forks/xyflow/controls/style.css";
import { resetZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import { IoMapOutline } from "react-icons/io5";
import { RiLayoutFill } from "react-icons/ri";
import { TbGrid4X4, TbZoomReset } from "react-icons/tb";
import { toggleMiniMap } from "state/actions/localStorage";
import { autoLayout } from "state/actions/sections/sectionPositions";
import { toggleSetting } from "state/actions/settings";
import { localStorageFns } from "state/hooks/localStorage";

export function ResponsiveControls() {
  const [overviewWidth] = localStorageFns.overviewTrueWidth.hook();

  // The motion.div style is from https://github.com/wbkd/react-flow/blob/main/src/style.css.
  // It's the style used inside of Controls.
  // For some reason it doesn't work unless the motion.div also has the style
  return (
    <Controls
      style={{ transform: `translateX(${overviewWidth}px)` }}
      className="transition-transform [&>button]:bg-setta-50 dark:[&>button]:border-setta-800 dark:[&>button]:bg-setta-700 dark:[&>button]:text-setta-300 dark:[&_svg]:fill-setta-300"
    >
      <ControlButton onClick={autoLayout}>
        <RiLayoutFill />
      </ControlButton>
      <ControlButton onClick={() => toggleSetting("snapToGrid")}>
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
