import { PaneContextMenu } from "components/Utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "components/Utils/ContextMenus/SelectionContextMenu";
import { TypeErrorContextMenu } from "components/Utils/ContextMenus/TypeErrorContextMenu";
import { SectionDndContext } from "forks/dnd-kit/SectionDndContext";
import Background from "forks/xyflow/background/Background";
import ReactFlow from "forks/xyflow/core/container/ReactFlow";
import "forks/xyflow/core/styles/style.css";
import { useEffect } from "react";
import { attachKeyEventListeners } from "state/actions/keyActivations";
import { useLocalStorage, useMisc, useSettings } from "state/definitions";
import { CanvasEngineHost } from "./CanvasEngineHost";
import { CanvasEngineMiniMap } from "./CanvasEngineMiniMap";
import "./react-flow-css.css";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";

export function UIPage() {
  useInitGlobalKeyEventListeners();
  useLastMouseDownMouseUpLocation();
  const showMiniMap = useLocalStorage((x) => x.showMinimap);
  const snapToGrid = useLocalStorage((x) => x.snapToGrid);
  const useCanvasEngineV1 = useLocalStorage((x) => x.useCanvasEngineV1);
  const showGridLines = useSettings((x) => !!x.gui.showGridLines);
  const shouldShowBackground = snapToGrid && showGridLines;

  return (
    <SectionDndContext>
      <div className="relative h-full min-h-0 w-full min-w-0">
        {useCanvasEngineV1 ? <CanvasEngineHost /> : <ReactFlow />}
        {useCanvasEngineV1 && shouldShowBackground ? <Background /> : null}
        <PaneContextMenu />
        <SelectionContextMenu />
        <TypeErrorContextMenu />
        {showMiniMap &&
          (useCanvasEngineV1 ? <CanvasEngineMiniMap /> : <ResponsiveMiniMap />)}
      </div>
    </SectionDndContext>
  );
}

function useInitGlobalKeyEventListeners() {
  useEffect(() => {
    const cleanup = attachKeyEventListeners();
    return cleanup;
  }, []);
}

function useLastMouseDownMouseUpLocation() {
  useEffect(() => {
    const handlePointerDown = (e) => {
      useMisc.setState({
        lastMouseDownLocation: { x: e.clientX, y: e.clientY },
      });
    };

    const handlePointerUp = (e) => {
      useMisc.setState({
        lastMouseUpLocation: { x: e.clientX, y: e.clientY },
      });
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);
}
