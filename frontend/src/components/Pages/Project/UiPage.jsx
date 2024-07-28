import { DeckContextMenu } from "components/Utils/ContextMenus/DeckContextMenu";
import { PaneContextMenu } from "components/Utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "components/Utils/ContextMenus/SelectionContextMenu";
import { GlobalDndContext } from "forks/dnd-kit/GlobalDndContext";
import { ReactFlow } from "forks/xyflow/core";
import "forks/xyflow/core/styles/style.css";
import { useInitGlobalKeyEventListeners } from "state/hooks/keyActivations";
import { localStorageFns } from "state/hooks/localStorage";
import "./react-flow-css.css";
import { ResponsiveControls } from "./ResponsiveControls";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";

export function UIPage() {
  useInitGlobalKeyEventListeners();
  const [showMiniMap] = localStorageFns.showMinimap.hook();

  return (
    <GlobalDndContext>
      <ReactFlow
        style={reactFlowStyle}
        nodeDragThreshold={0}
        className="rcbg-light dark:rcbg-dark"
      />
      <PaneContextMenu />
      <SelectionContextMenu />
      <DeckContextMenu />
      {showMiniMap && <ResponsiveMiniMap />}
      <ResponsiveControls />
    </GlobalDndContext>
  );
}

const reactFlowStyle = {
  // background: "#94a3b8",
  height: "100%",
  userSelect: "none", //to prevent text from being selected when shift clicking or right-clicking pane
};
