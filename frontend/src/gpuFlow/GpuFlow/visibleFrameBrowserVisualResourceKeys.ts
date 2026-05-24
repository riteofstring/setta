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
