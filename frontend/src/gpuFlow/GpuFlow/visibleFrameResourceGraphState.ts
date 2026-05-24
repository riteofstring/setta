import {
  createGpuFlowVisibleFrameResourceDeadlineFrame,
  estimateGpuFlowVisibleFrameResourceCostMs,
  inferGpuFlowVisibleFrameResourcePreparationLane,
  inferGpuFlowVisibleFrameResourcePriority,
} from "./visibleFrameResourceGraphResources";
import type {
  GpuFlowVisibleFrameResourcePreparationLane,
  GpuFlowVisibleFrameResourcePriority,
  GpuFlowVisibleFrameResourceStateKind,
} from "./visibleFrameResourceGraph";

export type GpuFlowVisibleFrameResourceStateEntry =
  GpuFlowVisibleFrameResourceStateSnapshot & {
    readonly requestedAtFrame: number;
    readonly transitionFrame: number;
  };

type GpuFlowVisibleFrameResourceStateSnapshot = {
  readonly debtAgeFrames: number;
  readonly deadlineFrame: number | null;
  readonly estimatedCostMs: number;
  readonly ownerFrameId: number | null;
  readonly preparationLane: GpuFlowVisibleFrameResourcePreparationLane;
  readonly priority: GpuFlowVisibleFrameResourcePriority;
  readonly resourceKey: string;
  readonly state: GpuFlowVisibleFrameResourceStateKind;
};

export type GpuFlowVisibleFrameResourceTransitionInput = {
  readonly deadlineFrame?: number | null | undefined;
  readonly estimatedCostMs?: number | undefined;
  readonly ownerFrameId: number | null;
  readonly preparationLane?:
    | GpuFlowVisibleFrameResourcePreparationLane
    | undefined;
  readonly priority?: GpuFlowVisibleFrameResourcePriority | undefined;
  readonly resourceKey: string;
  readonly state: GpuFlowVisibleFrameResourceStateKind;
};

export function createGpuFlowVisibleFrameResourceStateEntry({
  current,
  input,
  transitionFrame,
}: {
  readonly current: GpuFlowVisibleFrameResourceStateEntry | undefined;
  readonly input: GpuFlowVisibleFrameResourceTransitionInput;
  readonly transitionFrame: number;
}): GpuFlowVisibleFrameResourceStateEntry {
  const requestedAtFrame = resolveGpuFlowVisibleFrameResourceRequestedAtFrame({
    current,
    state: input.state,
    transitionFrame,
  });
  const preparationLane = resolveGpuFlowVisibleFrameResourcePreparationLane({
    current,
    preparationLane: input.preparationLane,
    resourceKey: input.resourceKey,
  });
  const priority = resolveGpuFlowVisibleFrameResourcePriority({
    current,
    priority: input.priority,
    resourceKey: input.resourceKey,
  });
  return Object.freeze({
    debtAgeFrames: calculateGpuFlowVisibleFrameResourceDebtAgeFrames({
      requestedAtFrame,
      state: input.state,
      transitionFrame,
    }),
    deadlineFrame: resolveGpuFlowVisibleFrameResourceDeadlineFrame({
      current,
      deadlineFrame: input.deadlineFrame,
      priority,
      transitionFrame,
    }),
    estimatedCostMs: resolveGpuFlowVisibleFrameResourceEstimatedCostMs({
      current,
      estimatedCostMs: input.estimatedCostMs,
      resourceKey: input.resourceKey,
    }),
    ownerFrameId: input.ownerFrameId,
    preparationLane,
    priority,
    requestedAtFrame,
    resourceKey: input.resourceKey,
    state: input.state,
    transitionFrame,
  });
}

export function calculateGpuFlowVisibleFrameResourceDebtAgeFrames({
  requestedAtFrame,
  state,
  transitionFrame,
}: {
  readonly requestedAtFrame: number;
  readonly state: GpuFlowVisibleFrameResourceStateKind;
  readonly transitionFrame: number;
}): number {
  if (state !== "requested" && state !== "preparing") {
    return 0;
  }
  return transitionFrame - requestedAtFrame;
}

