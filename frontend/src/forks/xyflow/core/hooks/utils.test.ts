import { setActiveSectionUIIds } from "state/activeSectionUI";
import { resetProjectStores } from "state/utils";
import { beforeEach, describe, expect, it } from "vitest";
import { getDragItems } from "./utils";

describe("getDragItems", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  it("uses the UI-owned active section ids when grouping a drag selection", () => {
    const nodeInternals = new Map([
      [
        "section-a",
        {
          id: "section-a",
          position: { x: 10, y: 20 },
          width: 100,
          height: 80,
          zIndex: 0,
          tempZIndex: 0,
        },
      ],
      [
        "section-b",
        {
          id: "section-b",
          position: { x: 160, y: 40 },
          width: 120,
          height: 90,
          zIndex: 0,
          tempZIndex: 0,
        },
      ],
    ]);

    // The durable project config is intentionally sanitized to `[]`; drag
    // grouping must still follow the live UI selection store.
    setActiveSectionUIIds(["section-a", "section-b"]);

    const dragItems = getDragItems(
      nodeInternals,
      { x: 200, y: 120 },
      "section-a",
    );

    expect(dragItems.map((item) => item.id)).toEqual([
      "section-a",
      "section-b",
    ]);
  });

  it("still drags only the grabbed node when that node is not in the active set", () => {
    const nodeInternals = new Map([
      [
        "section-a",
        {
          id: "section-a",
          position: { x: 10, y: 20 },
          width: 100,
          height: 80,
          zIndex: 0,
          tempZIndex: 0,
        },
      ],
      [
        "section-b",
        {
          id: "section-b",
          position: { x: 160, y: 40 },
          width: 120,
          height: 90,
          zIndex: 0,
          tempZIndex: 0,
        },
      ],
    ]);

    setActiveSectionUIIds(["section-b"]);

    const dragItems = getDragItems(
      nodeInternals,
      { x: 40, y: 40 },
      "section-a",
    );

    expect(dragItems.map((item) => item.id)).toEqual(["section-a"]);
  });
});
