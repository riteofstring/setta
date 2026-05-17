import type { GpuFlowViewportStoreApi } from "../viewportStore";

export type GpuWheelGestureOwner =
  | "idle"
  | "ownedByViewportPan"
  | "ownedByViewportZoom"
  | "ownedByRetainedSectionScroll"
  | "ownedByFocusedEditor"
  | "ownedByNativePage"
  | "cooldown";

export type GpuWheelGestureOwnershipState = {
  readonly lastTransitionReason: string | null;
  readonly owner: GpuWheelGestureOwner;
  readonly sequence: number;
};

export type GpuWheelGestureOwnershipArbiter = {
  readonly cancelOwner: (reason: string) => GpuWheelGestureOwnershipState;
  readonly getState: () => GpuWheelGestureOwnershipState;
  readonly releaseOwner: (
    owner: GpuWheelGestureOwner,
    reason: string,
  ) => GpuWheelGestureOwnershipState;
  readonly resolveOwner: (input: {
    readonly candidateOwner: Exclude<GpuWheelGestureOwner, "idle" | "cooldown">;
    readonly forceNativePage?: boolean | undefined;
    readonly nowMs?: number | undefined;
    readonly reason: string;
  }) => GpuWheelGestureOwnershipState;
};

const DEFAULT_WHEEL_BURST_TIMEOUT_MS = 180;
const wheelGestureOwnershipByViewportStore = new WeakMap<
  GpuFlowViewportStoreApi,
  GpuWheelGestureOwnershipArbiter
>();

export function createGpuWheelGestureOwnershipArbiter({
  burstTimeoutMs = DEFAULT_WHEEL_BURST_TIMEOUT_MS,
  now = defaultWheelOwnershipNow,
}: {
  readonly burstTimeoutMs?: number | undefined;
  readonly now?: (() => number) | undefined;
} = {}): GpuWheelGestureOwnershipArbiter {
  let owner: GpuWheelGestureOwner = "idle";
  let lastEventAtMs: number | null = null;
  let lastTransitionReason: string | null = null;
  let sequence = 0;

  function snapshot(): GpuWheelGestureOwnershipState {
    return Object.freeze({
      lastTransitionReason,
      owner,
      sequence,
    });
  }

  function transition(
    nextOwner: GpuWheelGestureOwner,
    reason: string,
  ): GpuWheelGestureOwnershipState {
    if (owner !== nextOwner) {
      owner = nextOwner;
      sequence += 1;
    }
    lastTransitionReason = reason;
    return snapshot();
  }

  function expireIfIdle(nowMs: number) {
    if (owner === "idle" || lastEventAtMs === null) {
      return;
    }
    if (nowMs - lastEventAtMs > burstTimeoutMs) {
      lastEventAtMs = null;
      transition("idle", "burst-timeout");
    }
  }

  return {
    cancelOwner(reason) {
      lastEventAtMs = null;
      return transition("idle", reason);
    },
    getState() {
      expireIfIdle(now());
      return snapshot();
    },
    releaseOwner(expectedOwner, reason) {
      if (owner !== expectedOwner) {
        return snapshot();
      }
      lastEventAtMs = null;
      return transition("idle", reason);
    },
    resolveOwner({ candidateOwner, forceNativePage = false, nowMs, reason }) {
      const resolvedNowMs = nowMs ?? now();
      expireIfIdle(resolvedNowMs);
      lastEventAtMs = resolvedNowMs;
      if (owner !== "idle" && owner !== "cooldown") {
        return snapshot();
      }
      return transition(
        forceNativePage ? "ownedByNativePage" : candidateOwner,
        reason,
      );
    },
  };
}

export function isGpuViewportWheelOwner(
  owner: GpuWheelGestureOwner,
): owner is "ownedByViewportPan" | "ownedByViewportZoom" {
  return owner === "ownedByViewportPan" || owner === "ownedByViewportZoom";
}

export function getGpuWheelGestureOwnershipArbiter(
  store: GpuFlowViewportStoreApi,
): GpuWheelGestureOwnershipArbiter {
  const existing = wheelGestureOwnershipByViewportStore.get(store);
  if (existing) {
    return existing;
  }
  const arbiter = createGpuWheelGestureOwnershipArbiter();
  wheelGestureOwnershipByViewportStore.set(store, arbiter);
  return arbiter;
}

export function isGpuViewportWheelGestureActive(
  store: GpuFlowViewportStoreApi,
): boolean {
  const state = store.getState();
  return (
    state.panScrolling ||
    state.pointerPanning ||
    state.paneDragging ||
    state.wheelZooming
  );
}

function defaultWheelOwnershipNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
