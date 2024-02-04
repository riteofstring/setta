import { useEffect } from "react";
import { attachKeyEventListeners } from "thunks/keyActivations";
import { NodeContextMenu } from "utils/ContextMenus/NodeContextMenu";
import { PaneContextMenu } from "utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "utils/ContextMenus/SelectionContextMenu";
import { useAllContextMenus } from "utils/ContextMenus/useContextMenu";
import { GlobalDndContext } from "utils/DNDSortable/GlobalDndContext";
import { ResponsiveControls } from "./Section/ResponsiveControls";
import { ResponsiveMiniMap } from "./Section/ResponsiveMiniMap";
import { SectionsPane } from "./Section/SectionsPane";

export function UIPage() {
  useInitGlobalKeyEventListeners();

  const [
    paneCtxMenuDetails,
    openPaneCtxMenu,
    closePaneCtxMenu,
    selectionCtxMenuDetails,
    openSelectionCtxMenu,
    closeSelectionCtxMenu,
    nodeCtxMenuDetails,
    openNodeCtxMenu,
    closeNodeCtxMenu,
    closeCtxMenus,
  ] = useAllContextMenus();

  return (
    <GlobalDndContext>
      <SectionsPane
        closeCtxMenus={closeCtxMenus}
        openPaneCtxMenu={openPaneCtxMenu}
        openSelectionCtxMenu={openSelectionCtxMenu}
        openNodeCtxMenu={openNodeCtxMenu}
      />
      <PaneContextMenu
        {...paneCtxMenuDetails}
        closeContextMenu={closePaneCtxMenu}
      />
      <SelectionContextMenu
        {...selectionCtxMenuDetails}
        closeContextMenu={closeSelectionCtxMenu}
      />
      {nodeCtxMenuDetails.nodeId && (
        <NodeContextMenu
          {...nodeCtxMenuDetails}
          closeContextMenu={closeNodeCtxMenu}
        />
      )}
      <ResponsiveMiniMap />
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
