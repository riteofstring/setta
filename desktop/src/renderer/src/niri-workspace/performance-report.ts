import { phaseOneFakePaneCount, phaseOneVisiblePaneCount } from "./benchmark-scene";
import type { NiriMetricsCollector } from "./metrics";
import type { NiriPerformanceReport, Rect } from "./types";

const phaseSixReportKey = "setta:niri:phase-six:reports";
const targetFrameMs = 8.33;

export interface PerformanceReportWriter {
  write(metrics: NiriMetricsCollector, viewport: Rect): NiriPerformanceReport;
}

export class LocalStoragePerformanceReportWriter implements PerformanceReportWriter {
  constructor(private readonly durationMs: number) {}

  write(metrics: NiriMetricsCollector, viewport: Rect): NiriPerformanceReport {
    const report = createPhaseSixPerformanceReport(metrics, viewport, this.durationMs);
    const reports = readReports();
    reports.push(report);
    window.localStorage.setItem(phaseSixReportKey, JSON.stringify(reports));
    window.dispatchEvent(new CustomEvent("setta:niri-performance-report", { detail: report }));
    installWindowReportHooks(reports);
    return report;
  }
}

export function installWindowReportHooks(
  reports: readonly NiriPerformanceReport[] = readReports(),
) {
  const target = window as Window &
    typeof globalThis & {
      __settaNiriPhaseSixReports?: readonly NiriPerformanceReport[];
      __settaNiriReadPhaseSixReports?: () => readonly NiriPerformanceReport[];
    };
  target.__settaNiriPhaseSixReports = reports;
  target.__settaNiriReadPhaseSixReports = () => readReports();
}

function createPhaseSixPerformanceReport(
  metrics: NiriMetricsCollector,
  viewport: Rect,
  durationMs: number,
): NiriPerformanceReport {
  const snapshot = metrics.snapshot();
  const passed = phaseSixReportPassed(snapshot);

  return {
    benchmark: {
      durationMs,
      expectedVisiblePanes: phaseOneVisiblePaneCount,
      name: "Phase 6 terminal and git graph scene",
      targetFrameMs,
      totalPanes: phaseOneFakePaneCount,
    },
    environment: {
      devicePixelRatio: window.devicePixelRatio,
      rendererMode: import.meta.env.DEV ? "development" : "production",
      userAgent: window.navigator.userAgent,
      viewport,
    },
    metrics: snapshot,
    notes: [
      "Phase 6 scene keeps Phase 4 browser native-view bounds batching and Phase 5 canvas lifecycle boundaries intact.",
      "Terminal surfaces use separate session buffers, bounded output draining, dirty-row writes, and scrollback virtualization.",
      "Git graph surfaces request progressive layout batches from a browser Worker and choose DOM/SVG/canvas rendering by scale.",
      "Performance report is appended in localStorage and exposed on window for probe collection.",
    ],
    result: passed ? "pass" : "fail",
    timestamp: new Date().toISOString(),
  };
}

function phaseSixReportPassed(snapshot: NiriPerformanceReport["metrics"]): boolean {
  return (
    snapshot.visiblePaneCount === phaseOneVisiblePaneCount &&
    snapshot.p95FrameTime <= targetFrameMs &&
    snapshot.nativeBoundsUpdates <= 1 &&
    snapshot.reactCommitsDuringMovement === 0 &&
    phaseSixTerminalMetricsReady(snapshot) &&
    phaseSixGitGraphMetricsReady(snapshot)
  );
}

function phaseSixGitGraphMetricsReady(snapshot: NiriPerformanceReport["metrics"]): boolean {
  return (
    snapshot.gitGraphRenderedNodes > 0 &&
    snapshot.gitGraphWorkerBatches > 0 &&
    snapshot.gitGraphRenderer !== null
  );
}

function phaseSixTerminalMetricsReady(snapshot: NiriPerformanceReport["metrics"]): boolean {
  return snapshot.terminalDirtyRows > 0;
}

function readReports(): NiriPerformanceReport[] {
  const raw = window.localStorage.getItem(phaseSixReportKey);
  if (!raw) {
    return [];
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("niri Phase 6 performance reports must be a JSON array");
  }
  return parsed as NiriPerformanceReport[];
}
