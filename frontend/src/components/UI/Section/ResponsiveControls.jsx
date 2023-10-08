import { motion } from "framer-motion";
import _ from "lodash";
import { usePanes } from "models/panes";
import { useSettings } from "models/settings";
import potpack from "potpack";
import { RiLayoutFill } from "react-icons/ri";
import { ControlButton, Controls, useReactFlow } from "reactflow";
import { setPositionState } from "thunks/sections/sectionPositions";
import { OVERVIEW, REACT_FLOW_STORE } from "utils/constants";

export function ResponsiveControls() {
  const overviewCssWidth = usePanes((x) => x.trueWidth[OVERVIEW]);
  const rf = useReactFlow();
  const darkMode = useSettings((x) => x.darkMode);

  function onClickLayout() {
    const margin = 50;
    const store = REACT_FLOW_STORE.store;
    const nodeInternals = Array.from(store.getState().nodeInternals.values());

    let sizes = nodeInternals.map((x) => ({
      id: x.id,
      w: x.width + margin,
      h: x.height + margin,
    }));
    potpack(sizes); // mutates input
    sizes = _.keyBy(sizes, "id");

    const minX = Math.min(...nodeInternals.map((n) => n.position.x));
    const minY = Math.min(...nodeInternals.map((n) => n.position.y));

    rf.setNodes((nodes) =>
      nodes.map((node) => {
        node.position = {
          x: sizes[node.id].x + minX,
          y: sizes[node.id].y + minY,
        };
        return node;
      })
    );

    setPositionState(Array.from(store.getState().nodeInternals.values()), true);
  }

  // The motion.div style is from https://github.com/wbkd/react-flow/blob/main/src/style.css.
  // It's the style used inside of Controls.
  // For some reason it doesn't work unless the motion.div also has the style
  return (
    <motion.div
      initial={false}
      style={{
        position: "absolute",
        zIndex: 5,
        bottom: "20px",
        left: "15px",
      }}
      animate={{ translateX: overviewCssWidth }}
    >
      <Controls className="[&>button]:bg-slate-50 dark:[&>button]:border-runcoder-800 dark:[&>button]:bg-runcoder-700 dark:[&>button]:text-runcoder-300 dark:[&_svg]:fill-runcoder-300">
        <ControlButton onClick={onClickLayout}>
          <RiLayoutFill />
        </ControlButton>
      </Controls>
    </motion.div>
  );
}
