import { DeckContextMenu } from "components/Utils/ContextMenus/DeckContextMenu";
import { PaneContextMenu } from "components/Utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "components/Utils/ContextMenus/SelectionContextMenu";
import { GlobalDndContext } from "forks/dnd-kit/GlobalDndContext";
import { Controls } from "forks/xyflow/controls";
import ReactFlow from "forks/xyflow/core/container/ReactFlow";
import "forks/xyflow/core/styles/style.css";
import { useInitGlobalKeyEventListeners } from "state/hooks/keyActivations";
import { localStorageFns } from "state/hooks/localStorage";
import "./react-flow-css.css";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";

export function UIPage() {
  useInitGlobalKeyEventListeners();
  const [showMiniMap] = localStorageFns.showMinimap.hook();

  return (
    <GlobalDndContext>
      <ReactFlow />
      <PaneContextMenu />
      <SelectionContextMenu />
      <DeckContextMenu />
      {showMiniMap && <ResponsiveMiniMap />}
      <Controls />
    </GlobalDndContext>
  );
}
