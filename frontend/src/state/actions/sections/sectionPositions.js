import C from "constants/constants.json";
import { zoomIdentity } from "d3-zoom";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  getD3Transition,
  getSectionRect,
  getViewportForBounds,
} from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import potpack from "potpack";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useNodeInternals, useSectionRefs } from "state/definitions";
import { getSectionType } from "state/getters/sectionInfo";
import { getNodes, setNodes } from "../nodeInternals";
import { setActiveSectionIds } from "./activeSections";

export function setZIndices(sectionIds, incrementVersion) {
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

  maybeIncrementProjectStateVersion(incrementVersion);
}

export function goToSection(sectionId, duration = 100) {
  const rfStore = useReactFlow.getState();
  const {
    x: sectionX,
    y: sectionY,
    width: sectionWidth,
    height: sectionHeight,
  } = getSectionRect(sectionId);
  const { x, y, zoom } = getViewportForBounds(
    { x: sectionX, y: sectionY, width: sectionWidth, height: sectionHeight },
    rfStore.width,
    rfStore.height,
    0,
    1,
  );

  const nextTransform = zoomIdentity.translate(x, y).scale(zoom);
  rfStore.d3Zoom.transform(
    getD3Transition(rfStore.d3Selection, duration),
    nextTransform,
  );

  setActiveSectionIds([sectionId]);
  setZIndices([sectionId]);
}

export function autoLayout() {
  const margin = 50;
  const nodeInternals = getNodes();

  let sizes = nodeInternals.map((x) => ({
    id: x.id,
    w: x.width + margin,
    h: x.height + margin,
  }));
  potpack(sizes); // mutates input
  sizes = _.keyBy(sizes, "id");

  const minX = Math.min(...nodeInternals.map((n) => n.position.x));
  const minY = Math.min(...nodeInternals.map((n) => n.position.y));
  const newNodes = nodeInternals.map((node) => {
    node.position = {
      x: sizes[node.id].x + minX,
      y: sizes[node.id].y + minY,
    };
    return node;
  });

  setNodes(newNodes);
}

export function focusOnSection(sectionId) {
  if (getSectionType(sectionId).type === C.DECK) {
    useSectionRefs
      .getState()
      .withNested[sectionId].focus({ preventScroll: true });
  } else {
    document
      .getElementById(`${sectionId}-MenuButtonTrigger`)
      .focus({ preventScroll: true });
  }
}
