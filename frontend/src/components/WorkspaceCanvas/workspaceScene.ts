import { SectionTypeEnum, type DictSectionImpl } from "utils/generatedTypes";
import {
  createWorkspaceCanvasControllerState,
  getWorkspaceControllerViewport,
  type WorkspaceCanvasControllerState,
  type WorkspaceSceneTarget,
} from "./workspaceController";
import { deriveDictScene } from "./workspaceDictScene";
import type { WorkspaceCodeHighlightCacheState } from "./workspaceHighlightCache";
import {
  buildCacheKey,
  buildWorkspaceSceneCacheKeys,
  compareHitRegions,
  deriveEdgePortRegions,
  deriveMinimapScene,
  deriveNestedDropZones,
  deriveNestedSectionLocalBounds,
  deriveResizeHandles,
  deriveRootSectionLocalBounds,
  deriveSectionGeometry,
  getChildLayoutDirection,
  getSectionHitZIndex,
  rectContainsPoint,
  rectKey,
  screenRectToWorkspaceRect,
  screenToWorkspace,
  unionRects,
} from "./workspaceSceneGeometry";
import {
  getActiveViewModeTopLevelSections,
  getEffectiveSectionSnapshot,
  getRootSectionIdsForScene,
  getSectionChildIds,
  getShownParamIdsForSection,
} from "./workspaceSceneProject";
import {
  DEFAULT_WORKSPACE_SCENE_REVISIONS,
  WORKSPACE_SCENE_GEOMETRY,
  type PendingSectionRecord,
  type WorkspaceHitRegion,
  type WorkspacePoint,
  type WorkspaceScene,
  type WorkspaceSceneOptions,
  type WorkspaceSceneProjectState,
  type WorkspaceSceneRevisionKeys,
  type WorkspaceSectionRenderModel,
  type WorkspaceSectionScene,
  type WorkspaceTypeErrorState,
} from "./workspaceSceneTypes";
import {
  buildWorkspaceTextMeasurementCacheKey,
  resolveWorkspaceTextPreview,
  WORKSPACE_TEXT_STYLES,
  type WorkspaceTextMeasurementCacheState,
  type WorkspaceTextStyleKey,
} from "./workspaceTextMeasurementCache";

export * from "./workspaceDictScene";
export * from "./workspaceSceneGeometry";
export * from "./workspaceSceneTypes";

type SectionDerivationArgs = {
  projectState: WorkspaceSceneProjectState;
  controllerState: WorkspaceCanvasControllerState;
  revisionKeys: WorkspaceSceneRevisionKeys;
  typeErrors: WorkspaceTypeErrorState;
  highlightCache: WorkspaceCodeHighlightCacheState | undefined;
  textMeasurementCache: WorkspaceTextMeasurementCacheState | undefined;
  topLevelSections: ReturnType<typeof getActiveViewModeTopLevelSections>;
  sectionsById: Record<string, WorkspaceSectionScene>;
  sectionOrder: Array<string>;
  hitRegions: Array<WorkspaceHitRegion>;
  sectionId: string;
  parent: WorkspaceSectionScene | null;
  sectionPath: Array<string>;
  childIndex: number;
};

type SectionDerivationContext = SectionDerivationArgs & {
  sectionOrderIndex: number;
  effectiveImpl: NonNullable<
    ReturnType<typeof getEffectiveSectionSnapshot>
  >["effectiveImpl"];
  sectionName: string;
  sectionTarget: Extract<WorkspaceSceneTarget, { kind: "section" }>;
};

export function createWorkspaceSceneRevisionKeys(
  overrides: Partial<WorkspaceSceneRevisionKeys> = {},
): WorkspaceSceneRevisionKeys {
  return { ...DEFAULT_WORKSPACE_SCENE_REVISIONS, ...overrides };
}

