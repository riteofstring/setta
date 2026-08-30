import { useWorkspaceOptions } from "../canvas/options";
import { getReactFlowStore, useReactFlow } from "../canvas/store";
import { setCenter } from "../canvas/viewportHelpers";
import { useWorkspaceAppearance } from "../document/stores";
import { useWorkspaceHost } from "../workspaceHostContext";
import MiniMap from "./MiniMap";

const DEFAULT_MINIMAP_WIDTH_PX = 200;
const MINIMAP_ASPECT_RATIO = 4 / 3;
const MINIMAP_PANEL_MARGIN_PX = 15;

function getResponsiveMiniMapDimensions(
  canvasWidth: number,
  canvasHeight: number,
): { height: number; width: number } {
  const panelMargins = MINIMAP_PANEL_MARGIN_PX * 2;
  const widthLimit =
    canvasWidth > 0
      ? Math.max(0, canvasWidth - panelMargins)
      : DEFAULT_MINIMAP_WIDTH_PX;
  const heightLimit =
    canvasHeight > 0
      ? Math.max(0, canvasHeight - panelMargins) * MINIMAP_ASPECT_RATIO
      : DEFAULT_MINIMAP_WIDTH_PX;
  const width = Math.min(DEFAULT_MINIMAP_WIDTH_PX, widthLimit, heightLimit);
  return { height: width / MINIMAP_ASPECT_RATIO, width };
}

export function ResponsiveMiniMap() {
  const host = useWorkspaceHost();
  const darkMode = useWorkspaceAppearance((x) => x.darkMode);
  const minimapSide = useWorkspaceOptions((x) => x.minimapSide);
  const viewportInsets = useReactFlow((x) => x.viewportInsets);
  const canvasDimensions = useReactFlow(
    (state) => ({ height: state.height, width: state.width }),
    (left, right) => left.height === right.height && left.width === right.width,
  );
  const minimapInset =
    minimapSide === "right" ? viewportInsets.right : viewportInsets.left;
  const minimapDimensions = getResponsiveMiniMapDimensions(
    canvasDimensions.width,
    canvasDimensions.height,
  );
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
        height: minimapDimensions.height,
        transform: `translateX(${minimapSide === "right" ? -minimapInset : minimapInset}px)`,
        width: minimapDimensions.width,
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
