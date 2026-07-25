import type { RefObject } from "react";

import { AgentFormsPrototype } from "./prototypes/agent-forms";
import { NiriBackgroundPrototype } from "./prototypes/niri-backgrounds";
import { ThinkingBackdropPrototype } from "./prototypes/thinking-backdrops";
import type { PrototypeMetricsCollector } from "./prototype-metrics";
import type {
  AgentVisualState,
  NiriGridMode,
  PrototypeDefinition,
  PrototypeQuality,
} from "./prototype-types";

interface PrototypeStageProps {
  active: boolean;
  advancedEffects: boolean;
  agentState: AgentVisualState;
  fixedTimeMs: number | null;
  gridMode: NiriGridMode;
  metrics: PrototypeMetricsCollector;
  prototype: PrototypeDefinition;
  quality: PrototypeQuality;
  stageRef: RefObject<HTMLElement | null>;
}

export function PrototypeStage({
  active,
  advancedEffects,
  agentState,
  fixedTimeMs,
  gridMode,
  metrics,
  prototype,
  quality,
  stageRef,
}: PrototypeStageProps) {
  return (
    <figure
      aria-describedby="prototype-stage-description"
      aria-labelledby="prototype-stage-title"
      className="prototype-gallery-stage"
      data-prototype-category={prototype.category}
      data-prototype-id={prototype.id}
      ref={stageRef}
    >
      <figcaption className="prototype-gallery-stage-caption">
        <span id="prototype-stage-title">{prototype.name}</span>
        <span id="prototype-stage-description">{prototype.accessibilityDescription}</span>
      </figcaption>
      <div className="prototype-gallery-stage-viewport">
        {renderPrototype({
          active,
          advancedEffects,
          agentState,
          fixedTimeMs,
          gridMode,
          metrics,
          prototype,
          quality,
        })}
      </div>
    </figure>
  );
}

function renderPrototype({
  active,
  advancedEffects,
  agentState,
  fixedTimeMs,
  gridMode,
  metrics,
  prototype,
  quality,
}: Omit<PrototypeStageProps, "stageRef">) {
  switch (prototype.renderer.kind) {
    case "css":
      return (
        <NiriBackgroundPrototype
          active={active}
          gridMode={gridMode}
          variant={prototype.renderer.variant}
        />
      );
    case "canvas2d":
      return (
        <ThinkingBackdropPrototype metrics={metrics} variant={prototype.renderer.variant} />
      );
    case "webgl2":
      return (
        <AgentFormsPrototype
          active={active}
          advancedEffects={advancedEffects}
          fixedTimeMs={fixedTimeMs}
          metrics={metrics}
          quality={quality}
          shader={prototype.renderer.shader}
          state={agentState}
        />
      );
    default:
      return assertNever(prototype.renderer);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported prototype renderer: ${JSON.stringify(value)}`);
}
