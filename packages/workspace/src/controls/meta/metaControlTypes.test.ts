import { describe, expect, it } from "vitest";
import {
  assertMetaControlKind,
  DEFAULT_META_CONTROL_SIZE,
  DROPZONE_META_CONTROL_SIZE,
  getMetaControlDefaultSize,
  getMetaControlHeightSizeMode,
  getMetaControlMinimumSize,
  TEXTAREA_META_CONTROL_SIZE,
  type MetaControlKind,
} from "./metaControlTypes";

describe("meta control sizing", () => {
  it("freezes the common default and minimum inner geometry", () => {
    for (const kind of ["button", "color", "date", "rotary", "switch", "text", "time"] as const) {
      expect(getMetaControlDefaultSize(kind)).toEqual({ width: 200, height: 44 });
      expect(getMetaControlMinimumSize(kind)).toEqual({ width: 200, height: 32 });
    }
    expect(DEFAULT_META_CONTROL_SIZE).toEqual({ width: 200, height: 44 });
  });

  it("keeps compact auto-height controls intrinsic and freezes special large surfaces", () => {
    for (const kind of ["dropdown", "password", "slider"] as const) {
      expect(getMetaControlDefaultSize(kind)).toEqual({ width: 200, height: "auto" });
      expect(getMetaControlMinimumSize(kind)).toEqual({ width: 200, height: 32 });
      expect(getMetaControlHeightSizeMode(kind)).toBe("auto-only");
    }
    expect(getMetaControlDefaultSize("textarea")).toEqual({ width: 200, height: 98 });
    expect(getMetaControlMinimumSize("textarea")).toEqual({ width: 200, height: 98 });
    expect(TEXTAREA_META_CONTROL_SIZE).toEqual({ width: 200, height: 98 });
    expect(getMetaControlDefaultSize("dropzone")).toEqual({ width: 240, height: 120 });
    expect(getMetaControlMinimumSize("dropzone")).toEqual({ width: 240, height: 120 });
    expect(DROPZONE_META_CONTROL_SIZE).toEqual({ width: 240, height: 120 });
  });

  it("keeps every non-compact control freely resizable in height", () => {
    for (const kind of [
      "button",
      "color",
      "date",
      "dropzone",
      "rotary",
      "switch",
      "text",
      "textarea",
      "time",
    ] as const) {
      expect(getMetaControlHeightSizeMode(kind)).toBe("any");
    }
  });

  it("recognizes exactly the complete frozen-main kind set", () => {
    const kinds: Array<MetaControlKind> = [
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
    ];
    for (const kind of kinds) {
      expect(() => assertMetaControlKind(kind)).not.toThrow();
    }
    expect(() => assertMetaControlKind("mystery")).toThrowError(
      "Unknown meta control kind: mystery.",
    );
  });

  it("fails specifically for an unknown runtime kind", () => {
    const unknownKind = "mystery" as MetaControlKind;
    expect(() => getMetaControlDefaultSize(unknownKind)).toThrowError(
      "Unknown meta control kind: mystery.",
    );
    expect(() => getMetaControlMinimumSize(unknownKind)).toThrowError(
      "Unknown meta control kind: mystery.",
    );
    expect(() => getMetaControlHeightSizeMode(unknownKind)).toThrowError(
      "Unknown meta control kind: mystery.",
    );
  });
});
