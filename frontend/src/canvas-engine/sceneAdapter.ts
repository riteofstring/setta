import { CanvasEngineSpatialIndex } from "canvas-engine/spatialIndex";
import type {
  CanvasEngineAgenticEdge,
  CanvasEngineCamera,
  CanvasEngineDataEdge,
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

const DEFAULT_CONFIG: CanvasEngineSceneAdapterConfig = {
  defaultSectionWidth: 320,
  defaultSectionHeight: 200,
  viewportPaddingPx: 320,
  spatialIndexCellSize: 512,
};

const AGENTIC_HANDLE_GAP_WORLD = 12;
const AGENTIC_HANDLE_HALF_SIZE_WORLD = 7;
const DATA_HANDLE_EXTENT_WORLD = 16;

export class CanvasEngineSceneAdapter {
  private readonly config: CanvasEngineSceneAdapterConfig;

  private readonly spatialIndex: CanvasEngineSpatialIndex;

  private readonly rectById: Map<string, CanvasEngineRect>;

  private readonly dataEdgeById: Map<string, CanvasEngineDataEdge>;

  private readonly agenticEdgeById: Map<string, CanvasEngineAgenticEdge>;

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
    this.rectById = new Map();
    this.dataEdgeById = new Map();
    this.agenticEdgeById = new Map();
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

    const hasChanges =
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
      ...sectionSummary,
      ...dataEdgeSummary,
      ...agenticEdgeSummary,
    };
  }

  public createSnapshot(
    camera: CanvasEngineCamera,
    viewport: CanvasEngineViewport,
  ): CanvasEngineSceneSnapshotResult {
    const visibleSectionIds = this.queryVisibleSectionIds(camera, viewport);
    const visibleSectionSet = new Set(visibleSectionIds);
    for (const activeSectionId of this.activeSectionIdSet) {
      visibleSectionSet.add(activeSectionId);
    }

    const rects: CanvasEngineRect[] = [];
    for (const sectionId of visibleSectionSet) {
      const rect = this.rectById.get(sectionId);
      if (rect) {
        rects.push(rect);
      }
    }
    rects.sort(compareRectRecords);

    const dataEdges: CanvasEngineDataEdge[] = [];
    for (const edge of this.dataEdgeById.values()) {
      if (
        !isEdgeVisible(
          edge.sourceSectionId,
          edge.targetSectionId,
          visibleSectionSet,
        )
      ) {
        continue;
      }
      dataEdges.push(edge);
    }
    dataEdges.sort(compareDataEdgeRecords);

    const agenticEdges: CanvasEngineAgenticEdge[] = [];
    for (const edge of this.agenticEdgeById.values()) {
      if (
        !isEdgeVisible(
          edge.sourceSectionId,
          edge.targetSectionId,
          visibleSectionSet,
        )
      ) {
        continue;
      }
      agenticEdges.push(edge);
    }
    agenticEdges.sort(compareAgenticEdgeRecords);

    return {
      snapshot: {
        camera,
        clearColor: [0.07, 0.08, 0.1],
        rects,
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
  ): string | null {
    const candidateIds = this.spatialIndex.queryRect({
      x: worldX,
      y: worldY,
      width: 1,
      height: 1,
    });
    let topmostRect: CanvasEngineRect | null = null;
    for (const sectionId of candidateIds) {
      const rect = this.rectById.get(sectionId);
      if (!rect) {
        continue;
      }
      if (!isPointInsideRect(worldX, worldY, rect)) {
        continue;
      }
      if (!topmostRect || isRectAbove(rect, topmostRect)) {
        topmostRect = rect;
      }
    }
    return topmostRect?.id ?? null;
  }

  public getRectById(sectionId: string): CanvasEngineRect | null {
    return this.rectById.get(sectionId) ?? null;
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
    const sourceRect = this.rectById.get(edge.sourceSectionId);
    const targetRect = this.rectById.get(edge.targetSectionId);
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
  ): string[] {
    if (selectionRect.width <= 0 || selectionRect.height <= 0) {
      return [];
    }

    const candidateIds = this.spatialIndex.queryRect(selectionRect);
    const selectedIds: string[] = [];
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
      selectedIds.push(sectionId);
    }
    selectedIds.sort((leftId, rightId) => {
      const leftRect = this.rectById.get(leftId);
      const rightRect = this.rectById.get(rightId);
      if (!leftRect || !rightRect) {
        return leftId.localeCompare(rightId);
      }
      if (leftRect.zIndex !== rightRect.zIndex) {
        return leftRect.zIndex - rightRect.zIndex;
      }
      return leftId.localeCompare(rightId);
    });
    return selectedIds;
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
      const sourceRect = this.rectById.get(edge.sourceSectionId);
      const targetRect = this.rectById.get(edge.targetSectionId);
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
      const sourceRect = this.rectById.get(edge.sourceSectionId);
      const targetRect = this.rectById.get(edge.targetSectionId);
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

    for (const rect of this.rectById.values()) {
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
    const candidateSectionIds = this.spatialIndex.queryRect({
      x: worldX - queryToleranceWorld,
      y: worldY - queryToleranceWorld,
      width: queryToleranceWorld * 2,
      height: queryToleranceWorld * 2,
    });

    for (const sectionId of candidateSectionIds) {
      const rect = this.rectById.get(sectionId);
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

    for (const edge of this.dataEdgeById.values()) {
      if (edge.hidden) {
        continue;
      }
      const sourceRect = this.rectById.get(edge.sourceSectionId);
      const targetRect = this.rectById.get(edge.targetSectionId);
      if (!sourceRect || !targetRect) {
        continue;
      }
      const anchors = resolveDataEdgeAnchors(edge, sourceRect, targetRect);
      const sourceDistance = Math.hypot(
        worldX - anchors.startX,
        worldY - anchors.startY,
      );
      const targetDistance = Math.hypot(
        worldX - anchors.endX,
        worldY - anchors.endY,
      );

      const endpointCandidates: Array<{
        endpointType: "source" | "target";
        distance: number;
      }> = [
        { endpointType: "source", distance: sourceDistance },
        { endpointType: "target", distance: targetDistance },
      ];

      for (const endpoint of endpointCandidates) {
        if (endpoint.distance > toleranceWorld) {
          continue;
        }
        const candidate = {
          edgeId: edge.id,
          endpointType: endpoint.endpointType,
          zIndex: edge.zIndex,
          distance: endpoint.distance,
        };
        if (
          !hitCandidate ||
          isDataEdgeEndpointHitCandidateAbove(candidate, hitCandidate)
        ) {
          hitCandidate = candidate;
        }
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
  ): Pick<
    CanvasEngineScenePatchSummary,
    "sectionsAdded" | "sectionsUpdated" | "sectionsRemoved"
  > {
    const nextSectionIds = new Set(Object.keys(topLevelSections));
    let sectionsAdded = 0;
    let sectionsUpdated = 0;
    let sectionsRemoved = 0;

    for (const [sectionId, layout] of Object.entries(topLevelSections)) {
      const nextRect = this.createRectRecord(
        sectionId,
        layout,
        activeSectionIdSet.has(sectionId),
      );
      const previousRect = this.rectById.get(sectionId);
      if (!previousRect) {
        this.rectById.set(sectionId, nextRect);
        this.spatialIndex.upsert(sectionId, {
          x: nextRect.x,
          y: nextRect.y,
          width: nextRect.width,
          height: nextRect.height,
        });
        sectionsAdded += 1;
        continue;
      }

      if (areRectRecordsEqual(previousRect, nextRect)) {
        continue;
      }

      this.rectById.set(sectionId, nextRect);
      if (
        previousRect.x !== nextRect.x ||
        previousRect.y !== nextRect.y ||
        previousRect.width !== nextRect.width ||
        previousRect.height !== nextRect.height
      ) {
        this.spatialIndex.upsert(sectionId, {
          x: nextRect.x,
          y: nextRect.y,
          width: nextRect.width,
          height: nextRect.height,
        });
      }
      sectionsUpdated += 1;
    }

    for (const sectionId of this.rectById.keys()) {
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

  private createRectRecord(
    sectionId: string,
    layout: TopLevelSectionLayout,
    isActive: boolean,
  ): CanvasEngineRect {
    const width = resolveSectionWidth(layout, this.config.defaultSectionWidth);
    const height = resolveSectionHeight(
      layout,
      this.config.defaultSectionHeight,
    );
    const zIndex = typeof layout.zIndex === "number" ? layout.zIndex : 0;

    return {
      id: sectionId,
      x: typeof layout.x === "number" ? layout.x : 0,
      y: typeof layout.y === "number" ? layout.y : 0,
      width,
      height,
      zIndex,
      isActive,
      color: resolveSectionColor(sectionId, isActive),
    };
  }

  private queryVisibleSectionIds(
    camera: CanvasEngineCamera,
    viewport: CanvasEngineViewport,
  ): string[] {
    const zoom = clamp(camera.zoom, 0.1, 4);
    const worldPadding = this.config.viewportPaddingPx / zoom;
    const worldBounds = {
      x: camera.x - worldPadding,
      y: camera.y - worldPadding,
      width: viewport.width / zoom + worldPadding * 2,
      height: viewport.height / zoom + worldPadding * 2,
    };
    return this.spatialIndex.queryRect(worldBounds);
  }

  private applyDataEdges(
    edges: ProjectConfig["edges"],
    sectionEdgePortsBySectionId: Record<string, CanvasEngineSectionEdgePorts>,
  ): Pick<
    CanvasEngineScenePatchSummary,
    "dataEdgesAdded" | "dataEdgesUpdated" | "dataEdgesRemoved"
  > {
    const nextEdgeIds = new Set<string>();
    let dataEdgesAdded = 0;
    let dataEdgesUpdated = 0;
    let dataEdgesRemoved = 0;

    for (const edge of edges) {
      nextEdgeIds.add(edge.id);
      const nextEdgeRecord = createDataEdgeRecord(
        edge,
        this.edgeHandlePositionByKey,
        this.rectById,
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

    for (const edgeId of this.dataEdgeById.keys()) {
      if (nextEdgeIds.has(edgeId)) {
        continue;
      }
      this.dataEdgeById.delete(edgeId);
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
  ): Pick<
    CanvasEngineScenePatchSummary,
    "agenticEdgesAdded" | "agenticEdgesUpdated" | "agenticEdgesRemoved"
  > {
    const nextEdgeIds = new Set<string>();
    let agenticEdgesAdded = 0;
    let agenticEdgesUpdated = 0;
    let agenticEdgesRemoved = 0;

    for (const edge of edges) {
      nextEdgeIds.add(edge.id);
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

    for (const edgeId of this.agenticEdgeById.keys()) {
      if (nextEdgeIds.has(edgeId)) {
        continue;
      }
      this.agenticEdgeById.delete(edgeId);
      agenticEdgesRemoved += 1;
    }

    return {
      agenticEdgesAdded,
      agenticEdgesUpdated,
      agenticEdgesRemoved,
    };
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

function createDataEdgeRecord(
  edge: DataEdgeInput,
  edgeHandlePositionByKey: Map<string, CanvasEngineEdgeHandlePosition>,
  rectById: Map<string, CanvasEngineRect>,
  sectionEdgePortsBySectionId: Record<string, CanvasEngineSectionEdgePorts>,
): CanvasEngineDataEdge {
  const sourceHandle = edgeHandlePositionByKey.get(
    buildDataHandleKey(edge.sourceSectionId, edge.sourcePortId, "source"),
  );
  const targetHandle = edgeHandlePositionByKey.get(
    buildDataHandleKey(edge.targetSectionId, edge.targetPortId, "target"),
  );
  const sourceRect = rectById.get(edge.sourceSectionId) ?? null;
  const targetRect = rectById.get(edge.targetSectionId) ?? null;
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

function isEdgeVisible(
  sourceSectionId: string,
  targetSectionId: string,
  visibleSectionSet: Set<string>,
): boolean {
  return (
    visibleSectionSet.has(sourceSectionId) ||
    visibleSectionSet.has(targetSectionId)
  );
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
  rect: CanvasEngineRect;
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

function isRectAbove(
  candidate: CanvasEngineRect,
  current: CanvasEngineRect,
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
  rect: CanvasEngineRect;
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
  sourceRect: CanvasEngineRect,
  targetRect: CanvasEngineRect,
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
  sourceRect: CanvasEngineRect,
  targetRect: CanvasEngineRect,
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
  sectionRect: CanvasEngineRect,
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
