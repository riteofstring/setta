import { useStoreState } from "easy-peasy";
import { motion } from "framer-motion";
import { MiniMap } from "react-flow-renderer";
import { UI_EDITOR } from "utils/constants";

export function ResponsiveMiniMap() {
  const uiEditorWidth = useStoreState((x) => x.panes.trueWidth[UI_EDITOR]);

  // The motion.div style is from https://github.com/wbkd/react-flow/blob/main/src/style.css.
  // It's the style used inside of MiniMap.
  // For some reason it doesn't work unless the motion.div also has the style
  return (
    <motion.div
      initial={false}
      style={{ position: "absolute", zIndex: 5, bottom: "20px", right: "15px" }}
      animate={{ translateX: -uiEditorWidth }}
    >
      <MiniMap
        nodeStrokeColor={(n) => {
          if (n.style?.background) return n.style.background;
          if (n.type === "input") return "#0041d0";
          if (n.type === "output") return "#ff0072";
          if (n.type === "default") return "#1a192b";

          return "#7a7a7a";
        }}
        nodeColor={(n) => {
          if (n.style?.background) return n.style.background;

          return "#fff";
        }}
        nodeBorderRadius={2}
      />
    </motion.div>
  );
}
