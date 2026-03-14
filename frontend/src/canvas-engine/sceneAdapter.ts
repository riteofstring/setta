import { CanvasEngineSpatialIndex } from "canvas-engine/spatialIndex";
import type {
  CanvasEngineAgenticEdge,
  CanvasEngineCamera,
  CanvasEngineDataEdge,
  CanvasEngineNestedPreviewRect,
  CanvasEngineRect,
  CanvasEngineSceneSnapshot,
  CanvasEngineViewport,
} from "canvas-engine/types";
import type {
  ProjectConfig,
  TopLevelSectionLayout,
} from "utils/generatedTypes";

type DataEdgeInput = ProjectConfig["edges"][number];
type AgenticEdgeInput = ProjectConfig["agenticEdges"][number];

export type CanvasEngineEdgeHandlePosition = {
  sectionId: string;
  portId: string;
  type: "source" | "target";
  x: number;
  y: number;
};

export type CanvasEngineSectionEdgePorts = {
  inputPortIds: string[];
  outputPortIds: string[];
};

export type CanvasEngineSceneAdapterConfig = {
  defaultSectionWidth: number;
  defaultSectionHeight: number;
  viewportPaddingPx: number;
  spatialIndexCellSize: number;
};

export type CanvasEngineProjectSceneInput = {
  topLevelSections: Record<string, TopLevelSectionLayout>;
  activeSectionIds: string[];
  nestedPreviewRects: CanvasEngineNestedPreviewRect[];
  edges: ProjectConfig["edges"];
  agenticEdges: ProjectConfig["agenticEdges"];
  edgeHandlePositions: Record<string, CanvasEngineEdgeHandlePosition>;
  sectionEdgePortsBySectionId: Record<string, CanvasEngineSectionEdgePorts>;
};

export type CanvasEngineScenePatchSummary = {
  hasChanges: boolean;
  sectionsAdded: number;
  sectionsUpdated: number;
  sectionsRemoved: number;
  dataEdgesAdded: number;
  dataEdgesUpdated: number;
  dataEdgesRemoved: number;
  agenticEdgesAdded: number;
  agenticEdgesUpdated: number;
  agenticEdgesRemoved: number;
};

type CanvasEngineApplySectionsSummary = Pick<
  CanvasEngineScenePatchSummary,
  "sectionsAdded" | "sectionsUpdated" | "sectionsRemoved"
>;

type CanvasEngineApplyDataEdgesSummary = Pick<
  CanvasEngineScenePatchSummary,
  "dataEdgesAdded" | "dataEdgesUpdated" | "dataEdgesRemoved"
>;

type CanvasEngineApplyAgenticEdgesSummary = Pick<
  CanvasEngineScenePatchSummary,
  "agenticEdgesAdded" | "agenticEdgesUpdated" | "agenticEdgesRemoved"
>;

export type CanvasEngineSceneSnapshotResult = {
  snapshot: CanvasEngineSceneSnapshot;
  visibleRectCount: number;
  totalRectCount: number;
  visibleDataEdgeCount: number;
  totalDataEdgeCount: number;
  visibleAgenticEdgeCount: number;
  totalAgenticEdgeCount: number;
};

export type CanvasEngineEdgeHitResult =
  | {
      kind: "data";
      id: string;
    }
  | {
      kind: "agentic";
      id: string;
    };

type QuerySectionIdsInWorldRectOptions = {
  includeNestedPreviewRects?: boolean;
};

export type CanvasEngineDataHandleHitResult = {
  sectionId: string;
  portId: string;
  handleType: "source" | "target";
  handleWorldX: number;
  handleWorldY: number;
};

export type CanvasEngineDataEdgeEndpointHitResult = {
  edgeId: string;
  endpointType: "source" | "target";
};

export type CanvasEngineAgenticHandleHitResult = {
  sectionId: string;
  handleType: "source" | "target";
  handleWorldX: number;
  handleWorldY: number;
};

type CanvasEngineResolvedSectionRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

const DEFAULT_CONFIG: CanvasEngineSceneAdapterConfig = {
  defaultSectionWidth: 320,
  defaultSectionHeight: 200,
  viewportPaddingPx: 320,
  spatialIndexCellSize: 512,
};

const AGENTIC_HANDLE_GAP_WORLD = 12;
const AGENTIC_HANDLE_HALF_SIZE_WORLD = 7;
const AGENTIC_HANDLE_EXTENT_WORLD =
  AGENTIC_HANDLE_GAP_WORLD + AGENTIC_HANDLE_HALF_SIZE_WORLD;
const DATA_HANDLE_EXTENT_WORLD = 16;

export class CanvasEngineSceneAdapter {
  private readonly config: CanvasEngineSceneAdapterConfig;

  private readonly spatialIndex: CanvasEngineSpatialIndex;

  private readonly nestedPreviewSpatialIndex: CanvasEngineSpatialIndex;

  private readonly rectById: Map<string, CanvasEngineRect>;

  private readonly nestedPreviewRectById: Map<
    string,
    CanvasEngineNestedPreviewRect
  >;

  private readonly dataEdgeById: Map<string, CanvasEngineDataEdge>;

  private readonly agenticEdgeById: Map<string, CanvasEngineAgenticEdge>;

  private readonly dataEdgeIdsBySectionId: Map<string, Set<string>>;

  private readonly agenticEdgeIdsBySectionId: Map<string, Set<string>>;

  private readonly dataEdgeSectionIdsByEdgeId: Map<
    string,
    {
      sourceSectionId: string;
      targetSectionId: string;
    }
  >;

  private readonly agenticEdgeSectionIdsByEdgeId: Map<
    string,
    {
      sourceSectionId: string;
      targetSectionId: string;
    }
  >;

  private dataEdgeEndpointByKey: Map<
    string,
    {
      edgeId: string;
      endpointType: "source" | "target";
      x: number;
      y: number;
      zIndex: number;
    }
  >;

  private edgeHandlePositionByKey: Map<string, CanvasEngineEdgeHandlePosition>;

  private dataHandlePositionsBySectionId: Map<
    string,
    {
      source: Map<string, CanvasEngineEdgeHandlePosition>;
      target: Map<string, CanvasEngineEdgeHandlePosition>;
    }
  >;

  private sectionEdgePortsBySectionId: Record<
    string,
    CanvasEngineSectionEdgePorts
  >;

  private activeSectionIdSet: Set<string>;

  public constructor(config?: Partial<CanvasEngineSceneAdapterConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.spatialIndex = new CanvasEngineSpatialIndex({
      cellSize: this.config.spatialIndexCellSize,
    });
    this.nestedPreviewSpatialIndex = new CanvasEngineSpatialIndex({
      cellSize: this.config.spatialIndexCellSize,
    });
    this.rectById = new Map();
    this.nestedPreviewRectById = new Map();
    this.dataEdgeById = new Map();
    this.agenticEdgeById = new Map();
    this.dataEdgeIdsBySectionId = new Map();
    this.agenticEdgeIdsBySectionId = new Map();
    this.dataEdgeSectionIdsByEdgeId = new Map();
    this.agenticEdgeSectionIdsByEdgeId = new Map();
    this.dataEdgeEndpointByKey = new Map();
    this.edgeHandlePositionByKey = new Map();
    this.dataHandlePositionsBySectionId = new Map();
    this.sectionEdgePortsBySectionId = {};
    this.activeSectionIdSet = new Set();
  }

