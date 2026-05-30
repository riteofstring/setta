import {
  callOpenAPI,
  res200,
  type ResponseDataAndStatus,
} from "@setta/app-subsystem-frontend-sdk";
import { getPaneRect } from "gpuFlow/flowGeometry";
import {
  gpuFlowLayoutStore,
  type GpuFlowLayoutNode,
} from "gpuFlow/layoutStore";
import { getViewport, getZoom, setCenter } from "gpuFlow/viewportActions";
import { gpuFlowViewportStore } from "gpuFlow/viewportStore";
import {
  createTopLevelSection as createTopLevelSectionRequest,
  setSectionName,
  type CreateTopLevelSectionData,
} from "openapi/http";
import {
  useLocalStorage,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { CodeLanguage, resolveCodeLanguageFromPath } from "utils/codeLanguage";
import { resolveFileDropSectionKind } from "utils/fileDropSectionKind";
import {
  CodeFileAccessModeEnum,
  Position,
  SectionType,
  SectionTypeEnum,
  TextBlockDisplayModeEnum,
  TextBlockFormatEnum,
  TopLevelSectionLayout,
  ViewportBounds,
  type CreateTopLevelSectionResult,
} from "utils/generatedTypes";
import { validateSectionNameInput } from "utils/nameValidation";
import {
  focusOnSectionSearch,
  focusOnSectionTextInput,
} from "utils/tabbingLogic";
import { applyActiveSectionChange } from "../activeSectionController";
import {
  copyExistingTopLevelSectionLayouts,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "../sectionInfos";
import { getPositiveTopLevelLayoutDimension } from "../sectionInfos/topLevelSectionNode";
import { goToSection } from "./sectionPositions";

type CreateTopLevelSectionRequestBody = CreateTopLevelSectionData["body"];
type CreateTopLevelSectionImplOverrides =
  | CreateTopLevelSectionRequestBody["implOverrides"]
  | null;
type TextBlockDisplayMode =
  (typeof TextBlockDisplayModeEnum)[keyof typeof TextBlockDisplayModeEnum];
type TextBlockFormat =
  (typeof TextBlockFormatEnum)[keyof typeof TextBlockFormatEnum];

type CreateTopLevelSectionArgs = {
  implType: SectionType;
  implOverrides: CreateTopLevelSectionImplOverrides;
  controlCodeObjType?: CreateTopLevelSectionRequestBody["controlCodeObjType"];
  position?: Position | null;
  name?: string | null;
};
type CreatedTopLevelSection = {
  sectionId: string;
  metaControlParamId: string | null;
};
type SmartPlacementContext = {
  topLevelSections: Record<string, TopLevelSectionLayout>;
  viewportBounds: ViewportBounds | null;
};
type CreateTopLevelSectionRouteResponse =
  ResponseDataAndStatus<CreateTopLevelSectionResult>;
type ExistingSectionMatcher = (
  impl: ReturnType<typeof getCurrEffectiveSectionImpl>,
) => boolean;
type CreateNamedFileSectionArgs = {
  createArgs: CreateTopLevelSectionArgs;
  fileName: string;
  focusOnSection: boolean;
};
function isDeploymentModeEnabled() {
  return useShareSession.getState().isDeploymentMode;
}
function resolveCreateTopLevelSectionPosition(
  position: Position | null,
  placement: SmartPlacementContext,
) {
  if (position !== null) {
    return position;
  }
  if (
    placement.viewportBounds !== null ||
    Object.keys(placement.topLevelSections).length > 0
  ) {
    return null;
  }
  return getEmptySpacePosition();
}
function shouldFocusCreatedSectionTextInput(implType: SectionType) {
  const focusableSectionTypes: readonly SectionType[] = [
    SectionTypeEnum.TextBlock,
    SectionTypeEnum.Code,
    SectionTypeEnum.Terminal,
  ];
  return focusableSectionTypes.includes(implType);
}
async function requestTopLevelSectionCreation(
  {
    implType,
    implOverrides,
    controlCodeObjType,
    position,
    name,
  }: CreateTopLevelSectionArgs,
  placement: SmartPlacementContext,
): Promise<CreateTopLevelSectionRouteResponse> {
  return (await callOpenAPI(
    createTopLevelSectionRequest({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        implType,
        controlCodeObjType,
        implOverrides: resolveTextBlockImplOverrides(implType, implOverrides),
        position: resolveCreateTopLevelSectionPosition(
          position ?? null,
          placement,
        ),
        name,
        topLevelSections: placement.topLevelSections,
        viewportBounds: placement.viewportBounds,
      },
    } as Parameters<typeof createTopLevelSectionRequest>[0]) as Parameters<
      typeof callOpenAPI
    >[0],
  )) as CreateTopLevelSectionRouteResponse;
}
function centerViewportOnCreatedSection(
  panTo: CreateTopLevelSectionResult["panTo"],
) {
  if (!panTo) {
    return;
  }
  setCenter(panTo.x, panTo.y, {
    overviewWidth: useLocalStorage.getState().overviewTrueWidth,
    zoom: getZoom(),
  });
}
function handleCreatedTopLevelSection(
  sectionId: string,
  implType: SectionType,
  panTo: CreateTopLevelSectionResult["panTo"],
) {
  centerViewportOnCreatedSection(panTo);
  ensureSectionOnTop(sectionId);
  if (shouldFocusCreatedSectionTextInput(implType)) {
    focusOnSectionTextInput(sectionId);
  }
}
export async function createTopLevelSectionWithResult({
  implType,
  implOverrides,
  controlCodeObjType = null,
  position = null,
  name = null,
}: CreateTopLevelSectionArgs): Promise<CreatedTopLevelSection | null> {
  if (isDeploymentModeEnabled()) {
    return null;
  }
  const placement = getSmartPlacementContext();
  const res = await requestTopLevelSectionCreation(
    {
      implType,
      implOverrides,
      controlCodeObjType,
      position,
      name,
    },
    placement,
  );
  if (!res200(res)) {
    return null;
  }
  const { sectionId, panTo, metaControlParamId } = res.data;
  handleCreatedTopLevelSection(sectionId, implType, panTo);
  return {
    sectionId,
    metaControlParamId: metaControlParamId ?? null,
  };
}
export async function createTopLevelSection({
  implType,
  implOverrides,
  controlCodeObjType = null,
  position = null,
  name = null,
}: CreateTopLevelSectionArgs): Promise<string | null> {
  const created = await createTopLevelSectionWithResult({
    implType,
    implOverrides,
    controlCodeObjType,
    position,
    name,
  });
  if (!created) {
    return null;
  }
  return created.sectionId;
}
function ensureSectionOnTop(sectionId: string, attempt = 0) {
  if (gpuFlowLayoutStore.getState().getNode(sectionId)) {
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
  const topLevelSections = copyExistingTopLevelSectionLayouts(
    projectState.sections,
    projectState.projectConfig.topLevelSections,
  );
  for (const layoutNode of gpuFlowLayoutStore.getState().getNodes()) {
    if (!(layoutNode.nodeId in projectState.sections)) {
      continue;
    }
    topLevelSections[layoutNode.nodeId] =
      buildTopLevelSectionLayoutFromGpuLayoutNode(
        layoutNode,
        topLevelSections[layoutNode.nodeId],
      );
  }
  return topLevelSections;
}
function buildTopLevelSectionLayoutFromGpuLayoutNode(
  layoutNode: GpuFlowLayoutNode,
  existingLayout?: TopLevelSectionLayout,
): TopLevelSectionLayout {
  const nextLayout = existingLayout
    ? { ...existingLayout }
    : { h: null, w: null, x: layoutNode.x, y: layoutNode.y, zIndex: 0 };
  nextLayout.x = layoutNode.x;
  nextLayout.y = layoutNode.y;
  if (layoutNode.zIndex !== undefined) {
    nextLayout.zIndex = layoutNode.zIndex;
  }
  if (getPositiveTopLevelLayoutDimension(layoutNode.width) !== null) {
    nextLayout.w = layoutNode.width;
  }
  if (getPositiveTopLevelLayoutDimension(layoutNode.height) !== null) {
    nextLayout.h = layoutNode.height;
  }
  return nextLayout;
}
function getViewportBoundsForPlacement(): ViewportBounds | null {
  const viewportState = gpuFlowViewportStore.getState();
  const { width, height } = viewportState;
  if (width <= 0 || height <= 0) {
    return null;
  }
  const overviewWidth = useLocalStorage.getState().overviewTrueWidth;
  const uiEditorWidth = useLocalStorage.getState().uiEditorTrueWidth;
  const paneRect = getPaneRect(viewportState, overviewWidth, uiEditorWidth);
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
function findExistingTopLevelSectionId(
  matcher: ExistingSectionMatcher,
): string | null {
  const projectState = useProjectState.getState();
  for (const sectionId of Object.keys(projectState.sections)) {
    const impl = getCurrEffectiveSectionImpl(projectState, sectionId);
    if (matcher(impl)) {
      return sectionId;
    }
  }
  return null;
}
function focusSectionIfNeeded(sectionId: string, focusOnSection: boolean) {
  if (focusOnSection) {
    goToSection(sectionId);
  }
}
async function finalizeOpenedFileSection(
  sectionId: string,
  fileName: string,
  focusOnSection: boolean,
) {
  await callOpenAPI(
    setSectionName({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        sectionId,
        name: getValidSectionNameForOpenedFile(fileName),
      },
    } as Parameters<typeof setSectionName>[0]) as Parameters<
      typeof callOpenAPI
    >[0],
  );
  focusSectionIfNeeded(sectionId, focusOnSection);
  return sectionId;
}
async function createNamedFileSection({
  createArgs,
  fileName,
  focusOnSection,
}: CreateNamedFileSectionArgs) {
  const sectionId = await createTopLevelSection(createArgs);
  if (!sectionId) {
    return null;
  }
  return finalizeOpenedFileSection(sectionId, fileName, focusOnSection);
}
async function openExistingOrCreateNamedFileSection({
  findExistingSectionId,
  createArgs,
  fileName,
  focusOnSection,
}: CreateNamedFileSectionArgs & {
  findExistingSectionId: () => string | null;
}) {
  const existingSectionId = findExistingSectionId();
  if (existingSectionId) {
    focusSectionIfNeeded(existingSectionId, focusOnSection);
    return existingSectionId;
  }
  return createNamedFileSection({ createArgs, fileName, focusOnSection });
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
  const { x: viewportX, y: viewportY, zoom } = getViewport();
  const overviewWidth = useLocalStorage.getState().overviewTrueWidth;
  const x = (overviewWidth - viewportX) / zoom;
  const y = -viewportY / zoom;
  return { x: x + positionOffset.x, y: y + positionOffset.y };
}
type OpenFileInCodeSectionArgs = {
  filePath: string;
  fileName: string;
  codeLanguage: CodeLanguage;
  position?: Position | null;
  focusOnSection?: boolean;
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
function getValidSectionNameForOpenedFile(fileName: string): string {
  const trimmedName = fileName.trim();
  const extensionIndex = trimmedName.lastIndexOf(".");
  const baseName =
    extensionIndex > 0
      ? trimmedName.slice(0, extensionIndex).trim()
      : trimmedName;
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
  position = null,
  focusOnSection = true,
}: OpenFileInCodeSectionArgs) {
  if (isDeploymentModeEnabled()) {
    return null;
  }
  return openExistingOrCreateNamedFileSection({
    findExistingSectionId: () =>
      findExistingTopLevelSectionId((impl) => {
        if (impl.type !== SectionTypeEnum.Code) {
          return false;
        }
        return impl.codeFileBinding?.canonical_path === filePath;
      }),
    createArgs: {
      implType: SectionTypeEnum.Code,
      implOverrides: {
        type: SectionTypeEnum.Code,
        codeLanguage,
        codeFileBinding: {
          canonical_path: filePath,
          access_mode: CodeFileAccessModeEnum.read_write,
        },
      },
      position,
    },
    fileName,
    focusOnSection,
  });
}
type OpenFileInTextSectionArgs = {
  fileName: string;
  text: string;
  format: TextBlockFormat;
  textDisplayMode: TextBlockDisplayMode;
  position?: Position | null;
  focusOnSection?: boolean;
};
export async function openFileInTextSection({
  fileName,
  text,
  format,
  textDisplayMode,
  position = null,
  focusOnSection = true,
}: OpenFileInTextSectionArgs) {
  if (isDeploymentModeEnabled()) {
    return null;
  }
  return createNamedFileSection({
    createArgs: {
      implType: SectionTypeEnum.TextBlock,
      implOverrides: {
        type: SectionTypeEnum.TextBlock,
        format,
        textDisplayMode,
        text,
      },
      position,
    },
    fileName,
    focusOnSection,
  });
}
type OpenFileInImageSectionArgs = {
  filePath: string;
  fileName: string;
  position?: Position | null;
  focusOnSection?: boolean;
};
export async function openFileInImageSection({
  filePath,
  fileName,
  position = null,
  focusOnSection = true,
}: OpenFileInImageSectionArgs) {
  if (isDeploymentModeEnabled()) {
    return null;
  }
  return openExistingOrCreateNamedFileSection({
    findExistingSectionId: () =>
      findExistingTopLevelSectionId(
        (impl) =>
          impl.type === SectionTypeEnum.Image && impl.imagePath === filePath,
      ),
    createArgs: {
      implType: SectionTypeEnum.Image,
      implOverrides: {
        type: SectionTypeEnum.Image,
        imagePath: filePath,
      },
      position,
    },
    fileName,
    focusOnSection,
  });
}
type OpenFileInSpreadsheetSectionArgs = {
  filePath: string;
  fileName: string;
  position?: Position | null;
  focusOnSection?: boolean;
};
export async function openFileInSpreadsheetSection({
  filePath,
  fileName,
  position = null,
  focusOnSection = true,
}: OpenFileInSpreadsheetSectionArgs) {
  if (isDeploymentModeEnabled()) {
    return null;
  }
  const normalizedPath = filePath.trim();
  return openExistingOrCreateNamedFileSection({
    findExistingSectionId: () =>
      findExistingTopLevelSectionId(
        (impl) =>
          impl.type === SectionTypeEnum.Spreadsheet &&
          impl.filePath.trim() === normalizedPath,
      ),
    createArgs: {
      implType: SectionTypeEnum.Spreadsheet,
      implOverrides: {
        type: SectionTypeEnum.Spreadsheet,
        filePath: normalizedPath,
        activeSheet: null,
      },
      position,
    },
    fileName,
    focusOnSection,
  });
}
type OpenFileAsSectionResult =
  | {
      status: "opened";
      sectionId: string;
    }
  | {
      status: "unsupported_binary";
    }
  | {
      status: "failed";
    };
export async function openFileAsSectionForDrop({
  filePath,
  fileName,
  position,
  focusOnSection = true,
}: {
  filePath: string;
  fileName: string;
  position: Position | null;
  focusOnSection?: boolean;
}): Promise<OpenFileAsSectionResult> {
  const kind = resolveFileDropSectionKind({ fileName, filePath });
  if (kind === "unsupported_binary") {
    return { status: "unsupported_binary" };
  }
  const sectionId =
    kind === "spreadsheet"
      ? await openFileInSpreadsheetSection({
          filePath,
          fileName,
          position,
          focusOnSection,
        })
      : kind === "image"
        ? await openFileInImageSection({
            filePath,
            fileName,
            position,
            focusOnSection,
          })
        : await openFileInCodeSection({
            filePath,
            fileName,
            codeLanguage: resolveCodeLanguageFromPath(filePath),
            position,
            focusOnSection,
          });
  if (!sectionId) {
    return { status: "failed" };
  }
  return { status: "opened", sectionId };
}
function resolveTextBlockImplOverrides(
  implType: SectionType,
  implOverrides: CreateTopLevelSectionImplOverrides,
): CreateTopLevelSectionImplOverrides {
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
