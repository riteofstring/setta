import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import { useProjectConfig } from "models/info/projectConfig";
import { useEffect } from "react";
import { useStoreApi } from "reactflow";
import { attachKeyEventListeners } from "thunks/keyActivations";
import { REACT_FLOW_STORE } from "utils/constants";
import { NodeContextMenu } from "utils/ContextMenus/NodeContextMenu";
import { PaneContextMenu } from "utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "utils/ContextMenus/SelectionContextMenu";
import { useAllContextMenus } from "utils/ContextMenus/useContextMenu";
import { GlobalDndContext } from "utils/DNDSortable/GlobalDndContext";
import { ResponsiveControls } from "./Section/ResponsiveControls";
import { ResponsiveMiniMap } from "./Section/ResponsiveMiniMap";
import { SectionsPane } from "./Section/SectionsPane";

export function UIPage() {
  const topLevelSectionPositions = useProjectConfig(
    (x) => x.children,
    _.isEqual
  );
  const initialNodes = _.mapValues(topLevelSectionPositions, (v, k) => ({
    id: k,
    position: { x: v.x, y: v.y },
    type: "sectionContainerNode",
    zIndex: v.zIndex,
    selected: useActiveSection.getState().ids.includes(k),
    style: { visibility: "visible" }, // needed to prevent flickering
  }));

  useInitGlobalReactFlowStore();
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
        initialNodes={initialNodes}
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

function useInitGlobalReactFlowStore() {
  const store = useStoreApi();
  useEffect(() => {
    REACT_FLOW_STORE.store = store;
  }, []);
}

function useInitGlobalKeyEventListeners() {
  useEffect(() => {
    const cleanup = attachKeyEventListeners();
    return cleanup;
  }, []);
}
