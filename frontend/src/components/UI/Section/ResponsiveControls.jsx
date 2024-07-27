import { ControlButton, Controls } from "forks/xyflow/controls";
import "forks/xyflow/controls/style.css";
import { resetZoom } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import potpack from "potpack";
import { IoMapOutline } from "react-icons/io5";
import { RiLayoutFill } from "react-icons/ri";
import { TbGrid4X4, TbZoomReset } from "react-icons/tb";
import { getNodes, setNodes } from "state/actions/nodeInternals";
import { toggleMiniMap, toggleSetting } from "state/actions/settings";
import { localStorageFns } from "state/hooks/localStorage";

export function ResponsiveControls() {
  const [overviewWidth] = localStorageFns.overviewTrueWidth.hook();

  function onClickLayout() {
    const margin = 50;
    const nodeInternals = getNodes();

    let sizes = nodeInternals.map((x) => ({
      id: x.id,
      w: x.width + margin,
      h: x.height + margin,
    }));
    potpack(sizes); // mutates input
    sizes = _.keyBy(sizes, "id");

    const minX = Math.min(...nodeInternals.map((n) => n.position.x));
    const minY = Math.min(...nodeInternals.map((n) => n.position.y));
    const newNodes = nodeInternals.map((node) => {
      node.position = {
        x: sizes[node.id].x + minX,
        y: sizes[node.id].y + minY,
      };
      return node;
    });

    setNodes(newNodes);
  }

  // The motion.div style is from https://github.com/wbkd/react-flow/blob/main/src/style.css.
  // It's the style used inside of Controls.
  // For some reason it doesn't work unless the motion.div also has the style
  return (
    <Controls
      style={{ transform: `translateX(${overviewWidth}px)` }}
      className="transition-transform [&>button]:bg-setta-50 dark:[&>button]:border-setta-800 dark:[&>button]:bg-setta-700 dark:[&>button]:text-setta-300 dark:[&_svg]:fill-setta-300"
    >
      <ControlButton onClick={onClickLayout}>
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
