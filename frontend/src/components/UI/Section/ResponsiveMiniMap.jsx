import { motion } from "framer-motion";
import { usePanes } from "models/panes";
import { useSettings } from "models/settings";
import { MiniMap } from "reactflow";
import { UI_EDITOR } from "utils/constants";

export function ResponsiveMiniMap() {
  const uiEditorWidth = usePanes((x) => x.trueWidth[UI_EDITOR]);
  const darkMode = useSettings((x) => x.darkMode);

  // The motion.div style is from https://github.com/wbkd/react-flow/blob/main/src/style.css.
  // It's the style used inside of MiniMap.
  // For some reason it doesn't work unless the motion.div also has the style
  return (
    <motion.div
      initial={false}
      style={{
        position: "absolute",
        zIndex: 5,
        bottom: "20px",
        right: "15px",
      }}
      animate={{ translateX: -uiEditorWidth }}
    >
      <MiniMap
        nodeStrokeColor={(n) => {
          if (n.style?.background) return n.style.background;
          if (n.type === "input") return "#0041d0";
          if (n.type === "output") return "#ff0072";
          if (n.type === "default") return "#1a192b";

          return "#e2e8f0";
        }}
        nodeColor={(n) => {
          if (n.style?.background) return n.style.background;

          if (darkMode) {
            return "#2D384D";
          }
          return "#e2e8f0";
        }}
        nodeBorderRadius={5}
        className="overflow-hidden rounded-md border border-solid border-[#ffffff00] shadow-md backdrop-blur-sm"
        maskColor={darkMode ? "rgb(20, 22, 31, 0.5)" : "rgb(51, 65, 85, 0.3)"}
        maskStrokeColor=""
        maskStrokeWidth="1"
      />
    </motion.div>
  );
}
