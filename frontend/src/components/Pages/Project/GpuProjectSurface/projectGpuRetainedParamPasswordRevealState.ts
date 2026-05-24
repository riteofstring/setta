type ProjectGpuRetainedPasswordRevealState = {
  readonly pending: boolean;
  readonly value: string | null;
};

export type ProjectGpuRetainedPasswordRevealStateMap = ReadonlyMap<
  string,
  ProjectGpuRetainedPasswordRevealState
>;

export type ProjectGpuRetainedPasswordRevealUpdate =
  | {
      readonly kind: "clear";
      readonly paramInfoId: string;
      readonly sectionId: string;
    }
  | {
      readonly kind: "pending";
      readonly paramInfoId: string;
      readonly sectionId: string;
    }
  | {
      readonly kind: "revealed";
      readonly paramInfoId: string;
      readonly sectionId: string;
      readonly value: string;
    }
  | {
      readonly kind: "settle";
      readonly paramInfoId: string;
      readonly sectionId: string;
    };

export function getProjectGpuRetainedPasswordRevealKey({
  paramInfoId,
  sectionId,
}: {
  readonly paramInfoId: string;
  readonly sectionId: string;
}): string {
  return `${sectionId}:${paramInfoId}`;
}

export function applyProjectGpuRetainedPasswordRevealUpdate(
  current: ProjectGpuRetainedPasswordRevealStateMap,
  update: ProjectGpuRetainedPasswordRevealUpdate,
): ProjectGpuRetainedPasswordRevealStateMap {
  const key = getProjectGpuRetainedPasswordRevealKey(update);
  const next = new Map(current);
  if (update.kind === "clear") {
    next.delete(key);
    return next;
  }
  if (update.kind === "pending") {
    next.set(key, { pending: true, value: null });
    return next;
  }
  if (update.kind === "revealed") {
    next.set(key, { pending: false, value: update.value });
    return next;
  }
  const state = next.get(key);
  if (state?.pending) {
    next.delete(key);
  }
  return next;
}
