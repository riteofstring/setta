import _ from "lodash";
import { useNodeInternals } from "models/info/nodeInternals";
import { usePanes } from "models/panes";
import { useSettings } from "models/settings";
import potpack from "potpack";
import { RiLayoutFill } from "react-icons/ri";
import { OVERVIEW } from "utils/constants";
import { ControlButton, Controls } from "xyflow/controls";
import "xyflow/controls/style.css";

export function ResponsiveControls() {
  const overviewWidth = usePanes((x) => x.trueWidth[OVERVIEW]);
  const darkMode = useSettings((x) => x.darkMode);

  function onClickLayout() {
    const margin = 50;
    const nodeInternals = useNodeInternals.getState().getNodes();

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

    useNodeInternals.getState().setNodes(newNodes);
  }

  // The motion.div style is from https://github.com/wbkd/react-flow/blob/main/src/style.css.
  // It's the style used inside of Controls.
  // For some reason it doesn't work unless the motion.div also has the style
  return (
    <Controls
      style={{ transform: `translateX(${overviewWidth}px)` }}
      className="transition-transform [&>button]:bg-runcoder-50 dark:[&>button]:border-runcoder-800 dark:[&>button]:bg-runcoder-700 dark:[&>button]:text-runcoder-300 dark:[&_svg]:fill-runcoder-300"
    >
      <ControlButton onClick={onClickLayout}>
        <RiLayoutFill />
      </ControlButton>
    </Controls>
  );
}
