import { phaseOneFakePaneCount, phaseOneVisiblePaneCount } from "./benchmark-scene";
import type { NiriMetricsCollector } from "./metrics";
import type { NiriPerformanceReport, Rect } from "./types";

const phaseOneReportKey = "setta:niri:phase-one:reports";
const targetFrameMs = 8.33;

export interface PerformanceReportWriter {
  write(metrics: NiriMetricsCollector, viewport: Rect): NiriPerformanceReport;
}

export class LocalStoragePerformanceReportWriter implements PerformanceReportWriter {
  constructor(private readonly durationMs: number) {}

  write(metrics: NiriMetricsCollector, viewport: Rect): NiriPerformanceReport {
    const report = createPhaseOnePerformanceReport(metrics, viewport, this.durationMs);
    const reports = readReports();
    reports.push(report);
    window.localStorage.setItem(phaseOneReportKey, JSON.stringify(reports));
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
      __settaNiriPhaseOneReports?: readonly NiriPerformanceReport[];
      __settaNiriReadPhaseOneReports?: () => readonly NiriPerformanceReport[];
    };
  target.__settaNiriPhaseOneReports = reports;
  target.__settaNiriReadPhaseOneReports = () => readReports();
}

function createPhaseOnePerformanceReport(
  metrics: NiriMetricsCollector,
  viewport: Rect,
  durationMs: number,
): NiriPerformanceReport {
  const snapshot = metrics.snapshot();
  const passed =
    snapshot.visiblePaneCount === phaseOneVisiblePaneCount &&
    snapshot.p95FrameTime <= targetFrameMs &&
    snapshot.reactCommitsDuringMovement === 0;

  return {
    benchmark: {
      durationMs,
      expectedVisiblePanes: phaseOneVisiblePaneCount,
      name: "Phase 1 fake-pane shell",
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
      "Fake-pane Phase 1 shell only: no real chat, settings, browser, terminal, or Pixi surfaces.",
      "Performance report is appended in localStorage and exposed on window for probe collection.",
    ],
    result: passed ? "pass" : "fail",
    timestamp: new Date().toISOString(),
  };
}

function readReports(): NiriPerformanceReport[] {
  const raw = window.localStorage.getItem(phaseOneReportKey);
  if (!raw) {
    return [];
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("niri Phase 1 performance reports must be a JSON array");
  }
  return parsed as NiriPerformanceReport[];
}
