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
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
  TopLevelSectionLayout,
  ViewportBounds,
} from "utils/generatedTypes";
import { validateSectionNameInput } from "utils/nameValidation";
import {
  focusOnSectionSearch,
  focusOnSectionTextInput,
} from "utils/tabbingLogic";
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
  if (useShareSession.getState().isDeploymentMode) {
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
    applyActiveSectionChange({ interaction: "go-to", sectionId });
    return;
  }
  if (attempt < 20) {
    requestAnimationFrame(() => ensureSectionOnTop(sectionId, attempt + 1));
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
  return createTopLevelSectionLayoutDict(
    projectState.sections,
    nodeInternals,
    projectState.projectConfig.topLevelSections,
  );
}

function getViewportBoundsForPlacement(): ViewportBounds | null {
  const reactFlowState = useReactFlow.getState();
  const { width, height } = reactFlowState;
  if (width <= 0 || height <= 0) {
    return null;
  }
  const overviewWidth = useLocalStorage.getState().overviewTrueWidth;
  const uiEditorWidth = useLocalStorage.getState().uiEditorTrueWidth;
  const paneRect = getPaneRect(reactFlowState, overviewWidth, uiEditorWidth);
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

function normalizeSectionNameCandidate(value: string): string {
  return value
    .replace(/[\\/]/g, " ")
    .replace(/\.\./g, " ")
    .replace(/[^A-Za-z0-9 _-]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .trim();
}

export function getValidSectionNameForOpenedFile(fileName: string): string {
  const trimmedName = fileName.trim();
  const extensionIndex = trimmedName.lastIndexOf(".");
  const baseName =
    extensionIndex > 0 ? trimmedName.slice(0, extensionIndex).trim() : trimmedName;
  const fallbackName = "Opened File";
  const candidates = [trimmedName, baseName, fallbackName];

  for (const candidate of candidates) {
    const normalized = normalizeSectionNameCandidate(candidate);
    if (!normalized) {
      continue;
    }
    if (validateSectionNameInput(normalized) === null) {
      return normalized;
    }
  }

  return fallbackName;
}

export async function openFileInCodeSection({
  filePath,
  fileName,
  codeLanguage,
}: OpenFileInCodeSectionArgs) {
  if (useShareSession.getState().isDeploymentMode) {
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
    name: getValidSectionNameForOpenedFile(fileName),
  });
  goToSection(newSectionId);
  return newSectionId;
}

type OpenFileInTextSectionArgs = {
  fileName: string;
  text: string;
  format: TextBlockFormatEnum;
  textDisplayMode: TextBlockDisplayModeEnum;
};

export async function openFileInTextSection({
  fileName,
  text,
  format,
  textDisplayMode,
}: OpenFileInTextSectionArgs) {
  if (useShareSession.getState().isDeploymentMode) {
    return null;
  }
  const newSectionId = await createTopLevelSection({
    implType: SectionTypeEnum.TextBlock,
    implOverrides: {
      type: SectionTypeEnum.TextBlock,
      format,
      textDisplayMode,
      text,
    },
    position: null,
  });
  if (!newSectionId) {
    return null;
  }
  await route_set_section_name({
    projectConfigId: getCurrProjectConfigId(),
    sectionId: newSectionId,
    name: getValidSectionNameForOpenedFile(fileName),
  });
  goToSection(newSectionId);
  return newSectionId;
}

type OpenFileInImageSectionArgs = {
  filePath: string;
  fileName: string;
};

export async function openFileInImageSection({
  filePath,
  fileName,
}: OpenFileInImageSectionArgs) {
  if (useShareSession.getState().isDeploymentMode) {
    return null;
  }
  const projectState = useProjectState.getState();
  for (const sectionId of Object.keys(projectState.sections)) {
    const impl = getCurrEffectiveSectionImpl(projectState, sectionId);
    if (impl.type !== SectionTypeEnum.Image) {
      continue;
    }
    if (impl.imagePath === filePath) {
      goToSection(sectionId);
      return sectionId;
    }
  }

  const newSectionId = await createTopLevelSection({
    implType: SectionTypeEnum.Image,
    implOverrides: {
      type: SectionTypeEnum.Image,
      imagePath: filePath,
    },
    position: null,
  });
  if (!newSectionId) {
    return null;
  }
  await route_set_section_name({
    projectConfigId: getCurrProjectConfigId(),
    sectionId: newSectionId,
    name: getValidSectionNameForOpenedFile(fileName),
  });
  goToSection(newSectionId);
  return newSectionId;
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
