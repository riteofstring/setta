import { useWorkspaceOptions } from "../canvas/options";
import { useReactFlow } from "../canvas/store";
import { setCenter } from "../canvas/viewportHelpers";
import { useWorkspaceAppearance } from "../document/stores";
import MiniMap from "./MiniMap";

// The reference's `components/Pages/Project/ResponsiveMiniMap.tsx` at the package seam:
// `minimapSide` still flips the panel between the bottom corners, but the reference's
// pane-width translateX placement is Overview/UI-editor rail chrome outside the seam — the
// panel positions against the canvas wrapper alone, as fit-view centering and edge auto-pan
// already do. The reference node color branches for the legacy xyflow "input"/"output"/
// "default" node types are unreachable (no Setta section carries those types) and were cut
// at extraction.
export function ResponsiveMiniMap() {
  const darkMode = useWorkspaceAppearance((x) => x.darkMode);
  const minimapSide = useWorkspaceOptions((x) => x.minimapSide);
  const navigate = ({ x, y }: { x: number; y: number }) => {
    setCenter(x, y, { zoom: useReactFlow.getState().transform[2] });
  };

  return (
    <MiniMap
      nodeStrokeColor={(n) => {
        if (n.style?.background) return `${n.style.background}`;

        return "#e2e8f0";
      }}
      nodeColor={(n) => {
        if (n.style?.background) return `${n.style.background}`;

        if (darkMode) {
          return "#2D384D";
        }
        return "#e2e8f0";
      }}
      nodeBorderRadius={5}
      position={minimapSide === "right" ? "bottom-right" : "bottom-left"}
      className="overflow-hidden rounded-md border border-solid border-[#ffffff00] shadow-md backdrop-blur-sm transition-transform"
      maskColor={darkMode ? "rgb(20, 22, 31, 0.5)" : "rgb(51, 65, 85, 0.3)"}
      maskStrokeColor={darkMode ? "rgba(226, 232, 240, 0.9)" : "rgba(30, 41, 59, 0.6)"}
      maskStrokeWidth={2}
      pannable
      aria-label="Workspace minimap"
      onClick={(_event, position) => navigate(position)}
      onNavigate={navigate}
    />
  );
}