export function deriveWorkspaceScene({
  projectState,
  viewportSize,
  minimapSide = "left",
  minimapOverviewOffset = 0,
  minimapUiEditorOffset = 0,
  controllerState = createWorkspaceCanvasControllerState(),
  revisionKeys: revisionOverrides = {},
  typeErrors = {},
  highlightCache,
  textMeasurementCache,
}: WorkspaceSceneOptions): WorkspaceScene {
  const revisionKeys = createWorkspaceSceneRevisionKeys(revisionOverrides);
  const viewport = getWorkspaceControllerViewport(
    controllerState,
    projectState,
    viewportSize,
  );
  const visibleWorkspaceRect = screenRectToWorkspaceRect(
    { x: 0, y: 0, ...viewportSize },
    viewport,
  );
  const minimapVisibleWorkspaceRect = screenRectToWorkspaceRect(
    {
      x: Math.max(0, minimapOverviewOffset),
      y: 0,
      width: Math.max(
        0,
        viewportSize.width -
          Math.max(0, minimapOverviewOffset) -
          Math.max(0, minimapUiEditorOffset),
      ),
      height: viewportSize.height,
    },
    viewport,
  );
  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  const rootSectionIds = getRootSectionIdsForScene(
    projectState,
    topLevelSections,
  );
  const sectionsById: Record<string, WorkspaceSectionScene> = {};
  const sectionOrder: Array<string> = [];
  const hitRegions: Array<WorkspaceHitRegion> = [
    {
      id: "workspace:background",
      coordinateSpace: "workspace",
      rect: visibleWorkspaceRect,
      intent: "pan-viewport",
      target: { kind: "workspace" },
      zIndex: -1,
    },
  ];

  for (const sectionId of rootSectionIds) {
    deriveSectionRecursive({
      projectState,
      controllerState,
      revisionKeys,
      typeErrors,
      highlightCache,
      textMeasurementCache,
      topLevelSections,
      sectionsById,
      sectionOrder,
      hitRegions,
      sectionId,
      parent: null,
      sectionPath: [sectionId],
      childIndex: 0,
    });
  }

  const projectBounds =
    unionRects(
      sectionOrder.map((sectionId) => sectionsById[sectionId]?.worldBounds),
    ) ?? visibleWorkspaceRect;
  const minimap = deriveMinimapScene({
    projectBounds,
    sectionsById,
    sectionOrder,
    viewportSize,
    visibleWorkspaceRect: minimapVisibleWorkspaceRect,
    side: minimapSide,
    overviewOffset: minimapOverviewOffset,
    uiEditorOffset: minimapUiEditorOffset,
  });

  hitRegions.push(...minimap.hitRegions);
  hitRegions.sort(compareHitRegions);

  return {
    viewport,
    viewportSize,
    visibleWorkspaceRect,
    projectBounds,
    rootSectionIds,
    sectionOrder,
    sectionsById,
    minimap,
    hitRegions,
    revisionKeys,
    cacheKeys: buildWorkspaceSceneCacheKeys(revisionKeys),
  };
}

export function hitTestWorkspaceScene(
  scene: WorkspaceScene,
  screenPoint: WorkspacePoint,
): WorkspaceHitRegion | null {
  for (let idx = scene.hitRegions.length - 1; idx >= 0; idx -= 1) {
    const region = scene.hitRegions[idx];
    const point =
      region?.coordinateSpace === "screen"
        ? screenPoint
        : screenToWorkspace(screenPoint, scene.viewport);
    if (region && rectContainsPoint(region.rect, point)) {
      return region;
    }
  }
  return null;
}

function deriveSectionRecursive(args: SectionDerivationArgs) {
  const context = createSectionDerivationContext(args);
  if (!context) {
    return;
  }
  const sectionRecord = buildInitialSectionRecord(context);
  const provisional = finalizePendingSection(sectionRecord);
  context.sectionsById[context.sectionId] = provisional;
  context.sectionOrder.push(context.sectionId);

  sectionRecord.renderModel = deriveSectionRenderModel(context, provisional);
  if (sectionRecord.renderModel.kind === "dict") {
    sectionRecord.hitRegions.push(...sectionRecord.renderModel.dict.hitRegions);
  }
  const finalized = finalizePendingSection({
    ...sectionRecord,
    nestedDropZones: deriveNestedDropZones(
      provisional,
      sectionRecord.childIds,
      context.sectionsById,
    ),
  });
  context.sectionsById[context.sectionId] = finalized;
  context.hitRegions.push(...finalized.hitRegions);

  deriveChildSections(context, finalized);
  context.sectionsById[context.sectionId] = {
    ...finalized,
    nestedDropZones: deriveNestedDropZones(
      finalized,
      finalized.childIds,
      context.sectionsById,
    ),
  };
}

function createSectionDerivationContext(
  args: SectionDerivationArgs,
): SectionDerivationContext | null {
  const snapshot = getEffectiveSectionSnapshot(
    args.projectState,
    args.sectionId,
  );
  if (!snapshot) {
    return null;
  }
  return {
    ...args,
    sectionOrderIndex: args.sectionOrder.length,
    effectiveImpl: snapshot.effectiveImpl,
    sectionName:
      snapshot.core.name || snapshot.effectiveImpl.name || args.sectionId,
    sectionTarget: {
      kind: "section",
      sectionId: args.sectionId,
      sectionPath: args.sectionPath,
    },
  };
}

