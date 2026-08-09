import { describe, expect, it } from "vitest";
import {
  DEFAULT_META_CONTROL_SIZE,
  getMetaControlDefaultSize,
  getMetaControlMinimumSize,
  type MetaControlKind,
} from "./metaControlTypes";

describe("meta control sizing", () => {
  it("freezes the representative Button and Text default and minimum inner geometry", () => {
    for (const kind of ["button", "text"] as const) {
      expect(getMetaControlDefaultSize(kind)).toEqual({ width: 200, height: 44 });
      expect(getMetaControlMinimumSize(kind)).toEqual({ width: 200, height: 32 });
    }
    expect(DEFAULT_META_CONTROL_SIZE).toEqual({ width: 200, height: 44 });
  });

  it("fails specifically for an unknown runtime kind", () => {
    const unknownKind = "mystery" as MetaControlKind;
    expect(() => getMetaControlDefaultSize(unknownKind)).toThrowError(
      "Unknown meta control kind: mystery.",
    );
    expect(() => getMetaControlMinimumSize(unknownKind)).toThrowError(
      "Unknown meta control kind: mystery.",
    );
  });
});
