export const SETTINGS_GRAPH_MOTION_PERF_LONG_TASK_PHASES = [
  "captureWarmup",
  "panForward",
  "panReturn",
  "zoomIn",
  "zoomOut",
  "postSequenceSettle",
  "unknown",
] as const;

export type SettingsGraphMotionPerfLongTaskPhase =
  (typeof SETTINGS_GRAPH_MOTION_PERF_LONG_TASK_PHASES)[number];

export type SettingsGraphMotionPerfLongTaskRecord = {
  durationMs: number;
  phase: SettingsGraphMotionPerfLongTaskPhase;
};

export type SettingsGraphMotionPerfLongTaskPhaseSummary = {
  count: number;
  maxDurationMs: number;
  totalDurationMs: number;
};

export type SettingsGraphMotionPerfLongTaskBreakdown = Record<
  SettingsGraphMotionPerfLongTaskPhase,
  SettingsGraphMotionPerfLongTaskPhaseSummary
>;

export function createEmptySettingsGraphMotionPerfLongTaskBreakdown(): SettingsGraphMotionPerfLongTaskBreakdown {
  return Object.fromEntries(
    SETTINGS_GRAPH_MOTION_PERF_LONG_TASK_PHASES.map((phase) => [
      phase,
      {
        count: 0,
        maxDurationMs: 0,
        totalDurationMs: 0,
      },
    ]),
  ) as SettingsGraphMotionPerfLongTaskBreakdown;
}

export function summarizeSettingsGraphMotionPerfLongTaskBreakdown(
  records: Array<SettingsGraphMotionPerfLongTaskRecord>,
): SettingsGraphMotionPerfLongTaskBreakdown {
  const breakdown = createEmptySettingsGraphMotionPerfLongTaskBreakdown();

  for (const record of records) {
    const currentEntry = breakdown[record.phase];
    breakdown[record.phase] = {
      count: currentEntry.count + 1,
      maxDurationMs: Math.max(currentEntry.maxDurationMs, record.durationMs),
      totalDurationMs: currentEntry.totalDurationMs + record.durationMs,
    };
  }

  return breakdown;
}
