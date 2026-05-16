import { rectKey } from "./retainedCommittedCoverageGeometry";
import type {
  RetainedCommittedRegion,
  RetainedFidelityMetadata,
  RetainedRegionManifest,
  RetainedRegionTarget,
} from "./retainedCommittedCoverageStore";
import type { GpuRect } from "./viewportMath";

const RETAINED_COVERAGE_GRID_CELL_SIZE_CSS_PX = 512;

export type RetainedCoverageIndexEntry = {
  readonly exactKeys: readonly string[];
  readonly gridCellKeys: readonly string[];
  readonly ownerKey: string;
  readonly regionId: string;
};

export function groupTargetsByOwner(
  targets: readonly RetainedRegionTarget[],
): Map<string, RetainedRegionTarget[]> {
  const targetsByOwner = new Map<string, RetainedRegionTarget[]>();
  for (const target of targets) {
    const ownerKey = retainedRegionOwnerKey(target.manifest);
    const ownerTargets = targetsByOwner.get(ownerKey) ?? [];
    ownerTargets.push(target);
    targetsByOwner.set(ownerKey, ownerTargets);
  }
  return targetsByOwner;
}

export function retainedRegionOwnerKey(
  manifest: RetainedRegionManifest,
): string {
  return [
    manifest.surfaceId,
    manifest.documentId,
    manifest.sectionId,
    manifest.rowId ?? "row:none",
  ].join("|");
}

export function retainedCoverageExactKeysForTarget(
  target: RetainedRegionTarget,
): readonly string[] {
  return retainedCoverageExactKeys({
    clipRect: target.clipRect,
    contentRect: target.contentRect,
    fidelity: target.fidelity,
    manifest: target.manifest,
    zLayer: target.zLayer,
  });
}

export function retainedCoverageExactKeysForCommittedRegion(
  region: RetainedCommittedRegion,
): readonly string[] {
  return retainedCoverageExactKeys({
    clipRect: region.clipRect,
    contentRect: region.contentRect,
    fidelity: region.fidelity,
    manifest: region.manifest,
    zLayer: region.zLayer,
  });
}

export function retainedCoverageGridCellKeys(rect: GpuRect): readonly string[] {
  const minColumn = Math.floor(
    rect.x / RETAINED_COVERAGE_GRID_CELL_SIZE_CSS_PX,
  );
  const maxColumn = Math.floor(
    (rect.x + Math.max(0, rect.width - 1e-6)) /
      RETAINED_COVERAGE_GRID_CELL_SIZE_CSS_PX,
  );
  const minRow = Math.floor(rect.y / RETAINED_COVERAGE_GRID_CELL_SIZE_CSS_PX);
  const maxRow = Math.floor(
    (rect.y + Math.max(0, rect.height - 1e-6)) /
      RETAINED_COVERAGE_GRID_CELL_SIZE_CSS_PX,
  );
  const keys: string[] = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      keys.push(`${column}:${row}`);
    }
  }
  return Object.freeze(keys);
}

export function createRetainedCoverageOwnerGrid(
  gridsByOwner: Map<string, Map<string, Set<string>>>,
  ownerKey: string,
): Map<string, Set<string>> {
  const grid = new Map<string, Set<string>>();
  gridsByOwner.set(ownerKey, grid);
  return grid;
}

export function addIndexedRegionId(
  index: Map<string, Set<string>>,
  key: string,
  regionId: string,
): void {
  const regionIds = index.get(key) ?? createIndexedRegionSet(index, key);
  regionIds.add(regionId);
}

export function removeIndexedRegionId(
  index: Map<string, Set<string>>,
  key: string,
  regionId: string,
): void {
  const regionIds = index.get(key);
  if (!regionIds) {
    return;
  }
  regionIds.delete(regionId);
  if (regionIds.size === 0) {
    index.delete(key);
  }
}

function retainedCoverageExactKeys({
  clipRect,
  contentRect,
  fidelity,
  manifest,
  zLayer,
}: {
  readonly clipRect: GpuRect;
  readonly contentRect: GpuRect;
  readonly fidelity: RetainedFidelityMetadata;
  readonly manifest: RetainedRegionManifest;
  readonly zLayer: number;
}): readonly string[] {
  return [
    [
      retainedRegionOwnerKey(manifest),
      manifest.contentVersion,
      manifest.themeGeneration,
      manifest.fontGeneration,
      manifest.renderMode,
      rectKey(contentRect),
      rectKey(clipRect),
      fidelity.devicePixelRatioBucket,
      fidelity.lodLevel,
      fidelity.lodScale,
      fidelity.pageGridGeneration,
      fidelity.pixelWidth,
      fidelity.pixelHeight,
      fidelity.viewportZoomBucket,
      zLayer,
    ].join("|"),
  ];
}

function createIndexedRegionSet(
  index: Map<string, Set<string>>,
  key: string,
): Set<string> {
  const regionIds = new Set<string>();
  index.set(key, regionIds);
  return regionIds;
}
