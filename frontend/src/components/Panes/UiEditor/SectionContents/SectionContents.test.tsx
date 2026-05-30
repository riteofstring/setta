import { renderToStaticMarkup } from "react-dom/server";
import { SectionTypeEnum } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionContents } from "./SectionContents";

let mockSectionType = SectionTypeEnum.Dict;
let mockStyleColor: string | null = null;

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: () => ({
    type: mockSectionType,
    styleColor: mockStyleColor,
  }),
}));

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: Record<string, never>) => unknown) =>
    selector({}),
  useLocalStorage: (selector: (state: { darkMode: boolean }) => unknown) =>
    selector({ darkMode: false }),
  useTemporaryMiscState: (
    selector: (state: Record<string, never>) => unknown,
  ) => selector({}),
}));

vi.mock("../../../Section/Layouts/CallableArea", () => ({
  CallableArea: ({
    sectionId,
    bgColor,
    contentSurface,
  }: {
    sectionId: string;
    bgColor: string;
    contentSurface?: string;
  }) => (
    <div
      data-testid="mock-callable-area"
      data-bg-color={bgColor}
      data-content-surface={contentSurface ?? ""}
      data-section-id={sectionId}
    >
      {bgColor}
    </div>
  ),
}));

vi.mock("../../../Section/Layouts/DictArea", () => ({
  DictArea: ({
    sectionId,
    bgColor,
    contentSurface,
  }: {
    sectionId: string;
    bgColor: string;
    contentSurface?: string;
  }) => (
    <div
      data-testid="mock-dict-area"
      data-bg-color={bgColor}
      data-content-surface={contentSurface ?? ""}
      data-section-id={sectionId}
    >
      {bgColor}
    </div>
  ),
}));

describe("SectionContents", () => {
  beforeEach(() => {
    mockSectionType = SectionTypeEnum.Dict;
    mockStyleColor = null;
  });

  it("renders dict contents in the detached pane grid", () => {
    const markup = renderToStaticMarkup(
      <SectionContents sectionId="dict-section" />,
    );

    expect(markup).toContain('data-testid="section-contents-pane"');
    expect(markup).toContain('data-testid="mock-dict-area"');
    expect(markup).toContain('data-section-id="dict-section"');
    expect(markup).toContain('data-bg-color="bg-transparent"');
    expect(markup).toContain('data-content-surface="pane"');
    expect(markup).toContain("section-grid-areas");
    expect(markup).not.toContain("rounded-md");
  });

  it("renders callable contents through the existing callable area", () => {
    mockSectionType = SectionTypeEnum.Callable;

    const markup = renderToStaticMarkup(
      <SectionContents sectionId="callable-section" />,
    );

    expect(markup).toContain('data-testid="mock-callable-area"');
    expect(markup).toContain('data-section-id="callable-section"');
    expect(markup).toContain('data-bg-color="bg-transparent"');
    expect(markup).toContain('data-content-surface="pane"');
  });
});
