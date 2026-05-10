import { PaneContextMenu } from "components/Utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "components/Utils/ContextMenus/SelectionContextMenu";
import { TypeErrorContextMenu } from "components/Utils/ContextMenus/TypeErrorContextMenu";
import { useEffect } from "react";
import { attachKeyEventListeners } from "state/actions/keyActivations";
import { useLocalStorage, useMisc } from "state/definitions";
import "./gpu-flow-project.css";
import "./gpu-flow-runtime.css";
import { GpuProjectSurface } from "./GpuProjectSurface";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";

export function UIPage() {
  useInitGlobalKeyEventListeners();
  useLastMouseDownMouseUpLocation();
  const showMiniMap = useLocalStorage((x) => x.showMinimap);

  return (
    <div className="relative h-full min-h-0 w-full min-w-0">
      <GpuProjectSurface />
      <PaneContextMenu />
      <SelectionContextMenu />
      <TypeErrorContextMenu />
      {showMiniMap && <ResponsiveMiniMap />}
    </div>
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