  public applyProjectState(
    input: CanvasEngineProjectSceneInput,
  ): CanvasEngineScenePatchSummary {
    this.applyEdgeHandlePositions(input.edgeHandlePositions);
    this.sectionEdgePortsBySectionId = input.sectionEdgePortsBySectionId;
    const nextActiveSectionIdSet = new Set(input.activeSectionIds);
    const nestedPreviewRectsChanged = this.applyNestedPreviewRects(
      input.nestedPreviewRects,
    );
    const sectionSummary = this.applySections(
      input.topLevelSections,
      nextActiveSectionIdSet,
    );
    this.activeSectionIdSet = nextActiveSectionIdSet;

    const dataEdgeSummary = this.applyDataEdges(
      input.edges,
      input.sectionEdgePortsBySectionId,
    );
    const agenticEdgeSummary = this.applyAgenticEdges(input.agenticEdges);
    this.rebuildDataEdgeEndpoints();

    const hasChanges =
      nestedPreviewRectsChanged ||
      sectionSummary.sectionsAdded > 0 ||
      sectionSummary.sectionsUpdated > 0 ||
      sectionSummary.sectionsRemoved > 0 ||
      dataEdgeSummary.dataEdgesAdded > 0 ||
      dataEdgeSummary.dataEdgesUpdated > 0 ||
      dataEdgeSummary.dataEdgesRemoved > 0 ||
      agenticEdgeSummary.agenticEdgesAdded > 0 ||
      agenticEdgeSummary.agenticEdgesUpdated > 0 ||
      agenticEdgeSummary.agenticEdgesRemoved > 0;

    return {
      hasChanges,
      sectionsAdded: sectionSummary.sectionsAdded,
      sectionsUpdated: sectionSummary.sectionsUpdated,
      sectionsRemoved: sectionSummary.sectionsRemoved,
      dataEdgesAdded: dataEdgeSummary.dataEdgesAdded,
      dataEdgesUpdated: dataEdgeSummary.dataEdgesUpdated,
      dataEdgesRemoved: dataEdgeSummary.dataEdgesRemoved,
      agenticEdgesAdded: agenticEdgeSummary.agenticEdgesAdded,
      agenticEdgesUpdated: agenticEdgeSummary.agenticEdgesUpdated,
      agenticEdgesRemoved: agenticEdgeSummary.agenticEdgesRemoved,
    };
  }

  public createSnapshot(
    camera: CanvasEngineCamera,
    viewport: CanvasEngineViewport,
  ): CanvasEngineSceneSnapshotResult {
    const visibleSectionIds = this.queryVisibleSectionIds(camera, viewport);
    const visibleSectionSet = new Set(visibleSectionIds);
    const visibleNestedPreviewRects = this.queryVisibleNestedPreviewRects(
      camera,
      viewport,
    );
    const visibleNestedPreviewIdSet = new Set(
      visibleNestedPreviewRects.map((rect) => rect.id),
    );
    for (const activeSectionId of this.activeSectionIdSet) {
      visibleSectionSet.add(activeSectionId);
      visibleNestedPreviewIdSet.add(activeSectionId);
    }
    const visibleEdgeSectionIdSet = new Set([
      ...visibleSectionSet,
      ...visibleNestedPreviewIdSet,
    ]);

    const rects = sortRects(
      Array.from(visibleSectionSet)
        .map((sectionId) => this.rectById.get(sectionId) ?? null)
        .filter((rect): rect is CanvasEngineRect => rect !== null),
    );

    const dataEdges = sortDataEdges(
      Array.from(
        collectVisibleEdgeIdsForSections(
          visibleEdgeSectionIdSet,
          this.dataEdgeIdsBySectionId,
        ),
      )
        .map((edgeId) => this.dataEdgeById.get(edgeId) ?? null)
        .filter((edge): edge is CanvasEngineDataEdge => edge !== null),
    );

    const agenticEdges = sortAgenticEdges(
      Array.from(
        collectVisibleEdgeIdsForSections(
          visibleEdgeSectionIdSet,
          this.agenticEdgeIdsBySectionId,
        ),
      )
        .map((edgeId) => this.agenticEdgeById.get(edgeId) ?? null)
        .filter((edge): edge is CanvasEngineAgenticEdge => edge !== null),
    );

    return {
      snapshot: {
        camera,
        clearColor: [0.07, 0.08, 0.1],
        rects,
        nestedPreviewRects: visibleNestedPreviewRects,
        dataEdges,
        agenticEdges,
        connectionPreview: null,
        hoveredEdge: null,
      },
      visibleRectCount: rects.length,
      totalRectCount: this.rectById.size,
      visibleDataEdgeCount: dataEdges.length,
      totalDataEdgeCount: this.dataEdgeById.size,
      visibleAgenticEdgeCount: agenticEdges.length,
      totalAgenticEdgeCount: this.agenticEdgeById.size,
    };
  }

  public hitTestSectionAtWorldPoint(
    worldX: number,
    worldY: number,
    toleranceWorld = 0,
  ): string | null {
    const normalizedTolerance = Math.max(0, toleranceWorld);
    const candidateIds = this.querySectionIdsIntersectingWorldRect({
      x: worldX - normalizedTolerance,
      y: worldY - normalizedTolerance,
      width: normalizedTolerance * 2 + 1,
      height: normalizedTolerance * 2 + 1,
    });
    let topmostRect: CanvasEngineResolvedSectionRect | null = null;
    for (const sectionId of candidateIds) {
      const rect = this.resolveSectionRect(sectionId);
      if (!rect) {
        continue;
      }
      if (
        !isPointInsideExpandedRect(worldX, worldY, rect, normalizedTolerance)
      ) {
        continue;
      }
      if (!topmostRect || isRectAbove(rect, topmostRect)) {
        topmostRect = rect;
      }
    }
    return topmostRect?.id ?? null;
  }

  public getRectById(sectionId: string): CanvasEngineRect | null {
    const rect = this.rectById.get(sectionId);
    if (!rect) {
      return null;
    }
    return { ...rect };
  }

  public getResolvedSectionRectById(
    sectionId: string,
  ): CanvasEngineResolvedSectionRect | null {
    const rect = this.resolveSectionRect(sectionId);
    if (!rect) {
      return null;
    }
    return { ...rect };
  }

  public getDataEdgeById(edgeId: string): CanvasEngineDataEdge | null {
    return this.dataEdgeById.get(edgeId) ?? null;
  }

