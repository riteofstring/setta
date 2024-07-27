import { setCenter } from "forks/xyflow/core/hooks/useViewportHelper";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import potpack from "potpack";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useNodeInternals } from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
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

export function goToSection(sectionId) {
  const [overviewWidth] = localStorageFns.overviewTrueWidth.state();
  const { x, y, width, height } = getSectionRect(sectionId);
  const newX = x + width / 2 - overviewWidth;
  const newY = y + height / 2 + 100;
  setCenter(newX, newY, {
    zoom: 1,
    duration: 100,
  });
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
