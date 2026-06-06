import { phaseOneFakePaneCount, phaseOneVisiblePaneCount } from "./benchmark-scene";
import type { NiriMetricsCollector } from "./metrics";
import type { NiriPerformanceReport, Rect } from "./types";

const phaseFourReportKey = "setta:niri:phase-four:reports";
const targetFrameMs = 8.33;

export interface PerformanceReportWriter {
  write(metrics: NiriMetricsCollector, viewport: Rect): NiriPerformanceReport;
}

export class LocalStoragePerformanceReportWriter implements PerformanceReportWriter {
  constructor(private readonly durationMs: number) {}

  write(metrics: NiriMetricsCollector, viewport: Rect): NiriPerformanceReport {
    const report = createPhaseFourPerformanceReport(metrics, viewport, this.durationMs);
    const reports = readReports();
    reports.push(report);
    window.localStorage.setItem(phaseFourReportKey, JSON.stringify(reports));
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
      __settaNiriPhaseFourReports?: readonly NiriPerformanceReport[];
      __settaNiriReadPhaseFourReports?: () => readonly NiriPerformanceReport[];
    };
  target.__settaNiriPhaseFourReports = reports;
  target.__settaNiriReadPhaseFourReports = () => readReports();
}

function createPhaseFourPerformanceReport(
  metrics: NiriMetricsCollector,
  viewport: Rect,
  durationMs: number,
): NiriPerformanceReport {
  const snapshot = metrics.snapshot();
  const passed =
    snapshot.visiblePaneCount === phaseOneVisiblePaneCount &&
    snapshot.p95FrameTime <= targetFrameMs &&
    snapshot.nativeBoundsUpdates <= 1 &&
    snapshot.reactCommitsDuringMovement === 0;

  return {
    benchmark: {
      durationMs,
      expectedVisiblePanes: phaseOneVisiblePaneCount,
      name: "Phase 4 browser-pane scene",
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
      "Phase 4 scene: browser proxy panes use Electron WebContentsView in the desktop shell and DOM fallback in browser inspection.",
      "Performance report is appended in localStorage and exposed on window for probe collection.",
    ],
    result: passed ? "pass" : "fail",
    timestamp: new Date().toISOString(),
  };
}

function readReports(): NiriPerformanceReport[] {
  const raw = window.localStorage.getItem(phaseFourReportKey);
  if (!raw) {
    return [];
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("niri Phase 4 performance reports must be a JSON array");
  }
  return parsed as NiriPerformanceReport[];
}
