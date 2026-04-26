import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  getSectionRect,
  getViewportForBounds,
} from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import { autoLayoutTopLevelSections } from "openapi/http";
import { useNodeInternals, useShareSession } from "state/definitions";
import { applyActiveSectionChange } from "../activeSectionController";
import {
  debounced_route_set_top_level_section_layout,
  getCurrProjectConfigId,
} from "../sectionInfos";
export function setZIndices(
  sectionIds: Array<string>,
  incrementVersion: boolean = false,
) {
  const nodeInternals = useNodeInternals.getState().x;
  const newValues = shouldNormalizeZIndices(nodeInternals, incrementVersion)
    ? normalizeNodeZIndices(nodeInternals, sectionIds)
    : raiseNodeZIndices(nodeInternals, sectionIds);
  if (newValues !== nodeInternals) {
    useNodeInternals.setState({ x: newValues });
  }
  if (incrementVersion) {
    debounced_route_set_top_level_section_layout();
  }
}
function shouldNormalizeZIndices(
  nodeInternals: typeof useNodeInternals.getState extends () => infer T
    ? T["x"]
    : never,
  incrementVersion: boolean,
) {
  if (incrementVersion) {
    return true;
  }
  let maxZIndex = -1;
  for (const node of nodeInternals.values()) {
    if (!Number.isFinite(node.zIndex) || !Number.isFinite(node.tempZIndex)) {
      return true;
    }
    maxZIndex = Math.max(maxZIndex, node.zIndex);
  }
  return maxZIndex > nodeInternals.size * 4;
}
function normalizeNodeZIndices(
  nodeInternals: typeof useNodeInternals.getState extends () => infer T
    ? T["x"]
    : never,
  sectionIds: Array<string>,
) {
  const excludingInputIds = Array.from(nodeInternals.values()).filter(
    (x) => !sectionIds.includes(x.id),
  );
  excludingInputIds.sort(
    (a, b) => getNodeZIndexForOrdering(a) - getNodeZIndexForOrdering(b),
  );
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
  return newValues;
}
function raiseNodeZIndices(
  nodeInternals: typeof useNodeInternals.getState extends () => infer T
    ? T["x"]
    : never,
  sectionIds: Array<string>,
) {
  let maxZIndex = -1;
  for (const node of nodeInternals.values()) {
    maxZIndex = Math.max(maxZIndex, getNodeZIndexForOrdering(node));
  }
  let nextZIndex = maxZIndex;
  let changed = false;
  const newValues = new Map(nodeInternals);
  for (const sectionId of sectionIds) {
    const curr = nodeInternals.get(sectionId);
    if (!curr) {
      continue;
    }
    nextZIndex += 1;
    if (curr.zIndex === nextZIndex && curr.tempZIndex === nextZIndex) {
      continue;
    }
    newValues.set(sectionId, {
      ...curr,
      zIndex: nextZIndex,
      tempZIndex: nextZIndex,
    });
    changed = true;
  }
  return changed ? newValues : nodeInternals;
}
function getNodeZIndexForOrdering(node: { zIndex: number }) {
  return Number.isFinite(node.zIndex) ? node.zIndex : -1;
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
  const { x, y, zoom } = getViewportForBounds({
    bounds: {
      x: sectionX,
      y: sectionY,
      width: sectionWidth,
      height: sectionHeight,
    },
    height: rfStore.height,
    keepCurrZoomIfPossible: true,
    maxZoom: 1,
    minZoom: 0,
    padding: 0.1,
    width: rfStore.width,
  });
  useReactFlow.setState({
    transform: [x, y, zoom],
  });
  applyActiveSectionChange({ interaction: "go-to", sectionId });
}
export function autoLayout() {
  const shareSession = useShareSession.getState();
  if (
    shareSession.isDeploymentMode &&
    !(shareSession.sharePolicy?.allowLayoutChanges ?? true)
  ) {
    return;
  }
  callOpenAPI(
    autoLayoutTopLevelSections({
      body: {
        projectConfigId: getCurrProjectConfigId(),
      },
    } as Parameters<typeof autoLayoutTopLevelSections>[0]),
  );
}
