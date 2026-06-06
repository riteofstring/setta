import { Profiler, useEffect, useMemo, useRef } from "react";

import { generateBenchmarkScene, phaseOneVisiblePaneCount } from "./benchmark-scene";
import { FrameScheduler } from "./frame-scheduler";
import { NiriLikeLayoutEngine } from "./layout-engine";
import { NiriLayoutStore } from "./layout-store";
import { NiriMetricsCollector } from "./metrics";
import {
  installWindowReportHooks,
  LocalStoragePerformanceReportWriter,
} from "./performance-report";
import { PresentationEngine } from "./presentation-engine";
import { DEFAULT_PANE_BUDGET, PaneRuntimePolicy } from "./runtime-policy";
import { SurfaceRegistry } from "./surface-registry";
import type { NiriPane, Rect } from "./types";

export function NiriWorkspaceArea() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const debugRef = useRef<HTMLDivElement | null>(null);
  const hostRefs = useRef<Array<HTMLDivElement | null>>([]);
  const runtime = useMemo(createNiriRuntime, []);
  const initialPanes = runtime.scene.panes.slice(0, phaseOneVisiblePaneCount);

  useEffect(() => {
    const root = rootRef.current;
    const hosts = hostRefs.current.filter((host): host is HTMLDivElement => host !== null);
    if (!root || hosts.length !== phaseOneVisiblePaneCount) {
      throw new Error("niri workspace host pool did not mount");
    }

    runtime.presentation.mount(hosts, debugRef.current);
    installWindowReportHooks();
    const scheduler = new FrameScheduler({
      engine: runtime.engine,
      layoutStore: runtime.store,
      metrics: runtime.metrics,
      presentation: runtime.presentation,
      reportWriter: runtime.reportWriter,
      runtimePolicy: runtime.runtimePolicy,
      viewportProvider: () => viewportRect(root),
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isArrowKey(event.key)) {
        return;
      }
      event.preventDefault();
      runtime.store.moveFocus(arrowDirection(event.key));
    };
    window.addEventListener("keydown", handleKeyDown);
    scheduler.start();
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      scheduler.teardown();
    };
  }, [runtime]);

  return (
    <section
      aria-label="Niri fake-pane workspace prototype"
      className="niri-workspace-area relative h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      data-pane-count={runtime.scene.totalPanes}
      data-testid="niri-workspace-area"
      ref={rootRef}
    >
      <div className="niri-stage" data-testid="niri-presentation-engine">
        <Profiler id="niri-fake-pane-hosts" onRender={() => runtime.metrics.recordReactCommit()}>
          {initialPanes.map((pane, index) => (
            <FakePaneHost
              index={index}
              key={`niri_host_${index}`}
              pane={pane}
              refCallback={(host) => {
                hostRefs.current[index] = host;
              }}
            />
          ))}
        </Profiler>
      </div>
      <div
        aria-live="off"
        className="niri-debug-overlay app-no-drag"
        data-testid="niri-debug-overlay"
        ref={debugRef}
      >
        frame 0.00ms | p95 0.00ms | p99 0.00ms | visible 0 | writes 0 | long 0 | react 0 | runtime
        0/0/0/0
      </div>
    </section>
  );
}

function FakePaneHost({
  index,
  pane,
  refCallback,
}: {
  index: number;
  pane: NiriPane;
  refCallback: (host: HTMLDivElement | null) => void;
}) {
  return (
    <article
      className="niri-pane-host app-no-drag"
      data-focused="false"
      data-moving="false"
      data-pane-id={pane.paneId}
      data-runtime-state="live"
      data-surface-kind={pane.surfaceKind}
      data-testid="niri-fake-pane-host"
      data-tone={pane.tone}
      data-visible="true"
      ref={refCallback}
    >
      <div className="niri-pane-content">
        <div className="niri-pane-header">
          <span className="niri-pane-index" data-niri-pane-index>
            {index + 1}
          </span>
          <div className="min-w-0">
            <h2 data-niri-pane-title>{pane.title}</h2>
            <p data-niri-pane-subtitle>{pane.subtitle}</p>
          </div>
        </div>
        <div className="niri-pane-meter">
          <span>load</span>
          <strong data-niri-pane-heat>{pane.heat}%</strong>
        </div>
        <div className="niri-pane-rows" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </article>
  );
}

function arrowDirection(key: string): "up" | "down" | "left" | "right" {
  switch (key) {
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    default:
      throw new Error(`unsupported niri focus key: ${key}`);
  }
}

function createNiriRuntime() {
  const scene = generateBenchmarkScene();
  const engine = new NiriLikeLayoutEngine(scene);
  const store = new NiriLayoutStore(engine, scene);
  const metrics = new NiriMetricsCollector();
  const surfaceRegistry = new SurfaceRegistry(scene.panes);
  return {
    engine,
    metrics,
    presentation: new PresentationEngine(scene.panes, metrics, surfaceRegistry),
    reportWriter: new LocalStoragePerformanceReportWriter(5000),
    runtimePolicy: new PaneRuntimePolicy(DEFAULT_PANE_BUDGET),
    scene,
    store,
  };
}

function isArrowKey(key: string): key is "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp" {
  return key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp";
}

function viewportRect(element: HTMLElement): Rect {
  const rect = element.getBoundingClientRect();
  return {
    height: rect.height,
    width: rect.width,
    x: 0,
    y: 0,
  };
}
