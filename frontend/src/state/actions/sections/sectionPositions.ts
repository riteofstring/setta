import { zoomIdentity } from "d3-zoom";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  getD3Transition,
  getSectionRect,
  getViewportForBounds,
} from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import {
  useNodeInternals,
  useSettings,
  useShareSession,
} from "state/definitions";
import { route_auto_layout_top_level_sections } from "utils/generatedEndpoints";
import { setActiveSectionIds } from "../activeSections";
import {
  debounced_route_set_top_level_section_layout,
  getCurrProjectConfigId,
} from "../sectionInfos";

export function setZIndices(
  sectionIds: Array<string>,
  incrementVersion: boolean = false,
) {
  const nodeInternals = useNodeInternals.getState().x;
  const excludingInputIds = Array.from(nodeInternals.values()).filter(
    (x) => !sectionIds.includes(x),
  );

  excludingInputIds.sort((a, b) => a.zIndex - b.zIndex); //sort in increasing order of zindex

  const newValues = _.cloneDeep(nodeInternals);
  for (let i = 0; i < excludingInputIds.length; i++) {
    const curr = newValues.get(excludingInputIds[i].id);
    curr.zIndex = i;
    curr.tempZIndex = curr.zIndex;
  }
  for (let i = 0; i < sectionIds.length; i++) {
    if (!nodeInternals.has(sectionIds[i])) {
      continue;
    }
    const curr = newValues.get(sectionIds[i]);
    curr.zIndex = i + excludingInputIds.length;
    curr.tempZIndex = curr.zIndex;
  }

  useNodeInternals.setState({ x: newValues });

  if (incrementVersion) {
    debounced_route_set_top_level_section_layout();
  }
}

export function goToSection(sectionId: string) {
  const rfStore = useReactFlow.getState();
  const rect = getSectionRect(sectionId);
  if (!rect) {
    return;
  }
  const {
    x: sectionX,
    y: sectionY,
    width: sectionWidth,
    height: sectionHeight,
  } = rect;
  const { x, y, zoom } = getViewportForBounds(
    { x: sectionX, y: sectionY, width: sectionWidth, height: sectionHeight },
    rfStore.width,
    rfStore.height,
    0,
    1,
    0.1,
    true,
  );

  const duration = useSettings.getState().gui.transitionDuration;
  const nextTransform = zoomIdentity.translate(x, y).scale(zoom);
  rfStore.d3Zoom.transform(
    getD3Transition(rfStore.d3Selection, duration),
    nextTransform,
  );

  setActiveSectionIds([sectionId]);
  setZIndices([sectionId]);
}

export function autoLayout() {
  const shareSession = useShareSession.getState();
  if (
    shareSession.isShareMode &&
    !(shareSession.sharePolicy?.allowLayoutChanges ?? true)
  ) {
    return;
  }
  route_auto_layout_top_level_sections({
    projectConfigId: getCurrProjectConfigId(),
  });
}
