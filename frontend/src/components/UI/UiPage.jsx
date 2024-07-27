import { GlobalDndContext } from "forks/dnd-kit/GlobalDndContext";
import { ReactFlow } from "forks/xyflow/core";
import "forks/xyflow/core/styles/style.css";
import { useEffect } from "react";
import { attachKeyEventListeners } from "state/actions/keyActivations";
import { localStorageFns } from "state/hooks/localStorage";
import { DeckContextMenu } from "utils/ContextMenus/DeckContextMenu";
import { PaneContextMenu } from "utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "utils/ContextMenus/SelectionContextMenu";
import "./Section/react-flow-css.css";
import { ResponsiveControls } from "./Section/ResponsiveControls";
import { ResponsiveMiniMap } from "./Section/ResponsiveMiniMap";

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

function useInitGlobalKeyEventListeners() {
  useEffect(() => {
    const cleanup = attachKeyEventListeners();
    return cleanup;
  }, []);
}

const reactFlowStyle = {
  // background: "#94a3b8",
  height: "100%",
  userSelect: "none", //to prevent text from being selected when shift clicking or right-clicking pane
};
