import { setCenter } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { useNodeInternals, useShareSession } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_create_top_level_section } from "utils/generatedEndpoints";
import {
  CreateTopLevelSectionRequestInput,
  Position,
  SectionType,
  SectionTypeEnum,
} from "utils/generatedTypes";
import {
  focusOnSectionSearch,
  focusOnSectionTextInput,
} from "utils/tabbingLogic";
import { applyActiveSectionChange } from "../activeSectionController";
import { getCurrProjectConfigId } from "../sectionInfos";
import { resolveTextBlockImplOverrides } from "./createSectionImplDefaults";
import { getSmartPlacementContext } from "./createSectionPlacement";

type CreateTopLevelSectionArgs = {
  implType: CreateTopLevelSectionRequestInput["implType"];
  implOverrides: CreateTopLevelSectionRequestInput["implOverrides"];
  controlCodeObjType?: CreateTopLevelSectionRequestInput["controlCodeObjType"];
  position?: Position | null;
  name?: string | null;
};

type CreateTopLevelSectionResult = {
  sectionId: string;
  metaControlParamId: string | null;
};

export async function createTopLevelSectionWithResult({
  implType,
  implOverrides,
  controlCodeObjType = null,
  position = null,
  name = null,
}: CreateTopLevelSectionArgs): Promise<CreateTopLevelSectionResult | null> {
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
    name,
    topLevelSections: placement.topLevelSections,
    viewportBounds: placement.viewportBounds,
  });

  if (!res200(res)) {
    return null;
  }
  const { sectionId, panTo, metaControlParamId } = res.data;
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
