import GpuMiniMap from "gpuFlow/GpuMiniMap";
import { getZoom, setCenter } from "gpuFlow/viewportActions";
import type { CSSProperties } from "react";
import { useLocalStorage } from "state/definitions";
import { useProjectGpuLayoutStore } from "./GpuProjectSurface/projectGpuLayoutAdapter";

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
  const layoutStore = useProjectGpuLayoutStore();
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
    <GpuMiniMap
      layoutStore={layoutStore}
      nodeStrokeColor={(n) => {
        const background = getStringBackground(n.style);
        if (background) return background;
        if (n.type === "input") return "#0041d0";
        if (n.type === "output") return "#ff0072";
        if (n.type === "default") return "#1a192b";

        return "#e2e8f0";
      }}
      nodeColor={(n) => {
        const background = getStringBackground(n.style);
        if (background) return background;

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
      onClick={(_event, { x, y }) => {
        setCenter(x, y, { overviewWidth, zoom: getZoom() });
      }}
    />
  );
}

function getStringBackground(style: CSSProperties | undefined): string | null {
  return typeof style?.background === "string" ? style.background : null;
}
