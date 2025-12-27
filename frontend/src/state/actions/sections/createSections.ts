import {
  screenToFlowPosition,
  setCenter,
} from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  useLocalStorage,
  useNodeInternals,
  useProjectState,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_create_top_level_section } from "utils/generatedEndpoints";
import {
  CreateTopLevelSectionRequestInput,
  Position,
  SectionType,
  SectionTypeEnum,
  TopLevelSectionLayout,
  ViewportBounds,
} from "utils/generatedTypes";
import { focusOnSectionSearch } from "utils/tabbingLogic";
import { setActiveSectionIdAndUpdateZIndex } from "../activeSections";
import {
  createTopLevelSectionLayoutDict,
  getCurrProjectConfigId,
} from "../sectionInfos";

type CreateTopLevelSectionArgs = {
  implType: CreateTopLevelSectionRequestInput["implType"];
  implOverrides: CreateTopLevelSectionRequestInput["implOverrides"];
  controlCodeObjType?: CreateTopLevelSectionRequestInput["controlCodeObjType"];
  position?: Position | null;
};

type SmartPlacementContext = {
  topLevelSections: Record<string, TopLevelSectionLayout>;
  viewportBounds: ViewportBounds | null;
};

export async function createTopLevelSection({
  implType,
  implOverrides,
  controlCodeObjType = null,
  position = null,
}: CreateTopLevelSectionArgs) {
  const placement = getSmartPlacementContext();
  const res = await route_create_top_level_section({
    projectConfigId: getCurrProjectConfigId(),
    implType,
    controlCodeObjType,
    implOverrides,
    position,
    topLevelSections: placement.topLevelSections,
    viewportBounds: placement.viewportBounds,
  });

  if (!res200(res)) {
    return null;
  }
  const { sectionId, panTo } = res.data;
  if (panTo) {
    const currentZoom = useReactFlow.getState().transform[2];
    setCenter(panTo.x, panTo.y, { zoom: currentZoom, duration: 200 });
  }
  return sectionId;
}

async function addSectionInEmptySpace(
  type: SectionType,
  callback?: (x: string) => void,
) {
  const newId = await createTopLevelSection({
    implType: type,
    implOverrides: null,
    position: null,
  });

  if (newId) {
    callback?.(newId);
  }
}

export function addCallableSectionInEmptySpace() {
  addSectionInEmptySpace(SectionTypeEnum.Callable, (newId) => {
    setActiveSectionIdAndUpdateZIndex(newId);
    focusOnSectionSearch(newId);
  });
}

export function addGroupInEmptySpace() {
  addSectionInEmptySpace(SectionTypeEnum.Group, (newId) => {
    setActiveSectionIdAndUpdateZIndex(newId);
  });
}

export function addTerminalInEmptySpace() {
  addSectionInEmptySpace(SectionTypeEnum.Terminal);
}

function getTopLevelSectionLayoutSnapshot() {
  const projectState = useProjectState.getState();
  const nodeInternals = useNodeInternals.getState().x;
  if (nodeInternals.size === 0) {
    return { ...projectState.projectConfig.topLevelSections };
  }
  return createTopLevelSectionLayoutDict(projectState.sections, nodeInternals);
}

function getViewportBoundsForPlacement(): ViewportBounds | null {
  const { domNode } = useReactFlow.getState();
  if (!domNode) {
    return null;
  }
  const rect = domNode.getBoundingClientRect();
  const { overviewTrueWidth, uiEditorTrueWidth } = useLocalStorage.getState();
  const left = rect.left + overviewTrueWidth;
  const right = rect.right - uiEditorTrueWidth;
  if (right <= left) {
    return null;
  }
  const top = rect.top;
  const bottom = rect.bottom;
  const topLeft = screenToFlowPosition({ x: left, y: top }, true);
  const bottomRight = screenToFlowPosition({ x: right, y: bottom }, true);
  const width = bottomRight.x - topLeft.x;
  const height = bottomRight.y - topLeft.y;
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { x: topLeft.x, y: topLeft.y, w: width, h: height };
}

function getSmartPlacementContext(): SmartPlacementContext {
  return {
    topLevelSections: getTopLevelSectionLayoutSnapshot(),
    viewportBounds: getViewportBoundsForPlacement(),
  };
}

export function getEmptySpacePosition() {
  const viewportBounds = getViewportBoundsForPlacement();
  const positionOffset = { x: 10, y: 10 };
  if (viewportBounds) {
    return {
      x: viewportBounds.x + positionOffset.x,
      y: viewportBounds.y + positionOffset.y,
    };
  }
  const {
    transform: [_x, _y, zoom],
  } = useReactFlow.getState();
  const overviewWidth = useLocalStorage.getState().overviewTrueWidth;
  const x = (overviewWidth - _x) / zoom;
  const y = -_y / zoom;
  return { x: x + positionOffset.x, y: y + positionOffset.y };
}
