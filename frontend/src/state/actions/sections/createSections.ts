import { setCenter } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { getPaneRect } from "forks/xyflow/core/utils/graph";
import {
  useLocalStorage,
  useNodeInternals,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { CodeLanguage } from "utils/codeLanguage";
import { res200 } from "utils/endpointUtils";
import { focusOnSectionSearch } from "utils/focusManager";
import {
  route_create_top_level_section,
  route_set_section_name,
} from "utils/generatedEndpoints";
import {
  CodeFileAccessModeEnum,
  CreateTopLevelSectionRequestInput,
  Position,
  SectionType,
  SectionTypeEnum,
  TopLevelSectionLayout,
  ViewportBounds,
} from "utils/generatedTypes";
import { applyActiveSectionChange } from "../activeSectionController";
import {
  createTopLevelSectionLayoutDict,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "../sectionInfos";
import { goToSection } from "./sectionPositions";

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
    applyActiveSectionChange({ interaction: "go-to", sectionId: newId });
    focusOnSectionSearch(newId);
  });
}

export function addGroupInEmptySpace() {
  addSectionInEmptySpace(SectionTypeEnum.Group, (newId) => {
    applyActiveSectionChange({ interaction: "go-to", sectionId: newId });
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

type OpenFileInCodeSectionArgs = {
  filePath: string;
  fileName: string;
  codeLanguage: CodeLanguage;
};

export async function openFileInCodeSection({
  filePath,
  fileName,
  codeLanguage,
}: OpenFileInCodeSectionArgs) {
  if (useShareSession.getState().isShareMode) {
    return null;
  }
  const projectState = useProjectState.getState();
  for (const sectionId of Object.keys(projectState.sections)) {
    const impl = getCurrEffectiveSectionImpl(projectState, sectionId);
    if (impl.type !== SectionTypeEnum.Code) {
      continue;
    }
    const binding = impl.codeFileBinding;
    if (!binding) {
      continue;
    }
    if (binding.canonical_path === filePath) {
      goToSection(sectionId);
      return sectionId;
    }
  }
  const newSectionId = await createTopLevelSection({
    implType: SectionTypeEnum.Code,
    implOverrides: {
      type: SectionTypeEnum.Code,
      codeLanguage,
      codeFileBinding: {
        canonical_path: filePath,
        access_mode: CodeFileAccessModeEnum.read_write,
      },
    },
    position: null,
  });
  if (!newSectionId) {
    return null;
  }
  await route_set_section_name({
    projectConfigId: getCurrProjectConfigId(),
    sectionId: newSectionId,
    name: fileName,
  });
  goToSection(newSectionId);
  return newSectionId;
}
