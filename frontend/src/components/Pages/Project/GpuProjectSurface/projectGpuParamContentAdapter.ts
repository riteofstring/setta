import {
  getSectionParamUIRendererFamily,
  type SectionParamUIRendererFamily,
} from "components/Params/ParamUIs/paramUIRendererMetadata";
import {
  resolveFilteredParamRows,
  type FilteredParamRows,
} from "components/Params/paramListFiltering";
import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentRowInput,
} from "gpuFlow/retainedContentScene";
import type { GpuContentSurface, GpuSectionSceneNode } from "gpuFlow/scene";
import type { GpuRect } from "gpuFlow/viewportMath";
import { buildParamTreeView } from "state/actions/params/paramTree";
import {
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrEffectiveSectionImplWithTypeGuardIfPresent,
  getCurrSectionVariantId,
  getCurrShownParamIds,
  getParamDisplayNameIfPresent,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
  type CodeObjType,
  type DictSectionImpl,
} from "utils/generatedTypes";

export const PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX = 28;

type ProjectGpuParamListKey = "pinned" | "unpinned";

type ProjectGpuParamListRows = {
  readonly key: ProjectGpuParamListKey;
  readonly rows: readonly GpuRetainedContentRowInput[];
};

export function createProjectGpuParamContentSurfaces({
  projectState,
  sections,
}: {
  readonly projectState: ZustandProjectState;
  readonly sections: readonly GpuSectionSceneNode[];
}): readonly GpuContentSurface[] {
  return sections.flatMap((section) =>
    createProjectGpuParamContentSurfacesForSection({
      projectState,
      section,
    }),
  );
}

function createProjectGpuParamContentSurfacesForSection({
  projectState,
  section,
}: {
  readonly projectState: ZustandProjectState;
  readonly section: GpuSectionSceneNode;
}): readonly GpuContentSurface[] {
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuardIfPresent(
    projectState,
    section.sectionId,
    isBaseSectionWithParamsImpl,
  );
  if (!sectionImpl || sectionImpl.type !== SectionTypeEnum.Dict) {
    return [];
  }
  const dictSectionImpl = sectionImpl as DictSectionImpl;

  const listRows = createProjectGpuParamListRows({
    projectState,
    sectionId: section.sectionId,
    sectionImpl: dictSectionImpl,
  });
  return createProjectGpuParamListContentSurfaces({
    listRows,
    section,
  });
}

function createProjectGpuParamListRows({
  projectState,
  sectionId,
  sectionImpl,
}: {
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: DictSectionImpl;
}): readonly ProjectGpuParamListRows[] {
  return (["pinned", "unpinned"] as const).flatMap((key) => {
    if (key === "unpinned" && sectionImpl.hideUnpinnedParams) {
      return [];
    }
    const shown = getProjectGpuShownParamRowsIfPresent({
      key,
      projectState,
      sectionId,
      sectionImpl,
    });
    if (!shown) {
      return [];
    }
    const normalizedShown = normalizeProjectGpuShownParamRows({
      key,
      sectionId,
      shown,
    });
    const filteredRows = resolveFilteredParamRows({
      paramFilter: sectionImpl.paramFilter,
      paramIds: normalizedShown.topLevelParamIds,
      requiredParamIdsToPaths: normalizedShown.requiredParamIdsToPaths,
      sectionId,
      state: projectState,
    });
    if (filteredRows.paramIds.length === 0) {
      return [];
    }
    return [
      {
        key,
        rows: createProjectGpuParamRows({
          filteredRows,
          projectState,
          sectionId,
          sectionImpl,
        }),
      },
    ];
  });
}

function getProjectGpuShownParamRowsIfPresent({
  key,
  projectState,
  sectionId,
  sectionImpl,
}: {
  readonly key: ProjectGpuParamListKey;
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: DictSectionImpl;
}) {
  const sectionVariantId = getCurrSectionVariantId(
    projectState,
    sectionId,
    true,
  );
  if (!projectState.shownParamIds[sectionVariantId]) {
    if (Object.keys(sectionImpl.codeObjVariantMap).length > 0) {
      throw new Error(
        `Missing shown param ids for GPU param content section ${sectionId}.`,
      );
    }
    return null;
  }
  return getCurrShownParamIds(projectState, sectionId, key === "pinned", true);
}

function normalizeProjectGpuShownParamRows({
  key,
  sectionId,
  shown,
}: {
  readonly key: ProjectGpuParamListKey;
  readonly sectionId: string;
  readonly shown: ReturnType<typeof getCurrShownParamIds>;
}): {
  readonly requiredParamIdsToPaths: Record<string, string[]>;
  readonly topLevelParamIds: string[];
} {
  if (!Array.isArray(shown.topLevelParamIds)) {
    throw new Error(
      `Invalid ${key} shown param ids for GPU param content section ${sectionId}.`,
    );
  }
  const requiredParamIdsToPaths: Record<string, string[]> = {};
  for (const [paramId, path] of Object.entries(
    shown.requiredParamIdsToPaths ?? {},
  )) {
    if (!Array.isArray(path)) {
      throw new Error(
        `Invalid shown param path for GPU param content row ${paramId} in section ${sectionId}.`,
      );
    }
    requiredParamIdsToPaths[paramId] = [...path];
  }
  return {
    requiredParamIdsToPaths,
    topLevelParamIds: [...shown.topLevelParamIds],
  };
}

