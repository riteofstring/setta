import { PaneContextMenu } from "components/Utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "components/Utils/ContextMenus/SelectionContextMenu";
import { TypeErrorContextMenu } from "components/Utils/ContextMenus/TypeErrorContextMenu";
import { SectionDndContext } from "forks/dnd-kit/SectionDndContext";
import ReactFlow from "forks/xyflow/core/container/ReactFlow";
import "forks/xyflow/core/styles/style.css";
import { useLocalStorage } from "state/definitions";
import "./react-flow-css.css";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";
import { useProjectSurfaceGlobalListeners } from "./useProjectSurfaceGlobalListeners";

export function UIPage() {
  useProjectSurfaceGlobalListeners();
  const showMiniMap = useLocalStorage((x) => x.showMinimap);

  return (
    <SectionDndContext>
      <div className="relative h-full min-h-0 w-full min-w-0">
        <ReactFlow />
        <PaneContextMenu />
        <SelectionContextMenu />
        <TypeErrorContextMenu />
        {showMiniMap && <ResponsiveMiniMap />}
      </div>
    </SectionDndContext>
  );
}
