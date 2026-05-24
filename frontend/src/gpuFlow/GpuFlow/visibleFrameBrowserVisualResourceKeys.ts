import type { GpuRetainedDomControlSourceDescriptor } from "../retainedDomControlScene";

type GpuFlowDomControlLiveHostResourceKeyDescriptor = Pick<
  GpuRetainedDomControlSourceDescriptor,
  "sourceId"
>;

type GpuFlowDomControlSnapshotResourceKeyDescriptor = Pick<
  GpuRetainedDomControlSourceDescriptor,
  "snapshotSurfaceId" | "sourceId"
>;

export function createGpuFlowDomControlLiveHostPreparationResourceKey(
  control: GpuFlowDomControlLiveHostResourceKeyDescriptor,
): string {
  return `dom-control:${control.sourceId}`;
}

export function createGpuFlowDomControlSnapshotPreparationResourceKey(
  control: GpuFlowDomControlSnapshotResourceKeyDescriptor,
): string {
  return `dom-control-snapshot:${control.snapshotSurfaceId ?? control.sourceId}`;
}

export function hasGpuFlowBrowserVisualCandidateResourceKeyForActor({
  actorId,
  resourceKeys,
}: {
  readonly actorId: string;
  readonly resourceKeys: ReadonlySet<string>;
}): boolean {
  const prefix = `browser-visual:${actorId}:`;
  return [...resourceKeys].some((resourceKey) =>
    resourceKey.startsWith(prefix),
  );
}

export function isGpuFlowBrowserVisualPreparationResourceKey(
  resourceKey: string,
): boolean {
  return (
    resourceKey.startsWith("browser-visual:") ||
    resourceKey.startsWith("dom-control:") ||
    resourceKey.startsWith("dom-control-snapshot:") ||
    resourceKey.startsWith("dom-island:")
  );
}
