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
  totalDataEdgeCount: number;
  totalAgenticEdgeCount: number;
};

const DEFAULT_CONFIG: CanvasEngineSceneAdapterConfig = {
  defaultSectionWidth: 320,
  defaultSectionHeight: 200,
  viewportPaddingPx: 320,
  spatialIndexCellSize: 512,
};

export class CanvasEngineSceneAdapter {
  private readonly config: CanvasEngineSceneAdapterConfig;

  private readonly spatialIndex: CanvasEngineSpatialIndex;

  private readonly rectById: Map<string, CanvasEngineRect>;

  private readonly dataEdgeById: Map<string, CanvasEngineDataEdge>;

  private readonly agenticEdgeById: Map<string, CanvasEngineAgenticEdge>;

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
    this.activeSectionIdSet = new Set();
  }

  public applyProjectState(
    input: CanvasEngineProjectSceneInput,
  ): CanvasEngineScenePatchSummary {
    const nextActiveSectionIdSet = new Set(input.activeSectionIds);
    const sectionSummary = this.applySections(
      input.topLevelSections,
      nextActiveSectionIdSet,
    );
    this.activeSectionIdSet = nextActiveSectionIdSet;

    const dataEdgeSummary = this.applyDataEdges(input.edges);
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

    const dataEdges = Array.from(this.dataEdgeById.values());
    dataEdges.sort(compareDataEdgeRecords);

    const agenticEdges = Array.from(this.agenticEdgeById.values());
    agenticEdges.sort(compareAgenticEdgeRecords);

    return {
      snapshot: {
        camera,
        clearColor: [0.07, 0.08, 0.1],
        rects,
        dataEdges,
        agenticEdges,
      },
      visibleRectCount: rects.length,
      totalRectCount: this.rectById.size,
      totalDataEdgeCount: dataEdges.length,
      totalAgenticEdgeCount: agenticEdges.length,
    };
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
      const nextEdgeRecord = createDataEdgeRecord(edge);
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

function createDataEdgeRecord(edge: DataEdgeInput): CanvasEngineDataEdge {
  return {
    id: edge.id,
    sourceSectionId: edge.sourceSectionId,
    sourceVariantId: edge.sourceVariantId,
    sourcePortId: edge.sourcePortId,
    targetSectionId: edge.targetSectionId,
    targetVariantId: edge.targetVariantId,
    targetPortId: edge.targetPortId,
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
