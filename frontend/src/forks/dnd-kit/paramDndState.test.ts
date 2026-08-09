import { describe, expect, it } from "vitest";
import {
  getParamDndItemId,
  getParamIdFromDndItemId,
  getTempParamDndId,
  isTempParam,
} from "./paramDndState";

describe("paramDndState id helpers", () => {
  it("creates list-key scoped param dnd ids", () => {
    // Validates the canonical dnd id encoding for param + list key.
    expect(getParamDndItemId("param-1", "pinned")).toBe(
      "param-1::settaParamList::pinned",
    );
  });

  it("extracts param ids from scoped and temp ids", () => {
    // Validates reverse decoding strips list key and temp suffixes.
    const scoped = getParamDndItemId("param-1", "unpinned");
    const temp = getTempParamDndId(scoped);

    expect(getParamIdFromDndItemId(scoped)).toBe("param-1");
    expect(getParamIdFromDndItemId(temp)).toBe("param-1");
    expect(getParamIdFromDndItemId("plain-param-id")).toBe("plain-param-id");
  });

  it("identifies temp ids by suffix", () => {
    // Validates temp-id marker detection used by placeholder logic.
    const scoped = getParamDndItemId("param-2", "pinned");
    const temp = getTempParamDndId(scoped);

    expect(isTempParam(scoped)).toBe(false);
    expect(isTempParam(temp)).toBe(true);
  });
});
