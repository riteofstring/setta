import type { DesktopPlatform } from "@shared/types";
import {
  ArrowLeft,
  Gauge,
  MonitorPause,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useAppWindowDragHandlers } from "../../app-window-drag";
import { cn } from "../../lib/utils";
import { usePrototypeActivity } from "./prototype-activity";
import { PrototypeMetricsCollector } from "./prototype-metrics";
import {
  findPrototype,
  prototypeCategories,
  prototypes,
  prototypesForCategory,
  type PrototypeID,
} from "./prototype-registry";
import { PrototypeStage } from "./prototype-stage";
import type {
  AgentVisualState,
  NiriGridMode,
  PrototypeGalleryDebugBridge,
  PrototypeMetricsSnapshot,
  PrototypeQuality,
} from "./prototype-types";

import "./prototype-gallery.css";

const agentStates = [
  "idle",
  "listening",
  "thinking",
  "responding",
  "complete",
  "failed",
] as const satisfies readonly AgentVisualState[];

const qualityOptions = ["low", "standard", "high"] as const satisfies readonly PrototypeQuality[];
const gridModeOptions = ["off", "fixed", "spatial"] as const satisfies readonly NiriGridMode[];

export default function PrototypeGalleryPage({
  onBack,
  platform,
}: {
  onBack: () => void;
  platform: DesktopPlatform;
}) {
  const [selectedId, setSelectedId] = useState<PrototypeID>("veil-drift");
  const [paused, setPaused] = useState(false);
  const [quality, setQuality] = useState<PrototypeQuality>("standard");
  const [agentState, setAgentState] = useState<AgentVisualState>("thinking");
  const [advancedEffects, setAdvancedEffects] = useState(true);
  const [gridMode, setGridMode] = useState<NiriGridMode>("spatial");
  const [fixedTimeMs, setFixedTimeMs] = useState<number | null>(null);
  const [showMetrics, setShowMetrics] = useState(false);
  const [metricsReading, setMetricsReading] = useState<{
    collector: PrototypeMetricsCollector;
    snapshot: PrototypeMetricsSnapshot;
  } | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const metricsRef = useRef<{
    collector: PrototypeMetricsCollector;
    key: string;
  } | null>(null);
  const windowDragHandlers = useAppWindowDragHandlers();
  const selectedPrototype = findPrototype(selectedId) ?? prototypes[0];
  const selectedCategory = selectedPrototype.category;
  const activity = usePrototypeActivity(!paused);
  const metricsKey = `${selectedPrototype.id}:${selectedPrototype.renderer.kind}`;
  if (!metricsRef.current || metricsRef.current.key !== metricsKey) {
    metricsRef.current = {
      collector: new PrototypeMetricsCollector(
        selectedPrototype.id,
        selectedPrototype.renderer.kind,
        activity.active,
      ),
      key: metricsKey,
    };
  }
  const metrics = metricsRef.current.collector;

  useLayoutEffect(() => {
    metrics.setActive(activity.active);
  }, [activity.active, metrics]);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  useEffect(() => {
    if (!showMetrics) {
      setMetricsReading(null);
      return;
    }
    const readMetrics = () => {
      setMetricsReading({ collector: metrics, snapshot: metrics.snapshot() });
    };
    readMetrics();
    const interval = window.setInterval(readMetrics, 250);
    return () => window.clearInterval(interval);
  }, [metrics, showMetrics]);

  useEffect(() => {
    if (
      typeof PerformanceObserver === "undefined" ||
      !PerformanceObserver.supportedEntryTypes.includes("longtask")
    ) {
      return;
    }
    const observer = new PerformanceObserver((entries) => {
      const entryCount = entries.getEntries().length;
      for (let index = 0; index < entryCount; index += 1) {
        metrics.recordLongTask();
      }
    });
    observer.observe({ type: "longtask" });
    return () => observer.disconnect();
  }, [metrics]);

  const selectPrototype = useCallback((prototypeId: string): boolean => {
    const prototype = findPrototype(prototypeId);
    if (!prototype) {
      return false;
    }
    setSelectedId(prototype.id);
    return true;
  }, []);

  useEffect(() => {
    const bridge = {
      getMetrics: () => metrics.snapshot(),
      pause: setPaused,
      seek: setFixedTimeMs,
      select: selectPrototype,
      setAdvancedEffects,
      setAgentState,
      setGridMode,
    } satisfies PrototypeGalleryDebugBridge;
    window.__settaPrototypeGalleryDebug = bridge;
    return () => {
      if (window.__settaPrototypeGalleryDebug === bridge) {
        delete window.__settaPrototypeGalleryDebug;
      }
    };
  }, [metrics, selectPrototype]);

  const visiblePrototypes = useMemo(
    () => prototypesForCategory(selectedCategory),
    [selectedCategory],
  );

  return (
    <section
      aria-labelledby="prototype-gallery-title"
      className="prototype-gallery-page bg-background text-foreground"
      data-desktop-platform={platform}
      data-testid="prototype-gallery-page"
    >
      <header
        className="prototype-gallery-header app-drag"
        data-setta-shell-title-bar="true"
        {...windowDragHandlers}
      >
        <div aria-hidden="true" className="prototype-gallery-chrome-shield app-no-drag" />
        <button
          aria-label="Back to Developer settings"
          className="prototype-gallery-back app-no-drag"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          <span>Developer settings</span>
        </button>
        <span className="prototype-gallery-heading">
          <Sparkles aria-hidden="true" className="h-4 w-4 text-primary" />
          <h1 id="prototype-gallery-title" ref={headingRef} tabIndex={-1}>
            Visual prototypes
          </h1>
        </span>
        <span className="prototype-gallery-runtime-state app-no-drag" role="status">
          {activity.reducedMotion ? (
            <>
              <MonitorPause aria-hidden="true" className="h-3.5 w-3.5" />
              Reduced motion
            </>
          ) : activity.active ? (
            <>
              <span aria-hidden="true" className="prototype-gallery-live-dot" />
              Live
            </>
          ) : (
            <>
              <Pause aria-hidden="true" className="h-3.5 w-3.5" />
              Paused
            </>
          )}
        </span>
      </header>

      <main className="prototype-gallery-layout">
        <nav aria-label="Prototype categories" className="prototype-gallery-category-nav">
          {prototypeCategories.map((category) => (
            <button
              aria-pressed={selectedCategory === category.id}
              className="prototype-gallery-category-button"
              data-active={selectedCategory === category.id || undefined}
              key={category.id}
              onClick={() => {
                const first = prototypesForCategory(category.id)[0];
                if (first) {
                  setSelectedId(first.id);
                }
              }}
              type="button"
            >
              <span>{category.label}</span>
              <span>{prototypesForCategory(category.id).length}</span>
            </button>
          ))}
        </nav>

        <nav
          aria-label={`${categoryLabel(selectedCategory)} concepts`}
          className="prototype-gallery-rail"
        >
          <ul>
            {visiblePrototypes.map((prototype) => (
              <li key={prototype.id}>
                <button
                  aria-pressed={selectedId === prototype.id}
                  className="prototype-gallery-card"
                  data-active={selectedId === prototype.id || undefined}
                  onClick={() => setSelectedId(prototype.id)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="prototype-gallery-card-poster"
                    data-poster={prototype.id}
                  />
                  <span className="prototype-gallery-card-copy">
                    <strong>{prototype.name}</strong>
                    <span>{prototype.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className="prototype-gallery-preview" aria-label="Selected prototype">
          <PrototypeStage
            active={activity.active}
            advancedEffects={advancedEffects}
            agentState={agentState}
            fixedTimeMs={fixedTimeMs}
            gridMode={gridMode}
            metrics={metrics}
            prototype={selectedPrototype}
            quality={quality}
            stageRef={activity.stageRef}
          />

          <div className="prototype-gallery-control-bar">
            <button
              className="prototype-gallery-primary-control"
              disabled={activity.reducedMotion}
              onClick={() => setPaused((current) => !current)}
              type="button"
            >
              {paused ? (
                <Play aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <Pause aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              className="prototype-gallery-icon-control"
              onClick={() => {
                setPaused(false);
                setQuality("standard");
                setAdvancedEffects(true);
                setGridMode("spatial");
                setFixedTimeMs(null);
                setAgentState("thinking");
              }}
              title="Reset prototype controls"
              type="button"
            >
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only">Reset prototype controls</span>
            </button>
            <span className="prototype-gallery-cost-label">
              <Gauge aria-hidden="true" className="h-3.5 w-3.5" />
              {costLabel(selectedPrototype.motionCost)}
            </span>
          </div>

          <div className="prototype-gallery-control-grid">
            {selectedPrototype.renderer.kind === "webgl2" ? (
              <SegmentedControl
                label="Quality"
                onChange={setQuality}
                options={qualityOptions}
                value={quality}
              />
            ) : null}
            {selectedPrototype.supportsAgentState ? (
              <>
                <SegmentedControl
                  label="Agent state"
                  onChange={setAgentState}
                  options={agentStates}
                  value={agentState}
                />
                <label className="prototype-gallery-metrics-toggle">
                  <input
                    checked={advancedEffects}
                    onChange={(event) => setAdvancedEffects(event.target.checked)}
                    type="checkbox"
                  />
                  <span>Advanced effects</span>
                </label>
              </>
            ) : null}
            {selectedCategory === "niri-background" ? (
              <SegmentedControl
                label="Grid treatment"
                onChange={setGridMode}
                options={gridModeOptions}
                value={gridMode}
              />
            ) : null}
            <label className="prototype-gallery-metrics-toggle">
              <input
                checked={showMetrics}
                onChange={(event) => setShowMetrics(event.target.checked)}
                type="checkbox"
              />
              <span>Live metrics</span>
            </label>
          </div>

          {showMetrics && metricsReading?.collector === metrics ? (
            <MetricsOutput metrics={metricsReading.snapshot} />
          ) : null}
        </section>
      </main>
    </section>
  );
}

function SegmentedControl<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: readonly T[];
  value: T;
}) {
  return (
    <fieldset className="prototype-gallery-segmented-control">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <button
            aria-pressed={value === option}
            className={cn(value === option && "is-active")}
            key={option}
            onClick={() => onChange(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function MetricsOutput({ metrics }: { metrics: PrototypeMetricsSnapshot }) {
  return (
    <output className="prototype-gallery-metrics" aria-live="off">
      <span>
        <strong>{metrics.runtime}</strong> runtime
      </span>
      <span>
        <strong>{metrics.drawCalls}</strong> draws
      </span>
      <span>
        <strong>{metrics.frameRequests}</strong> RAF callbacks
      </span>
      <span>
        <strong>{Math.round(metrics.p95FrameIntervalMs * 10) / 10} ms</strong> p95 interval
      </span>
      <span>
        <strong>{Math.round(metrics.p95DrawSubmissionMs * 100) / 100} ms</strong> p95 submit
      </span>
      <span>
        <strong>{metrics.longTasks}</strong> active renderer/page long tasks
      </span>
      <span>
        <strong>
          {metrics.backingWidth}×{metrics.backingHeight}
        </strong>{" "}
        buffer
      </span>
      <span>
        <strong>{metrics.effectiveDpr.toFixed(2)}×</strong> DPR
      </span>
    </output>
  );
}

function categoryLabel(category: (typeof prototypeCategories)[number]["id"]): string {
  return prototypeCategories.find((item) => item.id === category)?.label ?? "Prototype";
}

function costLabel(cost: (typeof prototypes)[number]["motionCost"]): string {
  switch (cost) {
    case "compositor-only":
      return "Compositor only";
    case "bounded-webgl":
      return "1 WebGL draw / frame";
    case "redraw-on-change":
      return "Canvas redraw on change";
  }
}
