import { usePanes } from "models/panes";
import { useSettings } from "models/settings";
import { UI_EDITOR } from "utils/constants";
import { MiniMap } from "xyflow/minimap";
import "xyflow/minimap/style.css";

export function ResponsiveMiniMap() {
  const uiEditorWidth = usePanes((x) => x.trueWidth[UI_EDITOR]);
  const darkMode = useSettings((x) => x.darkMode);

  return (
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
      style={{ transform: `translateX(-${uiEditorWidth}px)` }}
      className="overflow-hidden rounded-md border border-solid border-[#ffffff00] shadow-md backdrop-blur-sm transition-transform"
      maskColor={darkMode ? "rgb(20, 22, 31, 0.5)" : "rgb(51, 65, 85, 0.3)"}
      maskStrokeColor=""
      maskStrokeWidth="1"
    />
  );
}
