import { getDndSectionId } from "forks/dnd-kit/dndState";
import { describe, expect, it } from "vitest";
import { buildSortableSectionBodyView } from "./sortableSectionBodyView";

describe("buildSortableSectionBodyView", () => {
  it("renders the temp placeholder while a temp section is still applying its sortable transform", () => {
    expect(
      buildSortableSectionBodyView({
        sectionId: getDndSectionId("section-1"),
        applyTransform: true,
        listeners: {},
      }),
    ).toEqual({
      kind: "temp",
    });
  });

  it("suppresses the temp placeholder once the initial temp transform is no longer applied", () => {
    expect(
      buildSortableSectionBodyView({
        sectionId: getDndSectionId("section-1"),
        applyTransform: false,
        listeners: {},
      }),
    ).toEqual({
      kind: "none",
    });
  });

  it("routes regular sections into the SectionContainer boundary with their drag listeners", () => {
    const listeners = { onPointerDown: "listener" };

    expect(
      buildSortableSectionBodyView({
        sectionId: "section-1",
        applyTransform: false,
        listeners,
      }),
    ).toEqual({
      kind: "section",
      props: {
        sectionId: "section-1",
        dragListeners: listeners,
      },
    });
  });
});