  public getDataEdgeAnchorsById(edgeId: string): {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null {
    const edge = this.dataEdgeById.get(edgeId);
    if (!edge) {
      return null;
    }
    const sourceRect = this.resolveSectionRect(edge.sourceSectionId);
    const targetRect = this.resolveSectionRect(edge.targetSectionId);
    if (!sourceRect || !targetRect) {
      return null;
    }
    return resolveDataEdgeAnchors(edge, sourceRect, targetRect);
  }

  public querySectionIdsInWorldRect(
    selectionRect: {
      x: number;
      y: number;
      width: number;
      height: number;
    },
    partially: boolean,
    options?: QuerySectionIdsInWorldRectOptions,
  ): string[] {
    if (selectionRect.width <= 0 || selectionRect.height <= 0) {
      return [];
    }

    const candidateIds = this.spatialIndex.queryRect(selectionRect);
    const selectedIds = new Set<string>();
    for (const sectionId of candidateIds) {
      const sectionRect = this.rectById.get(sectionId);
      if (!sectionRect) {
        continue;
      }
      if (
        !isRectSelectedBySelectionRect(sectionRect, selectionRect, partially)
      ) {
        continue;
      }
      selectedIds.add(sectionId);
    }
    if (options?.includeNestedPreviewRects) {
      const nestedPreviewIds =
        this.nestedPreviewSpatialIndex.queryRect(selectionRect);
      for (const nestedPreviewId of nestedPreviewIds) {
        const nestedPreviewRect =
          this.nestedPreviewRectById.get(nestedPreviewId);
        if (!nestedPreviewRect) {
          continue;
        }
        if (
          !isRectSelectedBySelectionRect(
            nestedPreviewRect,
            selectionRect,
            partially,
          )
        ) {
          continue;
        }
        selectedIds.add(nestedPreviewRect.id);
      }
    }
    return Array.from(selectedIds).sort((leftId, rightId) => {
      const leftRecord = resolveSectionSelectionSortRecord(
        leftId,
        this.rectById,
        this.nestedPreviewRectById,
      );
      const rightRecord = resolveSectionSelectionSortRecord(
        rightId,
        this.rectById,
        this.nestedPreviewRectById,
      );
      if (!leftRecord || !rightRecord) {
        return leftId.localeCompare(rightId);
      }
      if (leftRecord.zIndex !== rightRecord.zIndex) {
        return leftRecord.zIndex - rightRecord.zIndex;
      }
      if (leftRecord.kind !== rightRecord.kind) {
        return leftRecord.kind === "top-level" ? -1 : 1;
      }
      return leftId.localeCompare(rightId);
    });
  }

  public hitTestEdgeAtWorldPoint(
    worldX: number,
    worldY: number,
    toleranceWorld: number,
  ): CanvasEngineEdgeHitResult | null {
    let hitCandidate: {
      kind: CanvasEngineEdgeHitResult["kind"];
      id: string;
      zIndex: number;
      distance: number;
      drawOrder: number;
    } | null = null;

    for (const edge of this.dataEdgeById.values()) {
      if (edge.hidden) {
        continue;
      }
      const sourceRect = this.resolveSectionRect(edge.sourceSectionId);
      const targetRect = this.resolveSectionRect(edge.targetSectionId);
      if (!sourceRect || !targetRect) {
        continue;
      }
      const anchors = resolveDataEdgeAnchors(edge, sourceRect, targetRect);
      const distance = distancePointToSegment(
        worldX,
        worldY,
        anchors.startX,
        anchors.startY,
        anchors.endX,
        anchors.endY,
      );
      if (distance > toleranceWorld) {
        continue;
      }
      const candidate = {
        kind: "data" as const,
        id: edge.id,
        zIndex: edge.zIndex,
        distance,
        drawOrder: 0,
      };
      if (!hitCandidate || isEdgeHitCandidateAbove(candidate, hitCandidate)) {
        hitCandidate = candidate;
      }
    }

    for (const edge of this.agenticEdgeById.values()) {
      if (edge.hidden) {
        continue;
      }
      const sourceRect = this.resolveSectionRect(edge.sourceSectionId);
      const targetRect = this.resolveSectionRect(edge.targetSectionId);
      if (!sourceRect || !targetRect) {
        continue;
      }
      const anchors = resolveEdgeAnchors(sourceRect, targetRect);
      const distance = distancePointToSegment(
        worldX,
        worldY,
        anchors.startX,
        anchors.startY,
        anchors.endX,
        anchors.endY,
      );
      if (distance > toleranceWorld) {
        continue;
      }
      const candidate = {
        kind: "agentic" as const,
        id: edge.id,
        zIndex: edge.zIndex,
        distance,
        drawOrder: 1,
      };
      if (!hitCandidate || isEdgeHitCandidateAbove(candidate, hitCandidate)) {
        hitCandidate = candidate;
      }
    }

    if (!hitCandidate) {
      return null;
    }
    return {
      kind: hitCandidate.kind,
      id: hitCandidate.id,
    };
  }

  public hitTestAgenticHandleAtWorldPoint(
    worldX: number,
    worldY: number,
    toleranceWorld: number,
  ): CanvasEngineAgenticHandleHitResult | null {
    let hitCandidate: {
      sectionId: string;
      handleType: "source" | "target";
      handleWorldX: number;
      handleWorldY: number;
      zIndex: number;
      distance: number;
    } | null = null;
    const queryToleranceWorld = toleranceWorld + AGENTIC_HANDLE_EXTENT_WORLD;
    const candidateSectionIds = this.querySectionIdsIntersectingWorldRect({
      x: worldX - queryToleranceWorld,
      y: worldY - queryToleranceWorld,
      width: queryToleranceWorld * 2,
      height: queryToleranceWorld * 2,
    });

    for (const sectionId of candidateSectionIds) {
      const rect = this.resolveSectionRect(sectionId);
      if (!rect) {
        continue;
      }
      const candidateHandles: Array<{
        handleType: "source" | "target";
        handleWorldX: number;
        handleWorldY: number;
      }> = [
        {
          handleType: "target",
          handleWorldX:
            rect.x - AGENTIC_HANDLE_GAP_WORLD - AGENTIC_HANDLE_HALF_SIZE_WORLD,
          handleWorldY: rect.y + rect.height / 2,
        },
        {
          handleType: "source",
          handleWorldX:
            rect.x +
            rect.width +
            AGENTIC_HANDLE_GAP_WORLD +
            AGENTIC_HANDLE_HALF_SIZE_WORLD,
          handleWorldY: rect.y + rect.height / 2,
        },
      ];

      for (const handle of candidateHandles) {
        const distance = Math.hypot(
          worldX - handle.handleWorldX,
          worldY - handle.handleWorldY,
        );
        if (distance > toleranceWorld) {
          continue;
        }
        const candidate = {
          sectionId: rect.id,
          handleType: handle.handleType,
          handleWorldX: handle.handleWorldX,
          handleWorldY: handle.handleWorldY,
          zIndex: rect.zIndex,
          distance,
        };
        if (
          !hitCandidate ||
          isAgenticHandleHitCandidateAbove(candidate, hitCandidate)
        ) {
          hitCandidate = candidate;
        }
      }
    }

    if (!hitCandidate) {
      return null;
    }
    return {
      sectionId: hitCandidate.sectionId,
      handleType: hitCandidate.handleType,
      handleWorldX: hitCandidate.handleWorldX,
      handleWorldY: hitCandidate.handleWorldY,
    };
  }

  public hitTestDataHandleAtWorldPoint(
    worldX: number,
    worldY: number,
    toleranceWorld: number,
    options?: {
      handleType?: "source" | "target";
    },
  ): CanvasEngineDataHandleHitResult | null {
    let hitCandidate: {
      sectionId: string;
      portId: string;
      handleType: "source" | "target";
      handleWorldX: number;
      handleWorldY: number;
      zIndex: number;
      distance: number;
    } | null = null;
    const queryToleranceWorld = toleranceWorld + DATA_HANDLE_EXTENT_WORLD;
    const candidateSectionIds = this.querySectionIdsIntersectingWorldRect({
      x: worldX - queryToleranceWorld,
      y: worldY - queryToleranceWorld,
      width: queryToleranceWorld * 2,
      height: queryToleranceWorld * 2,
    });

    for (const sectionId of candidateSectionIds) {
      const rect = this.resolveSectionRect(sectionId);
      if (!rect) {
        continue;
      }
      const measuredSectionHandles =
        this.dataHandlePositionsBySectionId.get(sectionId) ?? null;
      const sectionPorts = this.sectionEdgePortsBySectionId[sectionId];
      if (!sectionPorts && !measuredSectionHandles) {
        continue;
      }
      if (!options?.handleType || options.handleType === "source") {
        const sourcePortIds = resolvePortIdsForHandleType(
          sectionPorts?.outputPortIds ?? [],
          measuredSectionHandles?.source ?? null,
        );
        hitCandidate = selectDataHandleHitCandidateForPortIds({
          currentHit: hitCandidate,
          sectionId,
          portIds: sourcePortIds,
          handleType: "source",
          rect,
          measuredPositionsByPortId: measuredSectionHandles?.source ?? null,
          worldX,
          worldY,
          toleranceWorld,
        });
      }
      if (!options?.handleType || options.handleType === "target") {
        const targetPortIds = resolvePortIdsForHandleType(
          sectionPorts?.inputPortIds ?? [],
          measuredSectionHandles?.target ?? null,
        );
        hitCandidate = selectDataHandleHitCandidateForPortIds({
          currentHit: hitCandidate,
          sectionId,
          portIds: targetPortIds,
          handleType: "target",
          rect,
          measuredPositionsByPortId: measuredSectionHandles?.target ?? null,
          worldX,
          worldY,
          toleranceWorld,
        });
      }
    }

    if (!hitCandidate) {
      return null;
    }
    return {
      sectionId: hitCandidate.sectionId,
      portId: hitCandidate.portId,
      handleType: hitCandidate.handleType,
      handleWorldX: hitCandidate.handleWorldX,
      handleWorldY: hitCandidate.handleWorldY,
    };
  }

  public hitTestDataEdgeEndpointAtWorldPoint(
    worldX: number,
    worldY: number,
    toleranceWorld: number,
  ): CanvasEngineDataEdgeEndpointHitResult | null {
    let hitCandidate: {
      edgeId: string;
      endpointType: "source" | "target";
      zIndex: number;
      distance: number;
    } | null = null;

    for (const endpoint of this.dataEdgeEndpointByKey.values()) {
      const edge = this.dataEdgeById.get(endpoint.edgeId);
      if (!edge || edge.hidden) {
        continue;
      }
      const distance = Math.hypot(worldX - endpoint.x, worldY - endpoint.y);
      if (distance > toleranceWorld) {
        continue;
      }
      const candidate = {
        edgeId: endpoint.edgeId,
        endpointType: endpoint.endpointType,
        zIndex: endpoint.zIndex,
        distance,
      };
      if (
        !hitCandidate ||
        isDataEdgeEndpointHitCandidateAbove(candidate, hitCandidate)
      ) {
        hitCandidate = candidate;
      }
    }

    if (!hitCandidate) {
      return null;
    }
    return {
      edgeId: hitCandidate.edgeId,
      endpointType: hitCandidate.endpointType,
    };
  }

  private applyEdgeHandlePositions(
    edgeHandlePositions: Record<string, CanvasEngineEdgeHandlePosition>,
  ): void {
    const nextByKey = new Map<string, CanvasEngineEdgeHandlePosition>();
    const nextDataBySectionId = new Map<
      string,
      {
        source: Map<string, CanvasEngineEdgeHandlePosition>;
        target: Map<string, CanvasEngineEdgeHandlePosition>;
      }
    >();

    for (const [key, handle] of Object.entries(edgeHandlePositions)) {
      nextByKey.set(key, handle);
      if (isAgenticHandlePortId(handle.portId)) {
        continue;
      }
      let byType = nextDataBySectionId.get(handle.sectionId);
      if (!byType) {
        byType = {
          source: new Map(),
          target: new Map(),
        };
        nextDataBySectionId.set(handle.sectionId, byType);
      }
      byType[handle.type].set(handle.portId, handle);
    }

    this.edgeHandlePositionByKey = nextByKey;
    this.dataHandlePositionsBySectionId = nextDataBySectionId;
  }

  private applySections(
    topLevelSections: Record<string, TopLevelSectionLayout>,
    activeSectionIdSet: Set<string>,
  ): CanvasEngineApplySectionsSummary {
    const nextSectionIds = new Set<string>();
    let sectionsAdded = 0;
    let sectionsUpdated = 0;
    let sectionsRemoved = 0;

    for (const [sectionId, layout] of Object.entries(topLevelSections)) {
      nextSectionIds.add(sectionId);
      const nextRectRecord = createRectRecord(
        sectionId,
        layout,
        activeSectionIdSet.has(sectionId),
        this.config.defaultSectionWidth,
        this.config.defaultSectionHeight,
      );
      const previousRectRecord = this.rectById.get(sectionId);
      if (!previousRectRecord) {
        this.rectById.set(sectionId, nextRectRecord);
        this.spatialIndex.upsert(sectionId, nextRectRecord);
        sectionsAdded += 1;
        continue;
      }
      if (areRectRecordsEqual(previousRectRecord, nextRectRecord)) {
        continue;
      }
      this.rectById.set(sectionId, nextRectRecord);
      this.spatialIndex.upsert(sectionId, nextRectRecord);
      sectionsUpdated += 1;
    }

    for (const sectionId of Array.from(this.rectById.keys())) {
      if (nextSectionIds.has(sectionId)) {
        continue;
      }
      this.rectById.delete(sectionId);
      this.spatialIndex.remove(sectionId);
      sectionsRemoved += 1;
    }

    return {
      sectionsAdded,
      sectionsUpdated,
      sectionsRemoved,
    };
  }

  private queryVisibleSectionIds(
    camera: CanvasEngineCamera,
    viewport: CanvasEngineViewport,
  ): string[] {
    const worldPadding = getViewportPaddingWorld(
      this.config.viewportPaddingPx,
      camera.zoom,
    );
    return this.spatialIndex.queryRect({
      x: camera.x - worldPadding,
      y: camera.y - worldPadding,
      width: viewport.width / camera.zoom + worldPadding * 2,
      height: viewport.height / camera.zoom + worldPadding * 2,
    });
  }

  private queryVisibleNestedPreviewRects(
    camera: CanvasEngineCamera,
    viewport: CanvasEngineViewport,
  ): CanvasEngineNestedPreviewRect[] {
    const worldPadding = getViewportPaddingWorld(
      this.config.viewportPaddingPx,
      camera.zoom,
    );
    const viewportRect = {
      x: camera.x - worldPadding,
      y: camera.y - worldPadding,
      width: viewport.width / camera.zoom + worldPadding * 2,
      height: viewport.height / camera.zoom + worldPadding * 2,
    };
    const visibleNestedPreviewIds =
      this.nestedPreviewSpatialIndex.queryRect(viewportRect);
    return sortNestedPreviewRects(
      visibleNestedPreviewIds
        .map((sectionId) => this.nestedPreviewRectById.get(sectionId) ?? null)
        .filter((rect): rect is CanvasEngineNestedPreviewRect => rect !== null),
    );
  }

  private applyNestedPreviewRects(
    nestedPreviewRects: CanvasEngineNestedPreviewRect[],
  ): boolean {
    const nextById = new Map<string, CanvasEngineNestedPreviewRect>();
    let hasChanges =
      nestedPreviewRects.length !== this.nestedPreviewRectById.size;

    for (const rect of nestedPreviewRects) {
      nextById.set(rect.id, rect);
      const previousRect = this.nestedPreviewRectById.get(rect.id);
      if (!previousRect || !areNestedPreviewRectsEqual(previousRect, rect)) {
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      return false;
    }

    const previousIds = new Set(this.nestedPreviewRectById.keys());
    this.nestedPreviewRectById.clear();
    for (const [sectionId, rect] of nextById) {
      this.nestedPreviewRectById.set(sectionId, rect);
      this.nestedPreviewSpatialIndex.upsert(sectionId, rect);
      previousIds.delete(sectionId);
    }
    for (const sectionId of previousIds) {
      this.nestedPreviewSpatialIndex.remove(sectionId);
    }
    return true;
  }

  private applyDataEdges(
    edges: ProjectConfig["edges"],
    sectionEdgePortsBySectionId: Record<string, CanvasEngineSectionEdgePorts>,
  ): CanvasEngineApplyDataEdgesSummary {
    const nextEdgeIds = new Set<string>();
    let dataEdgesAdded = 0;
    let dataEdgesUpdated = 0;
    let dataEdgesRemoved = 0;

    for (const edge of edges) {
      nextEdgeIds.add(edge.id);
      const previousSectionIds =
        this.dataEdgeSectionIdsByEdgeId.get(edge.id) ?? null;
      if (
        !previousSectionIds ||
        previousSectionIds.sourceSectionId !== edge.sourceSectionId ||
        previousSectionIds.targetSectionId !== edge.targetSectionId
      ) {
        if (previousSectionIds) {
          removeEdgeFromSectionAdjacency(
            this.dataEdgeIdsBySectionId,
            edge.id,
            previousSectionIds.sourceSectionId,
            previousSectionIds.targetSectionId,
          );
        }
        addEdgeToSectionAdjacency(
          this.dataEdgeIdsBySectionId,
          edge.id,
          edge.sourceSectionId,
          edge.targetSectionId,
        );
        this.dataEdgeSectionIdsByEdgeId.set(edge.id, {
          sourceSectionId: edge.sourceSectionId,
          targetSectionId: edge.targetSectionId,
        });
      }
      const nextEdgeRecord = createDataEdgeRecord(
        edge,
        this.edgeHandlePositionByKey,
        this.rectById,
        this.nestedPreviewRectById,
        sectionEdgePortsBySectionId,
      );
      const previousEdgeRecord = this.dataEdgeById.get(edge.id);
      if (!previousEdgeRecord) {
        this.dataEdgeById.set(edge.id, nextEdgeRecord);
        dataEdgesAdded += 1;
        continue;
      }
      if (areDataEdgeRecordsEqual(previousEdgeRecord, nextEdgeRecord)) {
        continue;
      }
      this.dataEdgeById.set(edge.id, nextEdgeRecord);
      dataEdgesUpdated += 1;
    }

    for (const edgeId of Array.from(this.dataEdgeById.keys())) {
      if (nextEdgeIds.has(edgeId)) {
        continue;
      }
      this.dataEdgeById.delete(edgeId);
      const previousSectionIds =
        this.dataEdgeSectionIdsByEdgeId.get(edgeId) ?? null;
      if (previousSectionIds) {
        removeEdgeFromSectionAdjacency(
          this.dataEdgeIdsBySectionId,
          edgeId,
          previousSectionIds.sourceSectionId,
          previousSectionIds.targetSectionId,
        );
        this.dataEdgeSectionIdsByEdgeId.delete(edgeId);
      }
      dataEdgesRemoved += 1;
    }

    return {
      dataEdgesAdded,
      dataEdgesUpdated,
      dataEdgesRemoved,
    };
  }

  private applyAgenticEdges(
    edges: ProjectConfig["agenticEdges"],
  ): CanvasEngineApplyAgenticEdgesSummary {
    const nextEdgeIds = new Set<string>();
    let agenticEdgesAdded = 0;
    let agenticEdgesUpdated = 0;
    let agenticEdgesRemoved = 0;

    for (const edge of edges) {
      nextEdgeIds.add(edge.id);
      const previousSectionIds =
        this.agenticEdgeSectionIdsByEdgeId.get(edge.id) ?? null;
      if (
        !previousSectionIds ||
        previousSectionIds.sourceSectionId !== edge.sourceSectionId ||
        previousSectionIds.targetSectionId !== edge.targetSectionId
      ) {
        if (previousSectionIds) {
          removeEdgeFromSectionAdjacency(
            this.agenticEdgeIdsBySectionId,
            edge.id,
            previousSectionIds.sourceSectionId,
            previousSectionIds.targetSectionId,
          );
        }
        addEdgeToSectionAdjacency(
          this.agenticEdgeIdsBySectionId,
          edge.id,
          edge.sourceSectionId,
          edge.targetSectionId,
        );
        this.agenticEdgeSectionIdsByEdgeId.set(edge.id, {
          sourceSectionId: edge.sourceSectionId,
          targetSectionId: edge.targetSectionId,
        });
      }
      const nextEdgeRecord = createAgenticEdgeRecord(edge);
      const previousEdgeRecord = this.agenticEdgeById.get(edge.id);
      if (!previousEdgeRecord) {
        this.agenticEdgeById.set(edge.id, nextEdgeRecord);
        agenticEdgesAdded += 1;
        continue;
      }
      if (areAgenticEdgeRecordsEqual(previousEdgeRecord, nextEdgeRecord)) {
        continue;
      }
      this.agenticEdgeById.set(edge.id, nextEdgeRecord);
      agenticEdgesUpdated += 1;
    }

    for (const edgeId of Array.from(this.agenticEdgeById.keys())) {
      if (nextEdgeIds.has(edgeId)) {
        continue;
      }
      this.agenticEdgeById.delete(edgeId);
      const previousSectionIds =
        this.agenticEdgeSectionIdsByEdgeId.get(edgeId) ?? null;
      if (previousSectionIds) {
        removeEdgeFromSectionAdjacency(
          this.agenticEdgeIdsBySectionId,
          edgeId,
          previousSectionIds.sourceSectionId,
          previousSectionIds.targetSectionId,
        );
        this.agenticEdgeSectionIdsByEdgeId.delete(edgeId);
      }
      agenticEdgesRemoved += 1;
    }

    return {
      agenticEdgesAdded,
      agenticEdgesUpdated,
      agenticEdgesRemoved,
    };
  }

  private rebuildDataEdgeEndpoints(): void {
    const nextEndpointByKey = new Map<
      string,
      {
        edgeId: string;
        endpointType: "source" | "target";
        x: number;
        y: number;
        zIndex: number;
      }
    >();

    for (const edge of this.dataEdgeById.values()) {
      const sourceRect = this.resolveSectionRect(edge.sourceSectionId);
      const targetRect = this.resolveSectionRect(edge.targetSectionId);
      if (!sourceRect || !targetRect) {
        continue;
      }
      const anchors = resolveDataEdgeAnchors(edge, sourceRect, targetRect);
      nextEndpointByKey.set(buildDataEdgeEndpointKey(edge.id, "source"), {
        edgeId: edge.id,
        endpointType: "source",
        x: anchors.startX,
        y: anchors.startY,
        zIndex: edge.zIndex,
      });
      nextEndpointByKey.set(buildDataEdgeEndpointKey(edge.id, "target"), {
        edgeId: edge.id,
        endpointType: "target",
        x: anchors.endX,
        y: anchors.endY,
        zIndex: edge.zIndex,
      });
    }

    this.dataEdgeEndpointByKey = nextEndpointByKey;
  }

  private resolveSectionRect(
    sectionId: string,
  ): CanvasEngineResolvedSectionRect | null {
    const rect = this.rectById.get(sectionId);
    if (rect) {
      return rect;
    }
    const nestedPreviewRect = this.nestedPreviewRectById.get(sectionId);
    if (!nestedPreviewRect) {
      return null;
    }
    return {
      id: nestedPreviewRect.id,
      x: nestedPreviewRect.x,
      y: nestedPreviewRect.y,
      width: nestedPreviewRect.width,
      height: nestedPreviewRect.height,
      zIndex:
        (this.rectById.get(nestedPreviewRect.parentSectionId)?.zIndex ?? 0) +
        0.5,
    };
  }

  private querySectionIdsIntersectingWorldRect(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): string[] {
    const sectionIds = new Set(this.spatialIndex.queryRect(bounds));
    for (const sectionId of this.nestedPreviewSpatialIndex.queryRect(bounds)) {
      sectionIds.add(sectionId);
    }
    return Array.from(sectionIds);
  }
}

function resolveSectionWidth(
  layout: TopLevelSectionLayout,
  fallbackWidth: number,
): number {
  if (typeof layout.w === "number" && layout.w > 0) {
    return layout.w;
  }
  return fallbackWidth;
}

function resolveSectionHeight(
  layout: TopLevelSectionLayout,
  fallbackHeight: number,
): number {
  if (typeof layout.h === "number" && layout.h > 0) {
    return layout.h;
  }
  return fallbackHeight;
}

function resolveSectionColor(
  sectionId: string,
  isActive: boolean,
): [number, number, number] {
  const hash = hashString(sectionId);
  const red = 0.3 + ((hash & 0xff) / 255) * 0.4;
  const green = 0.25 + (((hash >> 8) & 0xff) / 255) * 0.45;
  const blue = 0.2 + (((hash >> 16) & 0xff) / 255) * 0.5;

  if (!isActive) {
    return [red * 0.7, green * 0.7, blue * 0.7];
  }
  return [
    Math.min(1, red + 0.2),
    Math.min(1, green + 0.2),
    Math.min(1, blue + 0.2),
  ];
}

function createRectRecord(
  sectionId: string,
  layout: TopLevelSectionLayout,
  isActive: boolean,
  fallbackWidth: number,
  fallbackHeight: number,
): CanvasEngineRect {
  return {
    id: sectionId,
    x: layout.x,
    y: layout.y,
    width: resolveSectionWidth(layout, fallbackWidth),
    height: resolveSectionHeight(layout, fallbackHeight),
    zIndex: layout.zIndex ?? 0,
    isActive,
    color: resolveSectionColor(sectionId, isActive),
  };
}

function createDataEdgeRecord(
  edge: DataEdgeInput,
  edgeHandlePositionByKey: Map<string, CanvasEngineEdgeHandlePosition>,
  rectById: Map<string, CanvasEngineRect>,
  nestedPreviewRectById: Map<string, CanvasEngineNestedPreviewRect>,
  sectionEdgePortsBySectionId: Record<string, CanvasEngineSectionEdgePorts>,
): CanvasEngineDataEdge {
  const sourceHandle = edgeHandlePositionByKey.get(
    buildDataHandleKey(edge.sourceSectionId, edge.sourcePortId, "source"),
  );
  const targetHandle = edgeHandlePositionByKey.get(
    buildDataHandleKey(edge.targetSectionId, edge.targetPortId, "target"),
  );
  const sourceRect =
    rectById.get(edge.sourceSectionId) ??
    nestedPreviewRectById.get(edge.sourceSectionId) ??
    null;
  const targetRect =
    rectById.get(edge.targetSectionId) ??
    nestedPreviewRectById.get(edge.targetSectionId) ??
    null;
  const estimatedSourceAnchor = sourceRect
    ? resolveEstimatedDataPortAnchor({
        rect: sourceRect,
        portId: edge.sourcePortId,
        portIds:
          sectionEdgePortsBySectionId[edge.sourceSectionId]?.outputPortIds ??
          [],
        handleType: "source",
      })
    : null;
  const estimatedTargetAnchor = targetRect
    ? resolveEstimatedDataPortAnchor({
        rect: targetRect,
        portId: edge.targetPortId,
        portIds:
          sectionEdgePortsBySectionId[edge.targetSectionId]?.inputPortIds ?? [],
        handleType: "target",
      })
    : null;
  return {
    id: edge.id,
    sourceSectionId: edge.sourceSectionId,
    sourceVariantId: edge.sourceVariantId,
    sourcePortId: edge.sourcePortId,
    targetSectionId: edge.targetSectionId,
    targetVariantId: edge.targetVariantId,
    targetPortId: edge.targetPortId,
    sourceX: sourceHandle?.x ?? estimatedSourceAnchor?.x ?? null,
    sourceY: sourceHandle?.y ?? estimatedSourceAnchor?.y ?? null,
    targetX: targetHandle?.x ?? estimatedTargetAnchor?.x ?? null,
    targetY: targetHandle?.y ?? estimatedTargetAnchor?.y ?? null,
    hidden: edge.hidden,
    selected: edge.selected,
    zIndex: edge.zIndex,
  };
}

function createAgenticEdgeRecord(
  edge: AgenticEdgeInput,
): CanvasEngineAgenticEdge {
  return {
    id: edge.id,
    sourceSectionId: edge.sourceSectionId,
    targetSectionId: edge.targetSectionId,
    kind: edge.kind,
    hidden: edge.hidden,
    selected: edge.selected,
    zIndex: edge.zIndex,
  };
}

function collectVisibleEdgeIdsForSections(
  visibleSectionIds: Set<string>,
  edgeIdsBySectionId: Map<string, Set<string>>,
): Set<string> {
  const visibleEdgeIds = new Set<string>();
  for (const sectionId of visibleSectionIds) {
    const edgeIds = edgeIdsBySectionId.get(sectionId);
    if (!edgeIds) {
      continue;
    }
    for (const edgeId of edgeIds) {
      visibleEdgeIds.add(edgeId);
    }
  }
  return visibleEdgeIds;
}

function addEdgeToSectionAdjacency(
  edgeIdsBySectionId: Map<string, Set<string>>,
  edgeId: string,
  sourceSectionId: string,
  targetSectionId: string,
): void {
  addEdgeToSection(edgeIdsBySectionId, sourceSectionId, edgeId);
  addEdgeToSection(edgeIdsBySectionId, targetSectionId, edgeId);
}

function removeEdgeFromSectionAdjacency(
  edgeIdsBySectionId: Map<string, Set<string>>,
  edgeId: string,
  sourceSectionId: string,
  targetSectionId: string,
): void {
  removeEdgeFromSection(edgeIdsBySectionId, sourceSectionId, edgeId);
  removeEdgeFromSection(edgeIdsBySectionId, targetSectionId, edgeId);
}

function addEdgeToSection(
  edgeIdsBySectionId: Map<string, Set<string>>,
  sectionId: string,
  edgeId: string,
): void {
  let edgeIds = edgeIdsBySectionId.get(sectionId);
  if (!edgeIds) {
    edgeIds = new Set();
    edgeIdsBySectionId.set(sectionId, edgeIds);
  }
  edgeIds.add(edgeId);
}

function removeEdgeFromSection(
  edgeIdsBySectionId: Map<string, Set<string>>,
  sectionId: string,
  edgeId: string,
): void {
  const edgeIds = edgeIdsBySectionId.get(sectionId);
  if (!edgeIds) {
    return;
  }
  edgeIds.delete(edgeId);
  if (edgeIds.size === 0) {
    edgeIdsBySectionId.delete(sectionId);
  }
}

function buildDataEdgeEndpointKey(
  edgeId: string,
  endpointType: "source" | "target",
): string {
  return `${edgeId}:${endpointType}`;
}

function buildDataHandleKey(
  sectionId: string,
  portId: string,
  type: "source" | "target",
): string {
  return `${sectionId}:${portId}:${type}`;
}

function resolveEstimatedDataPortAnchor({
  rect,
  portId,
  portIds,
  handleType,
}: {
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  portId: string;
  portIds: string[];
  handleType: "source" | "target";
}): { x: number; y: number } {
  const x = handleType === "source" ? rect.x + rect.width : rect.x;
  if (portIds.length === 0) {
    return {
      x,
      y: rect.y + rect.height / 2,
    };
  }
  const portIndex = portIds.indexOf(portId);
  if (portIndex < 0) {
    return {
      x,
      y: rect.y + rect.height / 2,
    };
  }
  const y = rect.y + ((portIndex + 1) / (portIds.length + 1)) * rect.height;
  return { x, y };
}

function isAgenticHandlePortId(portId: string): boolean {
  return portId.startsWith("agentic-edge-");
}

function isPointInsideRect(
  worldX: number,
  worldY: number,
  rect: CanvasEngineRect,
): boolean {
  return (
    worldX >= rect.x &&
    worldX <= rect.x + rect.width &&
    worldY >= rect.y &&
    worldY <= rect.y + rect.height
  );
}

function isPointInsideExpandedRect(
  worldX: number,
  worldY: number,
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  tolerance: number,
): boolean {
  return (
    worldX >= rect.x - tolerance &&
    worldX <= rect.x + rect.width + tolerance &&
    worldY >= rect.y - tolerance &&
    worldY <= rect.y + rect.height + tolerance
  );
}

function isRectAbove(
  candidate: {
    id: string;
    zIndex: number;
  },
  current: {
    id: string;
    zIndex: number;
  },
): boolean {
  if (candidate.zIndex !== current.zIndex) {
    return candidate.zIndex > current.zIndex;
  }
  return candidate.id.localeCompare(current.id) > 0;
}

function isEdgeHitCandidateAbove(
  candidate: {
    id: string;
    zIndex: number;
    distance: number;
    drawOrder: number;
  },
  current: {
    id: string;
    zIndex: number;
    distance: number;
    drawOrder: number;
  },
): boolean {
  if (candidate.zIndex !== current.zIndex) {
    return candidate.zIndex > current.zIndex;
  }
  if (candidate.distance !== current.distance) {
    return candidate.distance < current.distance;
  }
  if (candidate.drawOrder !== current.drawOrder) {
    return candidate.drawOrder > current.drawOrder;
  }
  return candidate.id.localeCompare(current.id) > 0;
}

function isDataHandleHitCandidateAbove(
  candidate: {
    sectionId: string;
    portId: string;
    handleType: "source" | "target";
    zIndex: number;
    distance: number;
  },
  current: {
    sectionId: string;
    portId: string;
    handleType: "source" | "target";
    zIndex: number;
    distance: number;
  },
): boolean {
  if (candidate.zIndex !== current.zIndex) {
    return candidate.zIndex > current.zIndex;
  }
  if (candidate.distance !== current.distance) {
    return candidate.distance < current.distance;
  }
  if (candidate.handleType !== current.handleType) {
    return candidate.handleType === "source";
  }
  if (candidate.sectionId !== current.sectionId) {
    return candidate.sectionId.localeCompare(current.sectionId) > 0;
  }
  return candidate.portId.localeCompare(current.portId) > 0;
}

function selectDataHandleHitCandidateForPortIds({
  currentHit,
  sectionId,
  portIds,
  handleType,
  rect,
  measuredPositionsByPortId,
  worldX,
  worldY,
  toleranceWorld,
}: {
  currentHit: {
    sectionId: string;
    portId: string;
    handleType: "source" | "target";
    handleWorldX: number;
    handleWorldY: number;
    zIndex: number;
    distance: number;
  } | null;
  sectionId: string;
  portIds: string[];
  handleType: "source" | "target";
  rect: CanvasEngineResolvedSectionRect;
  measuredPositionsByPortId: Map<string, CanvasEngineEdgeHandlePosition> | null;
  worldX: number;
  worldY: number;
  toleranceWorld: number;
}): {
  sectionId: string;
  portId: string;
  handleType: "source" | "target";
  handleWorldX: number;
  handleWorldY: number;
  zIndex: number;
  distance: number;
} | null {
  let nextHit = currentHit;
  for (const portId of portIds) {
    if (isAgenticHandlePortId(portId)) {
      continue;
    }
    const measuredHandle = measuredPositionsByPortId?.get(portId);
    const anchor = measuredHandle
      ? {
          x: measuredHandle.x,
          y: measuredHandle.y,
        }
      : resolveEstimatedDataPortAnchor({
          rect,
          portId,
          portIds,
          handleType,
        });
    const candidate = createDataHandleHitCandidate({
      sectionId,
      portId,
      handleType,
      handleWorldX: anchor.x,
      handleWorldY: anchor.y,
      zIndex: rect.zIndex,
      worldX,
      worldY,
      toleranceWorld,
    });
    if (!candidate) {
      continue;
    }
    if (!nextHit || isDataHandleHitCandidateAbove(candidate, nextHit)) {
      nextHit = candidate;
    }
  }
  return nextHit;
}

function resolvePortIdsForHandleType(
  declaredPortIds: string[],
  measuredPositionsByPortId: Map<string, CanvasEngineEdgeHandlePosition> | null,
): string[] {
  if (!measuredPositionsByPortId || measuredPositionsByPortId.size === 0) {
    return declaredPortIds;
  }
  if (declaredPortIds.length === 0) {
    return Array.from(measuredPositionsByPortId.keys());
  }
  const merged = [...declaredPortIds];
  const seen = new Set(declaredPortIds);
  for (const portId of measuredPositionsByPortId.keys()) {
    if (seen.has(portId)) {
      continue;
    }
    merged.push(portId);
  }
  return merged;
}

function createDataHandleHitCandidate({
  sectionId,
  portId,
  handleType,
  handleWorldX,
  handleWorldY,
  zIndex,
  worldX,
  worldY,
  toleranceWorld,
}: {
  sectionId: string;
  portId: string;
  handleType: "source" | "target";
  handleWorldX: number;
  handleWorldY: number;
  zIndex: number;
  worldX: number;
  worldY: number;
  toleranceWorld: number;
}): {
  sectionId: string;
  portId: string;
  handleType: "source" | "target";
  handleWorldX: number;
  handleWorldY: number;
  zIndex: number;
  distance: number;
} | null {
  const distance = Math.hypot(worldX - handleWorldX, worldY - handleWorldY);
  if (distance > toleranceWorld) {
    return null;
  }
  return {
    sectionId,
    portId,
    handleType,
    handleWorldX,
    handleWorldY,
    zIndex,
    distance,
  };
}

function isDataEdgeEndpointHitCandidateAbove(
  candidate: {
    edgeId: string;
    endpointType: "source" | "target";
    zIndex: number;
    distance: number;
  },
  current: {
    edgeId: string;
    endpointType: "source" | "target";
    zIndex: number;
    distance: number;
  },
): boolean {
  if (candidate.zIndex !== current.zIndex) {
    return candidate.zIndex > current.zIndex;
  }
  if (candidate.distance !== current.distance) {
    return candidate.distance < current.distance;
  }
  if (candidate.endpointType !== current.endpointType) {
    return candidate.endpointType === "source";
  }
  return candidate.edgeId.localeCompare(current.edgeId) > 0;
}

function isAgenticHandleHitCandidateAbove(
  candidate: {
    sectionId: string;
    handleType: "source" | "target";
    zIndex: number;
    distance: number;
  },
  current: {
    sectionId: string;
    handleType: "source" | "target";
    zIndex: number;
    distance: number;
  },
): boolean {
  if (candidate.zIndex !== current.zIndex) {
    return candidate.zIndex > current.zIndex;
  }
  if (candidate.distance !== current.distance) {
    return candidate.distance < current.distance;
  }
  if (candidate.handleType !== current.handleType) {
    return candidate.handleType === "source";
  }
  return candidate.sectionId.localeCompare(current.sectionId) > 0;
}

function resolveEdgeAnchors(
  sourceRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  targetRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
): {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
} {
  const sourceCenterX = sourceRect.x + sourceRect.width / 2;
  const sourceCenterY = sourceRect.y + sourceRect.height / 2;
  const targetCenterX = targetRect.x + targetRect.width / 2;
  const targetCenterY = targetRect.y + targetRect.height / 2;
  const targetOnRight = targetCenterX >= sourceCenterX;

  return {
    startX: targetOnRight ? sourceRect.x + sourceRect.width : sourceRect.x,
    startY: sourceCenterY,
    endX: targetOnRight ? targetRect.x : targetRect.x + targetRect.width,
    endY: targetCenterY,
  };
}

function resolveDataEdgeAnchors(
  edge: CanvasEngineDataEdge,
  sourceRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  targetRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
): {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
} {
  if (
    typeof edge.sourceX === "number" &&
    typeof edge.sourceY === "number" &&
    typeof edge.targetX === "number" &&
    typeof edge.targetY === "number"
  ) {
    return {
      startX: edge.sourceX,
      startY: edge.sourceY,
      endX: edge.targetX,
      endY: edge.targetY,
    };
  }
  return resolveEdgeAnchors(sourceRect, targetRect);
}

function distancePointToSegment(
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number {
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (segmentLengthSquared <= 0.000001) {
    const deltaX = pointX - startX;
    const deltaY = pointY - startY;
    return Math.hypot(deltaX, deltaY);
  }
  const projection =
    ((pointX - startX) * segmentX + (pointY - startY) * segmentY) /
    segmentLengthSquared;
  const t = clamp(projection, 0, 1);
  const projectedX = startX + segmentX * t;
  const projectedY = startY + segmentY * t;
  return Math.hypot(pointX - projectedX, pointY - projectedY);
}

function isRectSelectedBySelectionRect(
  sectionRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  selectionRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  partially: boolean,
): boolean {
  const overlapArea = getOverlappingArea(selectionRect, sectionRect);
  if (overlapArea <= 0) {
    return false;
  }
  if (partially) {
    return true;
  }
  const sectionArea = sectionRect.width * sectionRect.height;
  return overlapArea >= sectionArea;
}

function getOverlappingArea(
  leftRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  rightRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
): number {
  const leftX = leftRect.x;
  const leftY = leftRect.y;
  const leftRight = leftRect.x + leftRect.width;
  const leftBottom = leftRect.y + leftRect.height;

  const rightX = rightRect.x;
  const rightY = rightRect.y;
  const rightRight = rightRect.x + rightRect.width;
  const rightBottom = rightRect.y + rightRect.height;

  const overlapWidth =
    Math.min(leftRight, rightRight) - Math.max(leftX, rightX);
  const overlapHeight =
    Math.min(leftBottom, rightBottom) - Math.max(leftY, rightY);
  if (overlapWidth <= 0 || overlapHeight <= 0) {
    return 0;
  }
  return overlapWidth * overlapHeight;
}

function areRectRecordsEqual(
  left: CanvasEngineRect,
  right: CanvasEngineRect,
): boolean {
  if (left.id !== right.id) {
    return false;
  }
  if (left.x !== right.x || left.y !== right.y) {
    return false;
  }
  if (left.width !== right.width || left.height !== right.height) {
    return false;
  }
  if (left.zIndex !== right.zIndex || left.isActive !== right.isActive) {
    return false;
  }
  return (
    left.color[0] === right.color[0] &&
    left.color[1] === right.color[1] &&
    left.color[2] === right.color[2]
  );
}

function areDataEdgeRecordsEqual(
  left: CanvasEngineDataEdge,
  right: CanvasEngineDataEdge,
): boolean {
  return (
    left.id === right.id &&
    left.sourceSectionId === right.sourceSectionId &&
    left.sourceVariantId === right.sourceVariantId &&
    left.sourcePortId === right.sourcePortId &&
    left.targetSectionId === right.targetSectionId &&
    left.targetVariantId === right.targetVariantId &&
    left.targetPortId === right.targetPortId &&
    left.sourceX === right.sourceX &&
    left.sourceY === right.sourceY &&
    left.targetX === right.targetX &&
    left.targetY === right.targetY &&
    left.hidden === right.hidden &&
    left.selected === right.selected &&
    left.zIndex === right.zIndex
  );
}

function areAgenticEdgeRecordsEqual(
  left: CanvasEngineAgenticEdge,
  right: CanvasEngineAgenticEdge,
): boolean {
  return (
    left.id === right.id &&
    left.sourceSectionId === right.sourceSectionId &&
    left.targetSectionId === right.targetSectionId &&
    left.kind === right.kind &&
    left.hidden === right.hidden &&
    left.selected === right.selected &&
    left.zIndex === right.zIndex
  );
}

function compareRectRecords(
  left: CanvasEngineRect,
  right: CanvasEngineRect,
): number {
  if (left.zIndex !== right.zIndex) {
    return left.zIndex - right.zIndex;
  }
  return left.id.localeCompare(right.id);
}

function resolveSectionSelectionSortRecord(
  sectionId: string,
  rectById: Map<string, CanvasEngineRect>,
  nestedPreviewRectById: Map<string, CanvasEngineNestedPreviewRect>,
): {
  kind: "top-level" | "nested-preview";
  zIndex: number;
} | null {
  const topLevelRect = rectById.get(sectionId);
  if (topLevelRect) {
    return {
      kind: "top-level",
      zIndex: topLevelRect.zIndex,
    };
  }
  const nestedPreviewRect = nestedPreviewRectById.get(sectionId);
  if (!nestedPreviewRect) {
    return null;
  }
  return {
    kind: "nested-preview",
    zIndex: rectById.get(nestedPreviewRect.parentSectionId)?.zIndex ?? 0,
  };
}

function compareDataEdgeRecords(
  left: CanvasEngineDataEdge,
  right: CanvasEngineDataEdge,
): number {
  if (left.zIndex !== right.zIndex) {
    return left.zIndex - right.zIndex;
  }
  return left.id.localeCompare(right.id);
}

function compareAgenticEdgeRecords(
  left: CanvasEngineAgenticEdge,
  right: CanvasEngineAgenticEdge,
): number {
  if (left.zIndex !== right.zIndex) {
    return left.zIndex - right.zIndex;
  }
  return left.id.localeCompare(right.id);
}

function sortRects(rects: CanvasEngineRect[]): CanvasEngineRect[] {
  return [...rects].sort(compareRectRecords);
}

function sortDataEdges(edges: CanvasEngineDataEdge[]): CanvasEngineDataEdge[] {
  return [...edges].sort(compareDataEdgeRecords);
}

function sortAgenticEdges(
  edges: CanvasEngineAgenticEdge[],
): CanvasEngineAgenticEdge[] {
  return [...edges].sort(compareAgenticEdgeRecords);
}

function sortNestedPreviewRects(
  rects: CanvasEngineNestedPreviewRect[],
): CanvasEngineNestedPreviewRect[] {
  return [...rects].sort((left, right) => {
    if (left.parentSectionId !== right.parentSectionId) {
      return left.parentSectionId.localeCompare(right.parentSectionId);
    }
    return left.id.localeCompare(right.id);
  });
}

function areNestedPreviewRectsEqual(
  left: CanvasEngineNestedPreviewRect,
  right: CanvasEngineNestedPreviewRect,
): boolean {
  return (
    left.id === right.id &&
    left.parentSectionId === right.parentSectionId &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.isActive === right.isActive &&
    left.color[0] === right.color[0] &&
    left.color[1] === right.color[1] &&
    left.color[2] === right.color[2]
  );
}

function getViewportPaddingWorld(viewportPaddingPx: number, zoom: number) {
  return viewportPaddingPx / zoom;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
