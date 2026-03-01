export type SceneGraphSectionShellSnapshot = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  isActive: boolean;
  isHovered: boolean;
};

export type SceneGraphEdgeSnapshot = {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  zIndex: number;
  isSelected: boolean;
  isHovered: boolean;
};

export type SceneGraphRenderSnapshot = {
  sections: SceneGraphSectionShellSnapshot[];
  edges: SceneGraphEdgeSnapshot[];
};

export type SceneGraphCamera = {
  x: number;
  y: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
};

export type SceneGraphFrameState = {
  frameNumber: number;
  timestampMs: number;
  wireColor: string;
  sectionStrokeColor: string;
  sectionFillColor: string;
  debugOverlay: boolean;
};

export type SceneGraphRenderSnapshotDiff = {
  addedSectionIds: string[];
  removedSectionIds: string[];
  changedSectionIds: string[];
  addedEdgeIds: string[];
  removedEdgeIds: string[];
  changedEdgeIds: string[];
  sectionCountDelta: number;
  edgeCountDelta: number;
  isEmpty: boolean;
};

export type SceneGraphResourceCacheStats = {
  sectionCacheSize: number;
  edgeCacheSize: number;
  sectionCacheCapacity: number;
  edgeCacheCapacity: number;
  sectionEvictions: number;
  edgeEvictions: number;
  totalEvictions: number;
  pressure: number;
};