export function assertGpuFlowVisibleFrameResourceTransition({
  currentState,
  nextState,
  resourceKey,
}: {
  readonly currentState: GpuFlowVisibleFrameResourceStateKind;
  readonly nextState: GpuFlowVisibleFrameResourceStateKind;
  readonly resourceKey: string;
}): void {
  const allowedNextStates =
    GPU_FLOW_VISIBLE_FRAME_RESOURCE_ALLOWED_TRANSITIONS[currentState];
  if (
    (
      allowedNextStates as readonly GpuFlowVisibleFrameResourceStateKind[]
    ).includes(nextState)
  ) {
    return;
  }
  throw new Error(
    `GPU Flow visible frame resource ${resourceKey} cannot transition from ${currentState} to ${nextState}.`,
  );
}

function resolveGpuFlowVisibleFrameResourceRequestedAtFrame({
  current,
  state,
  transitionFrame,
}: {
  readonly current: GpuFlowVisibleFrameResourceStateEntry | undefined;
  readonly state: GpuFlowVisibleFrameResourceStateKind;
  readonly transitionFrame: number;
}): number {
  if (state === "requested") {
    return transitionFrame;
  }
  return current?.requestedAtFrame ?? transitionFrame;
}

function resolveGpuFlowVisibleFrameResourcePreparationLane({
  current,
  preparationLane,
  resourceKey,
}: {
  readonly current: GpuFlowVisibleFrameResourceStateEntry | undefined;
  readonly preparationLane?:
    | GpuFlowVisibleFrameResourcePreparationLane
    | undefined;
  readonly resourceKey: string;
}): GpuFlowVisibleFrameResourcePreparationLane {
  return (
    preparationLane ??
    current?.preparationLane ??
    inferGpuFlowVisibleFrameResourcePreparationLane(resourceKey)
  );
}

function resolveGpuFlowVisibleFrameResourcePriority({
  current,
  priority,
  resourceKey,
}: {
  readonly current: GpuFlowVisibleFrameResourceStateEntry | undefined;
  readonly priority?: GpuFlowVisibleFrameResourcePriority | undefined;
  readonly resourceKey: string;
}): GpuFlowVisibleFrameResourcePriority {
  return (
    priority ??
    current?.priority ??
    inferGpuFlowVisibleFrameResourcePriority(resourceKey)
  );
}

function resolveGpuFlowVisibleFrameResourceDeadlineFrame({
  current,
  deadlineFrame,
  priority,
  transitionFrame,
}: {
  readonly current: GpuFlowVisibleFrameResourceStateEntry | undefined;
  readonly deadlineFrame?: number | null | undefined;
  readonly priority: GpuFlowVisibleFrameResourcePriority;
  readonly transitionFrame: number;
}): number | null {
  if (deadlineFrame !== undefined) {
    return deadlineFrame;
  }
  return (
    current?.deadlineFrame ??
    createGpuFlowVisibleFrameResourceDeadlineFrame({
      priority,
      transitionFrame,
    })
  );
}

function resolveGpuFlowVisibleFrameResourceEstimatedCostMs({
  current,
  estimatedCostMs,
  resourceKey,
}: {
  readonly current: GpuFlowVisibleFrameResourceStateEntry | undefined;
  readonly estimatedCostMs?: number | undefined;
  readonly resourceKey: string;
}): number {
  return (
    estimatedCostMs ??
    current?.estimatedCostMs ??
    estimateGpuFlowVisibleFrameResourceCostMs(resourceKey)
  );
}

const GPU_FLOW_VISIBLE_FRAME_RESOURCE_ALLOWED_TRANSITIONS = Object.freeze({
  absent: Object.freeze(["requested", "retired"]),
  preparing: Object.freeze(["ready", "retired"]),
  presented: Object.freeze(["presented", "retired"]),
  ready: Object.freeze(["presented", "ready", "retired"]),
  requested: Object.freeze(["preparing", "retired"]),
  retired: Object.freeze(["requested", "retired"]),
} satisfies Record<
  GpuFlowVisibleFrameResourceStateKind,
  readonly GpuFlowVisibleFrameResourceStateKind[]
>);
