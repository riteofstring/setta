import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { PrototypeMetricsCollector } from "../prototype-metrics";
import type { AgentShaderID, AgentVisualState, PrototypeQuality } from "../prototype-types";
import type {
  AgentWebGLRuntime,
  AgentWebGLRuntimeStatus,
  AgentWebGLRuntimeUpdate,
} from "./agent-webgl-runtime";

export interface AgentFormsPrototypeProps {
  active: boolean;
  advancedEffects: boolean;
  fixedTimeMs: number | null;
  metrics: PrototypeMetricsCollector;
  quality: PrototypeQuality;
  shader: AgentShaderID;
  state: AgentVisualState;
}

type AgentFormsStatus = AgentWebGLRuntimeStatus | "loading";

const stageStyle = {
  height: "100%",
  margin: 0,
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
  position: "relative",
  width: "100%",
} satisfies CSSProperties;

const canvasStyle = {
  display: "block",
  height: "100%",
  width: "100%",
} satisfies CSSProperties;

const statusStyle = {
  alignItems: "center",
  background: "color-mix(in oklch, var(--workspace-surface) 82%, transparent)",
  color: "var(--muted-foreground)",
  display: "flex",
  fontSize: "0.75rem",
  inset: 0,
  justifyContent: "center",
  letterSpacing: "0.01em",
  padding: "1rem",
  position: "absolute",
  textAlign: "center",
} satisfies CSSProperties;

export function AgentFormsPrototype({
  active,
  advancedEffects,
  fixedTimeMs,
  metrics,
  quality,
  shader,
  state,
}: AgentFormsPrototypeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<AgentWebGLRuntime | null>(null);
  const latestUpdateRef = useRef<AgentWebGLRuntimeUpdate>({
    active,
    advancedEffects,
    fixedTimeMs,
    quality,
    shader,
    state,
  });
  const [status, setStatus] = useState<AgentFormsStatus>("loading");

  latestUpdateRef.current = { active, advancedEffects, fixedTimeMs, quality, shader, state };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let cancelled = false;
    setStatus("loading");
    void import("./agent-webgl-runtime")
      .then(({ AgentWebGLRuntime: Runtime }) => {
        if (cancelled) {
          return;
        }
        const update = latestUpdateRef.current;
        const runtime = new Runtime({
          ...update,
          canvas,
          metrics,
          onStatusChange: (nextStatus) => {
            if (!cancelled) {
              setStatus(nextStatus);
            }
          },
        });
        runtimeRef.current = runtime;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus("unavailable");
          console.error("Agent WebGL prototype module failed to load.", error);
        }
      });

    return () => {
      cancelled = true;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, [metrics]);

  useEffect(() => {
    runtimeRef.current?.update({
      active,
      advancedEffects,
      fixedTimeMs,
      quality,
      shader,
      state,
    });
  }, [active, advancedEffects, fixedTimeMs, quality, shader, state]);

  return (
    <div
      className="prototype-agent-form"
      data-active={active ? "true" : "false"}
      data-agent-form-state={state}
      data-agent-shader={shader}
      data-webgl-status={status}
      style={stageStyle}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="prototype-agent-form__canvas"
        style={canvasStyle}
      />
      {status === "loading" ? (
        <div
          aria-live="polite"
          className="prototype-agent-form__status"
          role="status"
          style={statusStyle}
        >
          Preparing procedural renderer…
        </div>
      ) : null}
      {status === "unavailable" ? (
        <div className="prototype-agent-form__status" role="status" style={statusStyle}>
          WebGL2 is unavailable for this prototype.
        </div>
      ) : null}
      {status === "context-lost" ? (
        <div
          aria-live="polite"
          className="prototype-agent-form__status"
          role="status"
          style={statusStyle}
        >
          The graphics context was interrupted. Restoring the prototype…
        </div>
      ) : null}
    </div>
  );
}
