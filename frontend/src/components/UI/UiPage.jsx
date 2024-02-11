import { useEffect } from "react";
import { attachKeyEventListeners } from "thunks/keyActivations";
import { PaneContextMenu } from "utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "utils/ContextMenus/SelectionContextMenu";
import { GlobalDndContext } from "utils/DNDSortable/GlobalDndContext";
import { ResponsiveControls } from "./Section/ResponsiveControls";
import { ResponsiveMiniMap } from "./Section/ResponsiveMiniMap";
import { SectionsPane } from "./Section/SectionsPane";

export function UIPage() {
  useInitGlobalKeyEventListeners();

  return (
    <GlobalDndContext>
      <SectionsPane />
      <PaneContextMenu />
      <SelectionContextMenu />
      {/* {nodeCtxMenuDetails.nodeId && (
        <NodeContextMenu
          {...nodeCtxMenuDetails}
          closeContextMenu={closeNodeCtxMenu}
        />
      )} */}
      {/* <ResponsiveMiniMap /> */}
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