function createProjectGpuParamRows({
  filteredRows,
  projectState,
  sectionId,
  sectionImpl,
}: {
  readonly filteredRows: FilteredParamRows;
  readonly projectState: ZustandProjectState;
  readonly sectionId: string;
  readonly sectionImpl: DictSectionImpl;
}): readonly GpuRetainedContentRowInput[] {
  const tree = buildParamTreeView(
    projectState,
    sectionId,
    filteredRows.paramIds,
    filteredRows.requiredParamIdsToPaths,
  );
  const selectedParamIds = new Set(sectionImpl.selectedParams ?? []);
  const edgeInputParamIds = new Set(sectionImpl.edgeInputParams);
  return tree.flat.map((row) => {
    const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
      projectState,
      sectionId,
      row.id,
      isBaseParamCodeObjImpl,
    );
    if (!codeObjImpl) {
      throw new Error(
        `Missing GPU retained param row ${row.id} in section ${sectionId}.`,
      );
    }
    return {
      controlKind: getProjectGpuParamControlKind({
        fallbackType: codeObjImpl.type as CodeObjType,
        isParent: row.isParent,
        rendererFamily: getSectionParamUIRendererFamily(
          codeObjImpl.type as CodeObjType,
        ),
      }),
      depth: row.depth,
      id: row.id,
      label:
        getParamDisplayNameIfPresent(projectState, sectionId, row.id) ?? row.id,
      ports: edgeInputParamIds.has(row.id)
        ? [{ id: row.id, kind: "input", side: "left" }]
        : [],
      state: {
        selected: selectedParamIds.has(row.id),
      },
    };
  });
}

function getProjectGpuParamControlKind({
  fallbackType,
  isParent,
  rendererFamily,
}: {
  readonly fallbackType: CodeObjType;
  readonly isParent: boolean;
  readonly rendererFamily: SectionParamUIRendererFamily | null;
}): string {
  if (isParent) {
    return "nested";
  }
  return rendererFamily ?? fallbackType;
}

function createProjectGpuParamListContentSurfaces({
  listRows,
  section,
}: {
  readonly listRows: readonly ProjectGpuParamListRows[];
  readonly section: GpuSectionSceneNode;
}): readonly GpuContentSurface[] {
  const surfaces: GpuContentSurface[] = [];
  let nextLocalY = 0;
  for (const list of listRows) {
    const remainingHeight = Math.max(0, section.bodyRect.height - nextLocalY);
    const contentHeight =
      list.rows.length * PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX;
    const height =
      list.key === "pinned"
        ? Math.min(remainingHeight, contentHeight)
        : remainingHeight;
    if (height <= 0) {
      continue;
    }
    const localRect = {
      height,
      width: section.bodyRect.width,
      x: 0,
      y: nextLocalY,
    };
    const surfaceId = getProjectGpuParamContentSurfaceId(
      section.sectionId,
      list.key,
    );
    const rect = translateProjectGpuParamLocalRect(localRect, section.bodyRect);
    surfaces.push({
      clipRect: intersectProjectGpuParamRects(rect, section.clipRect),
      id: surfaceId,
      ownerSectionId: section.sectionId,
      rect,
      retainedScene: createGpuRetainedRowContentScene({
        id: surfaceId,
        ownerSectionId: section.sectionId,
        rowHeight: PROJECT_GPU_PARAM_CONTENT_ROW_HEIGHT_PX,
        rows: list.rows,
        scrollOffset: { x: 0, y: 0 },
        viewportRect: {
          height: localRect.height,
          width: localRect.width,
          x: 0,
          y: 0,
        },
      }),
      renderer: { kind: "canvas-content", surfaceId },
      zIndex: (section.zIndex ?? 0) + 1,
    });
    nextLocalY += height;
  }
  return surfaces;
}

function getProjectGpuParamContentSurfaceId(
  sectionId: string,
  key: ProjectGpuParamListKey,
): string {
  return `${sectionId}:param-content:${key}`;
}

function translateProjectGpuParamLocalRect(
  localRect: GpuRect,
  sectionRect: GpuRect,
): GpuRect {
  return {
    height: Math.min(localRect.height, sectionRect.height),
    width: Math.min(localRect.width, sectionRect.width),
    x: sectionRect.x + localRect.x,
    y: sectionRect.y + localRect.y,
  };
}

function intersectProjectGpuParamRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const maxX = Math.min(left.x + left.width, right.x + right.width);
  const maxY = Math.min(left.y + left.height, right.y + right.height);
  return {
    height: Math.max(0, maxY - y),
    width: Math.max(0, maxX - x),
    x,
    y,
  };
}