function buildInitialSectionRecord(
  context: SectionDerivationContext,
): PendingSectionRecord {
  const { localBounds, worldBounds } = deriveSectionBounds(context);
  const geometry = deriveSectionGeometry(worldBounds);
  const resizeHandles = deriveResizeHandles(worldBounds);
  const edgePortRegions = deriveEdgePortRegions({
    sectionId: context.sectionId,
    impl: context.effectiveImpl,
    geometry,
    target: context.sectionTarget,
    zIndexBase: getSectionHitZIndex(context.sectionOrderIndex, 80),
  });

  return {
    id: context.sectionId,
    type: context.effectiveImpl.type,
    name: context.sectionName,
    parentId: context.parent?.id ?? null,
    childIds: getSectionChildIds(
      context.projectState,
      context.sectionId,
      context.effectiveImpl,
    ),
    sectionPath: context.sectionPath,
    localBounds,
    worldBounds,
    zIndex: deriveSectionZIndex(context),
    selected: isSectionSelected(context),
    hovered: targetReferencesSection(
      context.controllerState.hoveredTarget,
      context.sectionId,
    ),
    active: isSectionActive(context),
    childLayoutDirection: getChildLayoutDirection(context.effectiveImpl),
    scrollOffset: getSectionScrollOffset(context),
    geometry,
    resizeHandles,
    titleTextPreview: deriveWorkspaceTextPreview(context, {
      baseKey: buildCacheKey(
        context.revisionKeys,
        "section-title-text",
        context.sectionId,
        rectKey(geometry.header),
      ),
      role: "section-title",
      text: context.sectionName,
      maxWidth: Math.max(0, geometry.header.width - 36),
    }),
    nestedDropZones: [],
    edgePortRegions,
    renderModel: null,
    hitRegions: [
      ...buildSectionHitRegions(context, geometry, resizeHandles),
      ...edgePortRegions,
    ],
    cacheKeys: {
      section: buildCacheKey(
        context.revisionKeys,
        "section",
        context.sectionId,
      ),
      geometry: buildCacheKey(
        context.revisionKeys,
        "section-geometry",
        context.sectionId,
        rectKey(worldBounds),
      ),
    },
  };
}

function deriveSectionBounds(context: SectionDerivationContext) {
  const localBounds = adjustAutoSectionBounds(
    context,
    context.parent
      ? deriveNestedSectionLocalBounds(
          context.parent,
          context.effectiveImpl,
          context.childIndex,
        )
      : deriveRootSectionLocalBounds(
          context.topLevelSections[context.sectionId],
          context.effectiveImpl,
        ),
  );
  const worldBounds = context.parent
    ? {
        ...localBounds,
        x: context.parent.worldBounds.x + localBounds.x,
        y: context.parent.worldBounds.y + localBounds.y,
      }
    : localBounds;
  return { localBounds, worldBounds };
}

function adjustAutoSectionBounds(
  context: SectionDerivationContext,
  localBounds: ReturnType<typeof deriveRootSectionLocalBounds>,
) {
  if (
    context.effectiveImpl.type !== SectionTypeEnum.Dict ||
    !isAutoSectionHeight(context.effectiveImpl) ||
    hasExplicitRootSectionHeight(context)
  ) {
    return localBounds;
  }
  const shown = getShownParamIdsForSection(
    context.projectState,
    context.sectionId,
  );
  const rowCount =
    Object.keys(shown.pinned.requiredParamIdsToPaths).length +
    Object.keys(shown.unpinned.requiredParamIdsToPaths).length;
  if (rowCount > 0) {
    return {
      ...localBounds,
      height: Math.min(
        WORKSPACE_SCENE_GEOMETRY.sectionAutoHeight,
        deriveAutoDictSectionHeight(rowCount),
      ),
    };
  }
  return {
    ...localBounds,
    height: WORKSPACE_SCENE_GEOMETRY.sectionEmptyDictAutoHeight,
  };
}

function hasExplicitRootSectionHeight(context: SectionDerivationContext) {
  return (
    !context.parent &&
    typeof context.topLevelSections[context.sectionId]?.h === "number"
  );
}

function deriveAutoDictSectionHeight(rowCount: number) {
  const rowPitch =
    WORKSPACE_SCENE_GEOMETRY.dictRowHeight +
    WORKSPACE_SCENE_GEOMETRY.dictRowGap;
  const rowsHeight =
    rowCount * rowPitch -
    WORKSPACE_SCENE_GEOMETRY.dictRowGap +
    WORKSPACE_SCENE_GEOMETRY.sectionBodyPadding * 2;
  return WORKSPACE_SCENE_GEOMETRY.sectionHeaderHeight + rowsHeight;
}

function isAutoSectionHeight(impl: SectionDerivationContext["effectiveImpl"]) {
  const size = impl.size as { height?: unknown } | undefined;
  const height = size?.height;
  return (
    height === "auto" ||
    (typeof height === "object" &&
      height !== null &&
      (height as { Auto?: unknown }).Auto === true)
  );
}

function deriveSectionZIndex(context: SectionDerivationContext) {
  return context.parent
    ? context.childIndex
    : context.topLevelSections[context.sectionId]?.zIndex ?? 0;
}

