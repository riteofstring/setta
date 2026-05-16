import type { GpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { GpuRect } from "./viewportMath";

export type PublishedNativeIslandRect = {
  readonly id: string;
  readonly rect: GpuRect;
};

export type NativeIslandPublicationMode =
  | "none"
  | "attach"
  | "survive"
  | "commit-detach"
  | "replace"
  | "blocked-attach"
  | "blocked-commit-detach"
  | "blocked-replace";

export type NativeIslandPublicationTransaction = {
  readonly attachedIslandIds: readonly string[];
  readonly blockedByCoverage: boolean;
  readonly desiredIslandIds: readonly string[];
  readonly detachedIslandIds: readonly string[];
  readonly mode: NativeIslandPublicationMode;
  readonly previousIslandIds: readonly string[];
  readonly publishedIslandIds: readonly string[];
  readonly stalePassiveRevealBlocked: boolean;
  readonly survivedIslandIds: readonly string[];
};

export function createPublishedNativeIslandRects(
  frame: GpuRetainedRuntimeFrame,
): readonly PublishedNativeIslandRect[] {
  return Object.freeze(
    frame.descriptors.nativeDomIslands.map((island) =>
      Object.freeze({
        id: island.id,
        rect: Object.freeze({ ...island.rect }),
      }),
    ),
  );
}

export function resolveNativeIslandPublicationTransaction({
  blockedByCoverage,
  desiredIslandIds,
  previousIslandIds = [],
  publishedIslandIds,
}: {
  readonly blockedByCoverage: boolean;
  readonly desiredIslandIds: readonly string[];
  readonly previousIslandIds?: readonly string[] | undefined;
  readonly publishedIslandIds: readonly string[];
}): NativeIslandPublicationTransaction {
  const attachedIslandIds = difference(publishedIslandIds, previousIslandIds);
  const detachedIslandIds = difference(previousIslandIds, publishedIslandIds);
  const survivedIslandIds = intersection(publishedIslandIds, previousIslandIds);
  const mode = resolveNativeIslandPublicationMode({
    blockedByCoverage,
    desiredIslandIds,
    publishedIslandIds,
    previousIslandIds,
  });
  return Object.freeze({
    attachedIslandIds: freezeArray(attachedIslandIds),
    blockedByCoverage,
    desiredIslandIds: freezeArray(desiredIslandIds),
    detachedIslandIds: freezeArray(detachedIslandIds),
    mode,
    previousIslandIds: freezeArray(previousIslandIds),
    publishedIslandIds: freezeArray(publishedIslandIds),
    stalePassiveRevealBlocked:
      mode === "blocked-commit-detach" || mode === "blocked-replace",
    survivedIslandIds: freezeArray(survivedIslandIds),
  });
}

function resolveNativeIslandPublicationMode({
  blockedByCoverage,
  desiredIslandIds,
  previousIslandIds,
  publishedIslandIds,
}: {
  readonly blockedByCoverage: boolean;
  readonly desiredIslandIds: readonly string[];
  readonly previousIslandIds: readonly string[];
  readonly publishedIslandIds: readonly string[];
}): NativeIslandPublicationMode {
  if (blockedByCoverage) {
    return resolveBlockedNativeIslandPublicationMode({
      desiredIslandIds,
      previousIslandIds,
    });
  }
  return resolvePublishedNativeIslandPublicationMode({
    previousIslandIds,
    publishedIslandIds,
  });
}

function resolveBlockedNativeIslandPublicationMode({
  desiredIslandIds,
  previousIslandIds,
}: {
  readonly desiredIslandIds: readonly string[];
  readonly previousIslandIds: readonly string[];
}): NativeIslandPublicationMode {
  if (setsEqual(desiredIslandIds, previousIslandIds)) {
    return previousIslandIds.length > 0 ? "survive" : "none";
  }
  if (previousIslandIds.length === 0) {
    return "blocked-attach";
  }
  if (desiredIslandIds.length === 0) {
    return "blocked-commit-detach";
  }
  return "blocked-replace";
}

function resolvePublishedNativeIslandPublicationMode({
  previousIslandIds,
  publishedIslandIds,
}: {
  readonly previousIslandIds: readonly string[];
  readonly publishedIslandIds: readonly string[];
}): NativeIslandPublicationMode {
  if (previousIslandIds.length === 0 && publishedIslandIds.length === 0) {
    return "none";
  }
  if (previousIslandIds.length === 0 && publishedIslandIds.length > 0) {
    return "attach";
  }
  if (previousIslandIds.length > 0 && publishedIslandIds.length === 0) {
    return "commit-detach";
  }
  if (setsEqual(previousIslandIds, publishedIslandIds)) {
    return "survive";
  }
  return "replace";
}

function difference(
  left: readonly string[],
  right: readonly string[],
): readonly string[] {
  const rightSet = new Set(right);
  return left.filter((id) => !rightSet.has(id));
}

function intersection(
  left: readonly string[],
  right: readonly string[],
): readonly string[] {
  const rightSet = new Set(right);
  return left.filter((id) => rightSet.has(id));
}

function setsEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}
