import _ from "lodash";
import { useProjectConfig } from "models/info/projectConfig";
import { useEffect } from "react";
import { useStoreApi } from "reactflow";
import { attachKeyEventListeners } from "thunks/keyActivations";
import { REACT_FLOW_STORE } from "utils/constants";
import { GlobalDndContext } from "utils/DNDSortable/GlobalDndContext";
import { SectionsPane } from "./Section/SectionsPane";

export function UIPage() {
  const viewport = useProjectConfig((x) => x.viewport, _.isEqual);
  const topLevelSectionPositions = useProjectConfig(
    (x) => x.children,
    _.isEqual
  );
  const initialNodes = _.map(topLevelSectionPositions, (v, k) => ({
    id: k,
    position: { x: v.x, y: v.y },
    type: "sectionContainerNode",
    zIndex: v.zIndex,
    style: { visibility: "visible" }, // needed to prevent flickering
  }));

  useInitGlobalReactFlowStore();
  useInitGlobalKeyEventListeners();

  return (
    <GlobalDndContext>
      <SectionsPane initialNodes={initialNodes} viewport={viewport} />
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
