import { useLocalStorage } from "state/definitions";
import { useReactFlow } from "../store";
import { getPaneRect } from "./graph";

/**
 * Gets the position and dimensions of the area of the zoomable/pannable pane that is currently being viewed.
 * @SETTA_MCP_TOOL
 * @return {ReactFlowPaneRect} x, y, height, width.
 */
export function getPaneRectMcp() {
  return getPaneRect(
    useReactFlow.getState(),
    useLocalStorage.getState().overviewTrueWidth,
  );
}
