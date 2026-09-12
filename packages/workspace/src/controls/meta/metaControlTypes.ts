import type { SectionSize } from "../../document/types";

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

export function assertMetaControlKind(
  kind: unknown,
): asserts kind is MetaControlKind {
  if (
    typeof kind !== "string" ||
    !META_CONTROL_KINDS.has(kind as MetaControlKind)
  ) {
    throw new Error(`Unknown meta control kind: ${String(kind)}.`);
  }
}

type MetaControlMinimumSize = {
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

export function getMetaControlMinimumSize(
  kind: MetaControlKind,
): MetaControlMinimumSize {
  assertMetaControlKind(kind);
  if (kind === "textarea") {
    return TEXTAREA_META_CONTROL_SIZE;
  }
  if (kind === "dropzone") {
    return DROPZONE_META_CONTROL_SIZE;
  }
  return DEFAULT_META_CONTROL_MINIMUM_SIZE;
}

export function getMetaControlHeightSizeMode(
  kind: MetaControlKind,
): MetaControlHeightSizeMode {
  assertMetaControlKind(kind);
  return AUTO_HEIGHT_META_CONTROL_KINDS.has(kind) ? "auto-only" : "any";
}
