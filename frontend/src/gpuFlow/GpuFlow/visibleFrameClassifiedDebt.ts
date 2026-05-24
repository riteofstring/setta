type GpuFlowVisibleFrameClassifiedDebtEntry = {
  readonly active: boolean;
  readonly ageFrames: number;
  readonly ageMs: number;
};

export type GpuFlowVisibleFrameClassifiedDebt = {
  readonly continuity: GpuFlowVisibleFrameClassifiedDebtEntry;
  readonly quality: GpuFlowVisibleFrameClassifiedDebtEntry;
  readonly safety: GpuFlowVisibleFrameClassifiedDebtEntry;
};

type GpuFlowVisibleFrameClassifiedDebtTracker = {
  active: boolean;
  ageFrames: number;
  firstActiveAtMs: number | null;
};

export function createGpuFlowClassifiedDebtTrackers(): Record<
  keyof GpuFlowVisibleFrameClassifiedDebt,
  GpuFlowVisibleFrameClassifiedDebtTracker
> {
  return {
    continuity: createGpuFlowClassifiedDebtTracker(),
    quality: createGpuFlowClassifiedDebtTracker(),
    safety: createGpuFlowClassifiedDebtTracker(),
  };
}

export function updateGpuFlowVisibleFrameClassifiedDebt({
  contentDebt,
  criticalContentDebt,
  maintenanceDebt,
  motionDebt,
  timestamp,
  trackers,
}: {
  readonly contentDebt: boolean;
  readonly criticalContentDebt: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
  readonly timestamp: DOMHighResTimeStamp;
  readonly trackers: Record<
    keyof GpuFlowVisibleFrameClassifiedDebt,
    GpuFlowVisibleFrameClassifiedDebtTracker
  >;
}): GpuFlowVisibleFrameClassifiedDebt {
  return Object.freeze({
    continuity: updateGpuFlowVisibleFrameClassifiedDebtEntry({
      active: contentDebt || motionDebt,
      timestamp,
      tracker: trackers.continuity,
    }),
    quality: updateGpuFlowVisibleFrameClassifiedDebtEntry({
      active: maintenanceDebt,
      timestamp,
      tracker: trackers.quality,
    }),
    safety: updateGpuFlowVisibleFrameClassifiedDebtEntry({
      active: criticalContentDebt,
      timestamp,
      tracker: trackers.safety,
    }),
  });
}

function createGpuFlowClassifiedDebtTracker(): GpuFlowVisibleFrameClassifiedDebtTracker {
  return {
    active: false,
    ageFrames: 0,
    firstActiveAtMs: null,
  };
}

function updateGpuFlowVisibleFrameClassifiedDebtEntry({
  active,
  timestamp,
  tracker,
}: {
  readonly active: boolean;
  readonly timestamp: DOMHighResTimeStamp;
  readonly tracker: GpuFlowVisibleFrameClassifiedDebtTracker;
}): GpuFlowVisibleFrameClassifiedDebtEntry {
  if (!active) {
    tracker.active = false;
    tracker.ageFrames = 0;
    tracker.firstActiveAtMs = null;
    return Object.freeze({
      active: false,
      ageFrames: 0,
      ageMs: 0,
    });
  }
  if (!tracker.active) {
    tracker.active = true;
    tracker.ageFrames = 0;
    tracker.firstActiveAtMs = timestamp;
  } else {
    tracker.ageFrames += 1;
  }
  return Object.freeze({
    active: true,
    ageFrames: tracker.ageFrames,
    ageMs: Math.max(0, timestamp - (tracker.firstActiveAtMs ?? timestamp)),
  });
}
