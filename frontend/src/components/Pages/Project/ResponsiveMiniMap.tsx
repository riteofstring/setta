import { setCenter } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { MiniMap } from "forks/xyflow/minimap";
import { useLocalStorage } from "state/definitions";

type ResponsiveMiniMapPlacement = {
  position: "bottom-left" | "bottom-right";
  transform: string;
};

function getResponsiveMiniMapPlacement({
  minimapSide,
  overviewWidth,
  uiEditorWidth,
}: {
  minimapSide: "left" | "right";
  overviewWidth: number;
  uiEditorWidth: number;
}): ResponsiveMiniMapPlacement {
  if (minimapSide === "right") {
    return {
      position: "bottom-right",
      transform: `translateX(-${Math.max(0, uiEditorWidth)}px)`,
    };
  }
  return {
    position: "bottom-left",
    transform: `translateX(${Math.max(0, overviewWidth)}px)`,
  };
}

export function ResponsiveMiniMap() {
  const overviewWidth = useLocalStorage((x) => x.overviewTrueWidth);
  const uiEditorWidth = useLocalStorage((x) => x.uiEditorTrueWidth);
  const darkMode = useLocalStorage((x) => x.darkMode);
  const minimapSide = useLocalStorage((x) => x.minimapSide);
  const placement = getResponsiveMiniMapPlacement({
    minimapSide,
    overviewWidth,
    uiEditorWidth,
  });

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
      position={placement.position}
      style={{ transform: placement.transform }}
      className="overflow-hidden rounded-md border border-solid border-[#ffffff00] shadow-md backdrop-blur-sm transition-transform"
      maskColor={darkMode ? "rgb(20, 22, 31, 0.5)" : "rgb(51, 65, 85, 0.3)"}
      maskStrokeColor={
        darkMode ? "rgba(226, 232, 240, 0.9)" : "rgba(30, 41, 59, 0.6)"
      }
      maskStrokeWidth={2}
      pannable
      onClick={(e, { x, y }) => {
        setCenter(x, y, { zoom: useReactFlow.getState().transform[2] });
      }}
    />
  );
}
