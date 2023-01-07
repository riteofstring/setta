import { motion } from "framer-motion";
import { usePanes } from "models/panes";
import { Controls } from "react-flow-renderer";
import { OVERVIEW } from "utils/constants";

export function ResponsiveControls() {
  const overviewCssWidth = usePanes((x) => x.trueWidth[OVERVIEW]);

  // The motion.div style is from https://github.com/wbkd/react-flow/blob/main/src/style.css.
  // It's the style used inside of Controls.
  // For some reason it doesn't work unless the motion.div also has the style
  return (
    <motion.div
      initial={false}
      style={{ position: "absolute", zIndex: 5, bottom: "20px", left: "15px" }}
      animate={{ translateX: overviewCssWidth }}
    >
      <Controls />
    </motion.div>
  );
}
