import type { SectionSize } from "../../document/types";

// The first meta-controls batch intentionally starts with the two representative controls
// required by the plan. The union expands only when each remaining direct-on-canvas control
// lands with its owning adapter batch.
export type MetaControlKind = "button" | "text";

export type MetaControlMinimumSize = {
  width: number;
  height: number;
};

export const DEFAULT_META_CONTROL_SIZE = {
  width: 200,
  height: 44,
} as const satisfies SectionSize;

const DEFAULT_META_CONTROL_MINIMUM_SIZE = {
  width: 200,
  height: 32,
} as const satisfies MetaControlMinimumSize;

export function getMetaControlDefaultSize(kind: MetaControlKind): SectionSize {
  if (kind === "button" || kind === "text") {
    return DEFAULT_META_CONTROL_SIZE;
  }
  throw new Error(`Unknown meta control kind: ${String(kind)}.`);
}

// Frozen main applies the same 200 x 32 inner minimum to ButtonParam and TextParam meta
// controls. The one-pixel package shell border on each side makes the authored 200 x 44
// default render at the captured 202 x 46 outer geometry.
export function getMetaControlMinimumSize(kind: MetaControlKind): MetaControlMinimumSize {
  switch (kind) {
    case "button":
    case "text":
      return DEFAULT_META_CONTROL_MINIMUM_SIZE;
    default:
      throw new Error(`Unknown meta control kind: ${String(kind)}.`);
  }
}
