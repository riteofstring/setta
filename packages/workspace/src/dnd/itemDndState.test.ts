import { describe, expect, it } from "vitest";
import {
  getItemDndId,
  getItemIdFromDndId,
  getTempItemDndId,
  isTempItem,
} from "./itemDndState";

describe("itemDndState id helpers", () => {
  it("creates list-key scoped item dnd ids", () => {
    // Freezes the reference's canonical dnd id encoding for item + list key.
    expect(getItemDndId("item-1", "pinned")).toBe(
      "item-1::settaParamList::pinned",
    );
  });

  it("extracts item ids from scoped and temp ids", () => {
    // Validates reverse decoding strips list key and temp suffixes.
    const scoped = getItemDndId("item-1", "unpinned");
    const temp = getTempItemDndId(scoped);

    expect(getItemIdFromDndId(scoped)).toBe("item-1");
    expect(getItemIdFromDndId(temp)).toBe("item-1");
    expect(getItemIdFromDndId("plain-item-id")).toBe("plain-item-id");
  });

  it("identifies temp ids by suffix", () => {
    // Validates temp-id marker detection used by placeholder logic.
    const scoped = getItemDndId("item-2", "pinned");
    const temp = getTempItemDndId(scoped);

    expect(isTempItem(scoped)).toBe(false);
    expect(isTempItem(temp)).toBe(true);
  });
});
