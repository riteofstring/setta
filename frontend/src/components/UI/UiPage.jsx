import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { useEffect } from "react";
import { attachKeyEventListeners } from "thunks/keyActivations";
import useDeepCompareEffect from "use-deep-compare-effect";
import { NodeContextMenu } from "utils/ContextMenus/NodeContextMenu";
import { PaneContextMenu } from "utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "utils/ContextMenus/SelectionContextMenu";
import { useAllContextMenus } from "utils/ContextMenus/useContextMenu";
import { GlobalDndContext } from "utils/DNDSortable/GlobalDndContext";
import { useStoreApi } from "xyflow/core";
import { ResponsiveControls } from "./Section/ResponsiveControls";
import { ResponsiveMiniMap } from "./Section/ResponsiveMiniMap";
import { SectionsPane } from "./Section/SectionsPane";

export function UIPage() {
  const topLevelSectionIds = useProjectConfig((x) => x.children, _.isEqual);
  const initialNodes = useSectionInfos(
    (x) =>
      topLevelSectionIds.map((k) => ({
        id: k,
        position: x.x[k].position,
        selected: useActiveSection.getState().ids.includes(k),
        style: { visibility: "visible" }, // needed to prevent flickering
      })),
    _.isEqual,
  );
  const store = useStoreApi();

  useDeepCompareEffect(() => {
    store.getState().setNodes(initialNodes);
  }, [initialNodes]);

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
