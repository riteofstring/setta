import type { SectionSize } from "../../document/types";

// Package terms for frozen main's complete direct-on-canvas dispatch. CodeParam and TextParam
// share the `text` kind because the host-selected language already distinguishes their editor
// behavior; TextArea keeps its own kind because its intrinsic geometry differs.
export type MetaControlKind =
  | "button"
  | "color"
  | "date"
  | "dropdown"
  | "dropzone"
  | "password"
  | "rotary"
  | "slider"
  | "switch"
  | "text"
  | "textarea"
  | "time";

export type MetaControlHeightSizeMode = "any" | "auto-only";

const META_CONTROL_KINDS: ReadonlySet<MetaControlKind> = new Set([
  "button",
  "color",
  "date",
  "dropdown",
  "dropzone",
  "password",
  "rotary",
  "slider",
  "switch",
  "text",
  "textarea",
  "time",
]);

export function assertMetaControlKind(kind: unknown): asserts kind is MetaControlKind {
  if (typeof kind !== "string" || !META_CONTROL_KINDS.has(kind as MetaControlKind)) {
    throw new Error(`Unknown meta control kind: ${String(kind)}.`);
  }
}

export type MetaControlMinimumSize = {
  width: number;
  height: number;
};

export const DEFAULT_META_CONTROL_SIZE = {
  width: 200,
  height: 44,
} as const satisfies SectionSize;

export const TEXTAREA_META_CONTROL_SIZE = {
  width: 200,
  height: 98,
} as const satisfies SectionSize;

export const DROPZONE_META_CONTROL_SIZE = {
  width: 240,
  height: 120,
} as const satisfies SectionSize;

const AUTO_HEIGHT_META_CONTROL_SIZE = {
  width: 200,
  height: "auto",
} as const satisfies SectionSize;

const AUTO_HEIGHT_META_CONTROL_KINDS: ReadonlySet<MetaControlKind> = new Set([
  "dropdown",
  "password",
  "slider",
]);

const DEFAULT_META_CONTROL_MINIMUM_SIZE = {
  width: 200,
  height: 32,
} as const satisfies MetaControlMinimumSize;

export function getMetaControlDefaultSize(kind: MetaControlKind): SectionSize {
  assertMetaControlKind(kind);
  if (kind === "textarea") {
    return TEXTAREA_META_CONTROL_SIZE;
  }
  if (kind === "dropzone") {
    return DROPZONE_META_CONTROL_SIZE;
  }
  if (AUTO_HEIGHT_META_CONTROL_KINDS.has(kind)) {
    return AUTO_HEIGHT_META_CONTROL_SIZE;
  }
  return DEFAULT_META_CONTROL_SIZE;
}

// Frozen main's generated policy applies a 200 x 32 base minimum to ordinary meta controls.
// TextArea's 96 px content minimum plus its wrapper border produces the captured 98 px inner
// surface; Dropzone's generated minimum is 240 x 120. The package shell adds one pixel per side.
export function getMetaControlMinimumSize(kind: MetaControlKind): MetaControlMinimumSize {
  assertMetaControlKind(kind);
  if (kind === "textarea") {
    return TEXTAREA_META_CONTROL_SIZE;
  }
  if (kind === "dropzone") {
    return DROPZONE_META_CONTROL_SIZE;
  }
  return DEFAULT_META_CONTROL_MINIMUM_SIZE;
}

// The frozen sizing policy keeps these three compact controls at their intrinsic height while
// still allowing horizontal resizing. Every other meta control is freely resizable in height.
export function getMetaControlHeightSizeMode(kind: MetaControlKind): MetaControlHeightSizeMode {
  assertMetaControlKind(kind);
  return AUTO_HEIGHT_META_CONTROL_KINDS.has(kind) ? "auto-only" : "any";
}
