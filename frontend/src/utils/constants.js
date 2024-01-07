import _ from "lodash";

export const NO_CONTEXT_MENU = import.meta.env.MODE === "ncm";
export const SECTIONWIDTH = 250;
export const PANEID = "-1";
export const OVERVIEW = "overview";
export const UI_EDITOR = "uiEditor";

export const CLOSED_PANE_WIDTH = 40;
export const INITIAL_CHART_SIZE = { width: SECTIONWIDTH, height: SECTIONWIDTH };

export const REACT_FLOW_NODE_TYPE = "sectionContainerNode";
export const REACT_FLOW_STORE = {
  store: null,
  rf: null,
  lastPaneClickLocation: {},
  initialViewport: {},
  initialNodes: {},
};

export function rfSetInitial(projectConfig) {
  REACT_FLOW_STORE.initialViewport = projectConfig.viewport;
  REACT_FLOW_STORE.initialNodes = _.mapValues(
    projectConfig.children,
    (v, k) => ({
      id: k,
      position: { x: v.x, y: v.y },
      zIndex: v.zIndex,
      type: REACT_FLOW_NODE_TYPE,
      style: { visibility: "visible" }, // needed to prevent flickering
    })
  );
}

export function rfAddNodes(nodes) {
  REACT_FLOW_STORE.rf.addNodes(
    nodes.map((x) => ({
      ...x,
      type: REACT_FLOW_NODE_TYPE,
      style: { visibility: "visible" },
    }))
  );
}

export function rfDeleteNodes(ids) {
  REACT_FLOW_STORE.rf.deleteElements({
    nodes: ids.map((x) => ({ id: x })),
  });
}
