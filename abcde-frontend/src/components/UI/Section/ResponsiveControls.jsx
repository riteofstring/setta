import { motion } from "framer-motion";
import _ from "lodash";
import { usePanes } from "models/panes";
import potpack from "potpack";
import {
  ControlButton,
  Controls,
  useReactFlow,
  useStoreApi,
} from "react-flow-renderer";
import { RiLayoutFill } from "react-icons/ri";
import { OVERVIEW } from "utils/constants";

export function ResponsiveControls() {
  const overviewCssWidth = usePanes((x) => x.trueWidth[OVERVIEW]);
  const store = useStoreApi();
  const rf = useReactFlow();

  function onClickLayout() {
    const margin = 50;
    const nodeInternals = [...store.getState().nodeInternals];

    let sizes = nodeInternals.map((x) => ({
      id: x[0],
      w: x[1].width + margin,
      h: x[1].height + margin,
    }));
    potpack(sizes); // mutates input
    sizes = _.keyBy(sizes, "id");

    const minX = Math.min(...nodeInternals.map((n) => n[1].position.x));
    const minY = Math.min(...nodeInternals.map((n) => n[1].position.y));

    rf.setNodes((nodes) =>
      nodes.map((node) => {
        node.position = {
          x: sizes[node.id].x + minX,
          y: sizes[node.id].y + minY,
        };
        return node;
      })
    );
  }

  // The motion.div style is from https://github.com/wbkd/react-flow/blob/main/src/style.css.
  // It's the style used inside of Controls.
  // For some reason it doesn't work unless the motion.div also has the style
  return (
    <motion.div
      initial={false}
      style={{ position: "absolute", zIndex: 5, bottom: "20px", left: "15px" }}
      animate={{ translateX: overviewCssWidth }}
    >
      <Controls>
        <ControlButton onClick={onClickLayout}>
          <RiLayoutFill />
        </ControlButton>
      </Controls>
    </motion.div>
  );
}
