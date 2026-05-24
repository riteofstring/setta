import type { GpuRetainedRuntimeFrame } from "./retainedRuntimeFrame";
import type { GpuRect } from "./viewportMath";

export type PresentedNativeIslandRect = {
  readonly id: string;
  readonly rect: GpuRect;
};

type NativeIslandPresentationMode =
  | "none"
  | "attach"
  | "survive"
  | "commit-detach"
  | "replace"
  | "blocked-attach"
  | "blocked-commit-detach"
  | "blocked-replace";

export type NativeIslandPresentationTransaction = {
  readonly attachedIslandIds: readonly string[];
  readonly blockedByCoverage: boolean;
  readonly desiredIslandIds: readonly string[];
  readonly detachedIslandIds: readonly string[];
  readonly mode: NativeIslandPresentationMode;
  readonly previousIslandIds: readonly string[];
  readonly presentedIslandIds: readonly string[];
  readonly stalePassiveRevealBlocked: boolean;
  readonly survivedIslandIds: readonly string[];
};

export function createPresentedNativeIslandRects(
  frame: GpuRetainedRuntimeFrame,
): readonly PresentedNativeIslandRect[] {
  return Object.freeze(
    frame.descriptors.nativeDomIslands.map((island) =>
      Object.freeze({
        id: island.id,
        rect: Object.freeze({ ...island.rect }),
      }),
    ),
  );
}

export function resolveNativeIslandPresentationTransaction({
  blockedByCoverage,
  desiredIslandIds,
  previousIslandIds = [],
  presentedIslandIds,
}: {
  readonly blockedByCoverage: boolean;
  readonly desiredIslandIds: readonly string[];
  readonly previousIslandIds?: readonly string[] | undefined;
  readonly presentedIslandIds: readonly string[];
}): NativeIslandPresentationTransaction {
  const attachedIslandIds = difference(presentedIslandIds, previousIslandIds);
  const detachedIslandIds = difference(previousIslandIds, presentedIslandIds);
  const survivedIslandIds = intersection(presentedIslandIds, previousIslandIds);
  const mode = resolveNativeIslandPresentationMode({
    blockedByCoverage,
    desiredIslandIds,
    presentedIslandIds,
    previousIslandIds,
  });
  return Object.freeze({
    attachedIslandIds: freezeArray(attachedIslandIds),
    blockedByCoverage,
    desiredIslandIds: freezeArray(desiredIslandIds),
    detachedIslandIds: freezeArray(detachedIslandIds),
    mode,
    previousIslandIds: freezeArray(previousIslandIds),
    presentedIslandIds: freezeArray(presentedIslandIds),
    stalePassiveRevealBlocked:
      mode === "blocked-commit-detach" || mode === "blocked-replace",
    survivedIslandIds: freezeArray(survivedIslandIds),
  });
}

function resolveNativeIslandPresentationMode({
  blockedByCoverage,
  desiredIslandIds,
  previousIslandIds,
  presentedIslandIds,
}: {
  readonly blockedByCoverage: boolean;
  readonly desiredIslandIds: readonly string[];
  readonly previousIslandIds: readonly string[];
  readonly presentedIslandIds: readonly string[];
}): NativeIslandPresentationMode {
  if (blockedByCoverage) {
    return resolveBlockedNativeIslandPresentationMode({
      desiredIslandIds,
      previousIslandIds,
    });
  }
  return resolvePresentedNativeIslandPresentationMode({
    previousIslandIds,
    presentedIslandIds,
  });
}

function resolveBlockedNativeIslandPresentationMode({
  desiredIslandIds,
  previousIslandIds,
}: {
  readonly desiredIslandIds: readonly string[];
  readonly previousIslandIds: readonly string[];
}): NativeIslandPresentationMode {
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

function resolvePresentedNativeIslandPresentationMode({
  previousIslandIds,
  presentedIslandIds,
}: {
  readonly previousIslandIds: readonly string[];
  readonly presentedIslandIds: readonly string[];
}): NativeIslandPresentationMode {
  if (previousIslandIds.length === 0 && presentedIslandIds.length === 0) {
    return "none";
  }
  if (previousIslandIds.length === 0 && presentedIslandIds.length > 0) {
    return "attach";
  }
  if (previousIslandIds.length > 0 && presentedIslandIds.length === 0) {
    return "commit-detach";
  }
  if (setsEqual(previousIslandIds, presentedIslandIds)) {
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