function isSectionActive(context: SectionDerivationContext) {
  return (context.projectState.projectConfig.activeIds ?? []).includes(
    context.sectionId,
  );
}

function getSectionScrollOffset(context: SectionDerivationContext) {
  return context.controllerState.sectionScrollOffsets[context.sectionId] ?? 0;
}

function buildSectionHitRegions(
  context: SectionDerivationContext,
  geometry: WorkspaceSectionScene["geometry"],
  resizeHandles: WorkspaceSectionScene["resizeHandles"],
): Array<WorkspaceHitRegion> {
  return [
    {
      id: `section:${context.sectionId}:header`,
      coordinateSpace: "workspace",
      rect: geometry.header,
      intent: "drag-section",
      target: context.sectionTarget,
      zIndex: getSectionHitZIndex(context.sectionOrderIndex, 20),
    },
    {
      id: `section:${context.sectionId}:body`,
      coordinateSpace: "workspace",
      rect: geometry.body,
      intent: "select-section",
      target: context.sectionTarget,
      zIndex: getSectionHitZIndex(context.sectionOrderIndex, 10),
    },
    ...buildResizeHitRegions(context, resizeHandles),
  ];
}

function buildResizeHitRegions(
  context: SectionDerivationContext,
  resizeHandles: WorkspaceSectionScene["resizeHandles"],
): Array<WorkspaceHitRegion> {
  const handles: Array<
    [
      string,
      WorkspaceSectionScene["resizeHandles"][keyof WorkspaceSectionScene["resizeHandles"]],
      number,
    ]
  > = [
    ["right", resizeHandles.right, 30],
    ["bottom", resizeHandles.bottom, 30],
    ["corner", resizeHandles.corner, 40],
  ];
  return handles.map(([kind, rect, layer]) => ({
    id: `section:${context.sectionId}:resize-${kind}`,
    coordinateSpace: "workspace",
    rect,
    intent: "resize-section",
    target: context.sectionTarget,
    zIndex: getSectionHitZIndex(context.sectionOrderIndex, layer),
  }));
}

function deriveSectionRenderModel(
  context: SectionDerivationContext,
  section: WorkspaceSectionScene,
): WorkspaceSectionRenderModel {
  if (context.effectiveImpl.type !== SectionTypeEnum.Dict) {
    return {
      kind: "placeholder",
      reason: `Canvas renderer for ${context.effectiveImpl.type} sections is not implemented yet.`,
    };
  }
  return {
    kind: "dict",
    dict: deriveDictScene({
      projectState: context.projectState,
      section,
      sectionImpl: context.effectiveImpl as DictSectionImpl,
      revisionKeys: context.revisionKeys,
      controllerState: context.controllerState,
      typeErrors: context.typeErrors,
      highlightCache: context.highlightCache,
      textMeasurementCache: context.textMeasurementCache,
    }),
  };
}

function deriveWorkspaceTextPreview(
  context: SectionDerivationContext,
  {
    baseKey,
    role,
    text,
    maxWidth,
  }: {
    baseKey: string;
    role: WorkspaceTextStyleKey;
    text: string;
    maxWidth: number;
  },
) {
  const font = WORKSPACE_TEXT_STYLES[role];
  return resolveWorkspaceTextPreview(context.textMeasurementCache, {
    cacheKey: buildWorkspaceTextMeasurementCacheKey({
      baseKey,
      role,
      text,
      font,
      maxWidth,
    }),
    text,
    font,
    maxWidth,
  });
}

function deriveChildSections(
  context: SectionDerivationContext,
  parent: WorkspaceSectionScene,
) {
  parent.childIds.forEach((childId, childIndex) => {
    deriveSectionRecursive({
      ...context,
      sectionId: childId,
      parent,
      sectionPath: [...context.sectionPath, childId],
      childIndex,
    });
  });
}

function finalizePendingSection(
  section: PendingSectionRecord,
): WorkspaceSectionScene {
  return {
    ...section,
    renderModel:
      section.renderModel ??
      ({
        kind: "placeholder",
        reason: `Canvas renderer for ${section.type} sections is not implemented yet.`,
      } satisfies WorkspaceSectionRenderModel),
  };
}

function isSectionSelected(context: SectionDerivationContext) {
  return (
    (context.projectState.projectConfig.activeIds ?? []).includes(
      context.sectionId,
    ) ||
    targetReferencesSection(
      context.controllerState.selectedTarget,
      context.sectionId,
    )
  );
}

function targetReferencesSection(
  target: WorkspaceSceneTarget | null,
  sectionId: string,
) {
  if (!target || target.kind === "workspace" || target.kind === "minimap") {
    return false;
  }
  return target.sectionPath.includes(sectionId);
}
