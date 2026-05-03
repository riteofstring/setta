import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SectionResizeFrame } from "./SectionResizeFrame";

vi.mock("forks/dnd-kit/dndState", () => ({
  useDndMode: () => ({ isSorting: false }),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getAttachedTerminalParentIdForTerminalSection: () => null,
}));

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: unknown) => unknown) => selector({}),
}));

vi.mock("state/hooks/keyActivations", () => ({
  useShouldDisablePointerEvents: () => false,
}));

vi.mock("state/hooks/sectionSizes", () => ({
  useSectionMinMaxDims: () => ({
    maxHeight: 100_000,
    maxWidth: 100_000,
    minHeight: 0,
    minWidth: 0,
    sizeMode: {
      height: "any",
      width: "any",
    },
  }),
}));

describe("SectionResizeFrame", () => {
  it("leaves section resize handle geometry to GpuFlow", () => {
    const markup = renderToStaticMarkup(
      <SectionResizeFrame
        sectionId="settings-section__shortcuts"
        bgColor="bg-white"
        isYouTube={false}
        isMetaControl={false}
        positionAndSizeLocked={false}
        hasSectionStyleTheme={false}
      >
        <div>Shortcuts</div>
      </SectionResizeFrame>,
    );

    expect(markup).toContain('data-section-resize-frame="gpu-owned"');
    expect(markup).not.toContain("section-resize-handle");
    expect(markup).not.toContain("data-resize-direction");
  });
});
