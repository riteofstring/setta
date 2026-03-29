import { describe, expect, it } from "vitest";
import { buildSectionContainerNestedSectionsView } from "./sectionContainerNestedSectionsView";

describe("buildSectionContainerNestedSectionsView", () => {
  it("returns the nested-sections props directly for standard section containers", () => {
    expect(
      buildSectionContainerNestedSectionsView({
        sectionId: "section-1",
        isGroup: false,
        layoutVariant: "default",
        isJoinedCodeTerminalGroup: false,
      }),
    ).toEqual({
      kind: "direct",
      props: {
        sectionId: "section-1",
        isGroup: false,
        layoutVariant: "default",
      },
    });
  });

  it("adds the joined code-terminal wrapper offset when the nested sections sit under the joined shell", () => {
    expect(
      buildSectionContainerNestedSectionsView({
        sectionId: "section-2",
        isGroup: true,
        layoutVariant: "tight",
        isJoinedCodeTerminalGroup: true,
      }),
    ).toEqual({
      kind: "wrapped",
      props: {
        sectionId: "section-2",
        isGroup: true,
        layoutVariant: "tight",
      },
      wrapperClassName: "-mt-px",
    });
  });
});
