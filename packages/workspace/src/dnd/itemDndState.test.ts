import { describe, expect, it } from "vitest";
import {
  getItemDndId,
  getItemIdFromDndId,
  getTempItemDndId,
  isTempItem,
} from "./itemDndState";

describe("itemDndState id helpers", () => {
  it("creates list-key scoped item dnd ids", () => {
    expect(getItemDndId("item-1", "pinned")).toBe(
      "item-1::settaParamList::pinned",
    );
  });

  it("extracts item ids from scoped and temp ids", () => {
    const scoped = getItemDndId("item-1", "unpinned");
    const temp = getTempItemDndId(scoped);

    expect(getItemIdFromDndId(scoped)).toBe("item-1");
    expect(getItemIdFromDndId(temp)).toBe("item-1");
    expect(getItemIdFromDndId("plain-item-id")).toBe("plain-item-id");
  });

  it("identifies temp ids by suffix", () => {
    const scoped = getItemDndId("item-2", "pinned");
    const temp = getTempItemDndId(scoped);

    expect(isTempItem(scoped)).toBe(false);
    expect(isTempItem(temp)).toBe(true);
  });
});
