import { setCenter } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { getPaneRect } from "forks/xyflow/core/utils/graph";
import {
  useLocalStorage,
  useNodeInternals,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_create_top_level_section } from "utils/generatedEndpoints";
import {
  CreateTopLevelSectionRequestInput,
  Position,
  SectionType,
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
  TopLevelSectionLayout,
  ViewportBounds,
} from "utils/generatedTypes";
import {
  focusOnSectionSearch,
  focusOnSectionTextInput,
} from "utils/tabbingLogic";
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
  if (useShareSession.getState().isShareMode) {
    return null;
  }
  const placement = getSmartPlacementContext();
  const resolvedImplOverrides = resolveTextBlockImplOverrides(
    implType,
    implOverrides,
  );
  const res = await route_create_top_level_section({
    projectConfigId: getCurrProjectConfigId(),
    implType,
    controlCodeObjType,
    implOverrides: resolvedImplOverrides,
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
  setActiveSectionIdAndUpdateZIndex(sectionId);
  ensureSectionOnTop(sectionId);
  if (
    implType === SectionTypeEnum.TextBlock ||
    implType === SectionTypeEnum.Code ||
    implType === SectionTypeEnum.Terminal
  ) {
    focusOnSectionTextInput(sectionId);
  }
  return sectionId;
}

function ensureSectionOnTop(sectionId: string, attempt = 0) {
  const nodeInternals = useNodeInternals.getState().x;
  if (nodeInternals.has(sectionId)) {
    setActiveSectionIdAndUpdateZIndex(sectionId);
    return;
  }
  if (attempt < 20) {
    requestAnimationFrame(() =>
      ensureSectionOnTop(sectionId, attempt + 1),
    );
  }
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
    focusOnSectionSearch(newId);
  });
}

export function addGroupInEmptySpace() {
  addSectionInEmptySpace(SectionTypeEnum.Group);
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
  const reactFlowState = useReactFlow.getState();
  const { width, height } = reactFlowState;
  if (width <= 0 || height <= 0) {
    return null;
  }
  const overviewWidth = useLocalStorage.getState().overviewTrueWidth;
  const paneRect = getPaneRect(reactFlowState, overviewWidth);
  if (paneRect.width <= 0 || paneRect.height <= 0) {
    return null;
  }
  return {
    x: paneRect.x,
    y: paneRect.y,
    w: paneRect.width,
    h: paneRect.height,
  };
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

function resolveTextBlockImplOverrides(
  implType: CreateTopLevelSectionRequestInput["implType"],
  implOverrides: CreateTopLevelSectionRequestInput["implOverrides"],
): CreateTopLevelSectionRequestInput["implOverrides"] {
  if (implType !== SectionTypeEnum.TextBlock) {
    return implOverrides;
  }

  if (!implOverrides) {
    return {
      type: SectionTypeEnum.TextBlock,
      textDisplayMode: TextBlockDisplayModeEnum.Edit,
    };
  }

  const resolvedBase =
    "type" in implOverrides && implOverrides.type
      ? implOverrides
      : { ...implOverrides, type: SectionTypeEnum.TextBlock };
  if ("textDisplayMode" in resolvedBase && resolvedBase.textDisplayMode) {
    return resolvedBase;
  }

  return {
    ...resolvedBase,
    textDisplayMode: TextBlockDisplayModeEnum.Edit,
  };
}
