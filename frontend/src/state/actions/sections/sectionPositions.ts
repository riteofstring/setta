import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { getSectionRect } from "gpuFlow/flowGeometry";
import { setViewport } from "gpuFlow/viewportActions";
import { getGpuViewportForBounds } from "gpuFlow/viewportMath";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import _ from "lodash";
import { autoLayoutTopLevelSections } from "openapi/http";
import {
  useLocalStorage,
  useNodeInternals,
  useSettings,
  useShareSession,
} from "state/definitions";
import { applyActiveSectionChange } from "../activeSectionController";
import {
  debounced_route_set_top_level_section_layout,
  getCurrProjectConfigId,
} from "../sectionInfos";

type NodeInternalsMap = ReturnType<typeof useNodeInternals.getState>["x"];

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
  nodeInternals: NodeInternalsMap,
  incrementVersion: boolean,
) {
  if (incrementVersion) {
    return true;
  }
  let maxZIndex = -1;
  for (const node of nodeInternals.values()) {
    maxZIndex = Math.max(maxZIndex, node.zIndex);
  }
  return maxZIndex > nodeInternals.size * 4;
}
function normalizeNodeZIndices(
  nodeInternals: NodeInternalsMap,
  sectionIds: Array<string>,
) {
  const excludingInputIds = Array.from(nodeInternals.values()).filter(
    (x) => !sectionIds.includes(x.id),
  );
  excludingInputIds.sort((a, b) => a.zIndex - b.zIndex);
  const newValues = _.cloneDeep(nodeInternals);
  for (const [i, node] of excludingInputIds.entries()) {
    const curr = newValues.get(node.id);
    if (!curr) {
      continue;
    }
    curr.zIndex = i;
    curr.tempZIndex = curr.zIndex;
  }
  for (const [i, sectionId] of sectionIds.entries()) {
    const curr = newValues.get(sectionId);
    if (!curr) {
      continue;
    }
    curr.zIndex = i + excludingInputIds.length;
    curr.tempZIndex = curr.zIndex;
  }
  return newValues;
}
function raiseNodeZIndices(
  nodeInternals: NodeInternalsMap,
  sectionIds: Array<string>,
) {
  let maxZIndex = -1;
  for (const node of nodeInternals.values()) {
    maxZIndex = Math.max(maxZIndex, node.zIndex);
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
export function goToSection(sectionId: string) {
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
  const viewportState = gpuFlowViewportStore.getState();
  const maxZoom = Math.min(viewportState.maxZoom, 1);
  const minZoom = Math.min(viewportState.minZoom, maxZoom);
  const { x, y, zoom } = getGpuViewportForBounds(
    { x: sectionX, y: sectionY, width: sectionWidth, height: sectionHeight },
    {
      canvasHeight: viewportState.height,
      canvasWidth: viewportState.width,
      keepCurrentZoomIfPossible: true,
      maxZoom,
      minZoom,
      overviewWidth: useLocalStorage.getState().overviewTrueWidth,
      padding: 0.1,
      viewport: viewportState.transform,
    },
  );
  setViewport(
    { x, y, zoom },
    { duration: useSettings.getState().gui.transitionDuration },
  );
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
    } as Parameters<typeof autoLayoutTopLevelSections>[0]) as Parameters<
      typeof callOpenAPI
    >[0],
  );
}
