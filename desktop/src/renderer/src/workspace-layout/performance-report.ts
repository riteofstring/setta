import { phaseOneFakePaneCount, phaseOneVisiblePaneCount } from "./benchmark-scene";
import type { WorkspaceMetricsCollector } from "./metrics";
import type { WorkspacePerformanceReport, Rect } from "./types";

const phaseSixReportKey = "setta:workspace:phase-six:reports";
const phaseSixFiveResizeReportKey = "setta:workspace:phase-six-five:resize-reports";
const targetFrameMs = 8.33;

export interface PerformanceReportWriter {
  write(metrics: WorkspaceMetricsCollector, viewport: Rect): WorkspacePerformanceReport;
}

export class LocalStoragePerformanceReportWriter implements PerformanceReportWriter {
  constructor(private readonly durationMs: number) {}

  write(metrics: WorkspaceMetricsCollector, viewport: Rect): WorkspacePerformanceReport {
    const report = createPhaseSixPerformanceReport(metrics, viewport, this.durationMs);
    const reports = readReports();
    reports.push(report);
    window.localStorage.setItem(phaseSixReportKey, JSON.stringify(reports));
    window.dispatchEvent(new CustomEvent("setta:workspace-performance-report", { detail: report }));
    installWindowReportHooks(reports);
    return report;
  }
}

export class LocalStorageResizePerformanceReportWriter implements PerformanceReportWriter {
  constructor(private readonly durationMs: number) {}

  write(metrics: WorkspaceMetricsCollector, viewport: Rect): WorkspacePerformanceReport {
    const report = createPhaseSixFiveResizePerformanceReport(metrics, viewport, this.durationMs);
    const reports = readResizeReports();
    reports.push(report);
    window.localStorage.setItem(phaseSixFiveResizeReportKey, JSON.stringify(reports));
    window.dispatchEvent(
      new CustomEvent("setta:workspace-resize-performance-report", { detail: report }),
    );
    return report;
  }
}

export function installWindowReportHooks(
  reports: readonly WorkspacePerformanceReport[] = readReports(),
) {
  const target = window as Window &
    typeof globalThis & {
      __settaWorkspacePhaseSixReports?: readonly WorkspacePerformanceReport[];
      __settaWorkspaceReadPhaseSixReports?: () => readonly WorkspacePerformanceReport[];
    };
  target.__settaWorkspacePhaseSixReports = reports;
  target.__settaWorkspaceReadPhaseSixReports = () => readReports();
}

export function installWindowResizeReportHooks({
  metrics,
  viewportProvider,
  writer,
}: {
  metrics: WorkspaceMetricsCollector;
  viewportProvider: () => Rect;
  writer: PerformanceReportWriter;
}): () => void {
  const target = window as Window &
    typeof globalThis & {
      __settaWorkspacePhaseSixFiveResizeReports?: readonly WorkspacePerformanceReport[];
      __settaWorkspaceReadPhaseSixFiveResizeReports?: () => readonly WorkspacePerformanceReport[];
      __settaWorkspaceResetResizeMetrics?: () => void;
      __settaWorkspaceWritePhaseSixFiveResizeReport?: () => WorkspacePerformanceReport;
    };
  const refreshReports = () => {
    target.__settaWorkspacePhaseSixFiveResizeReports = readResizeReports();
  };
  refreshReports();
  target.__settaWorkspaceReadPhaseSixFiveResizeReports = () => readResizeReports();
  target.__settaWorkspaceResetResizeMetrics = () => metrics.resetResizeMetrics();
  target.__settaWorkspaceWritePhaseSixFiveResizeReport = () => {
    const report = writer.write(metrics, viewportProvider());
    refreshReports();
    return report;
  };
  return () => {
    delete target.__settaWorkspacePhaseSixFiveResizeReports;
    delete target.__settaWorkspaceReadPhaseSixFiveResizeReports;
    delete target.__settaWorkspaceResetResizeMetrics;
    delete target.__settaWorkspaceWritePhaseSixFiveResizeReport;
  };
}

function createPhaseSixPerformanceReport(
  metrics: WorkspaceMetricsCollector,
  viewport: Rect,
  durationMs: number,
): WorkspacePerformanceReport {
  const snapshot = metrics.snapshot();
  const passed = phaseSixReportPassed(snapshot);

  return {
    benchmark: {
      durationMs,
      expectedVisiblePanes: phaseOneVisiblePaneCount,
      name: "Workspace DOM and browser scene",
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
      "The scene exercises browser native-view bounds batching with light and heavy DOM panes.",
      "Heavy DOM panes exercise runtime budgeting, frozen visuals, and snapshot lifecycle boundaries.",
      "Performance report is appended in localStorage and exposed on window for probe collection.",
    ],
    result: passed ? "pass" : "fail",
    timestamp: new Date().toISOString(),
  };
}

function createPhaseSixFiveResizePerformanceReport(
  metrics: WorkspaceMetricsCollector,
  viewport: Rect,
  durationMs: number,
): WorkspacePerformanceReport {
  const snapshot = metrics.snapshot();
  const passed = phaseSixFiveResizeReportPassed(snapshot);

  return {
    benchmark: {
      durationMs,
      expectedVisiblePanes: phaseOneVisiblePaneCount,
      name: "Phase 6.5 resize hardening scene",
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
      "The resize report covers active window resize with mixed light DOM, heavy DOM, and browser panes.",
      "Active resize keeps shell placement in the presentation engine while browser panes use DOM proxies instead of lagging native views.",
      "Heavy DOM surface viewport work is deferred during active resize.",
      "The settled frame commits exact final dimensions to adapters and native browser bounds in one batched update path.",
    ],
    result: passed ? "pass" : "fail",
    timestamp: new Date().toISOString(),
  };
}

function phaseSixReportPassed(snapshot: WorkspacePerformanceReport["metrics"]): boolean {
  return (
    snapshot.visiblePaneCount === phaseOneVisiblePaneCount &&
    snapshot.p95FrameTime <= targetFrameMs &&
    snapshot.nativeBoundsUpdates <= 1 &&
    snapshot.reactCommitsDuringMovement === 0
  );
}

function phaseSixFiveResizeReportPassed(snapshot: WorkspacePerformanceReport["metrics"]): boolean {
  return (
    snapshot.visiblePaneCount === phaseOneVisiblePaneCount &&
    snapshot.resize.frameCount > 0 &&
    snapshot.resize.settledFrameCount > 0 &&
    snapshot.resize.finalViewportCommits > 0 &&
    snapshot.resize.p95FrameTime <= targetFrameMs &&
    snapshot.resize.nativeBoundsUpdates <= snapshot.resize.frameCount &&
    snapshot.resize.deferredHeavyViewportWrites > 0 &&
    snapshot.reactCommitsDuringResize === 0
  );
}

function readReports(): WorkspacePerformanceReport[] {
  const raw = window.localStorage.getItem(phaseSixReportKey);
  if (!raw) {
    return [];
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("workspace Phase 6 performance reports must be a JSON array");
  }
  return parsed as WorkspacePerformanceReport[];
}

function readResizeReports(): WorkspacePerformanceReport[] {
  const raw = window.localStorage.getItem(phaseSixFiveResizeReportKey);
  if (!raw) {
    return [];
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("workspace Phase 6.5 resize performance reports must be a JSON array");
  }
  return parsed as WorkspacePerformanceReport[];
}
