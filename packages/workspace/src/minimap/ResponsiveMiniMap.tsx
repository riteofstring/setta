import { useWorkspaceOptions } from "../canvas/options";
import { getReactFlowStore, useReactFlow } from "../canvas/store";
import { setCenter } from "../canvas/viewportHelpers";
import { useWorkspaceAppearance } from "../document/stores";
import { useWorkspaceHost } from "../workspaceHostContext";
import MiniMap from "./MiniMap";

export function ResponsiveMiniMap() {
  const host = useWorkspaceHost();
  const darkMode = useWorkspaceAppearance((x) => x.darkMode);
  const minimapSide = useWorkspaceOptions((x) => x.minimapSide);
  const viewportInsets = useReactFlow((x) => x.viewportInsets);
  const minimapInset =
    minimapSide === "right" ? viewportInsets.right : viewportInsets.left;
  const navigate = ({ x, y }: { x: number; y: number }) => {
    setCenter(host, x, y, {
      zoom: getReactFlowStore(host).getState().transform[2],
    });
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
      style={{
        transform: `translateX(${minimapSide === "right" ? -minimapInset : minimapInset}px)`,
      }}
      className="overflow-hidden rounded-md border border-solid border-[#ffffff00] shadow-md backdrop-blur-sm motion-safe:transition-transform"
      maskColor={darkMode ? "rgb(20, 22, 31, 0.5)" : "rgb(51, 65, 85, 0.3)"}
      maskStrokeColor={
        darkMode ? "rgba(226, 232, 240, 0.9)" : "rgba(30, 41, 59, 0.6)"
      }
      maskStrokeWidth={2}
      pannable
      aria-label="Workspace minimap"
      onClick={(_event, position) => navigate(position)}
      onNavigate={navigate}
    />
  );
}
