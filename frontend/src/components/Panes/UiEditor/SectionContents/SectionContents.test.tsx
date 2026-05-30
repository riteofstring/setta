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
  }: {
    sectionId: string;
    bgColor: string;
  }) => (
    <div data-testid="mock-callable-area" data-section-id={sectionId}>
      {bgColor}
    </div>
  ),
}));

vi.mock("../../../Section/Layouts/DictArea", () => ({
  DictArea: ({
    sectionId,
    bgColor,
  }: {
    sectionId: string;
    bgColor: string;
  }) => (
    <div data-testid="mock-dict-area" data-section-id={sectionId}>
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
    expect(markup).toContain("section-grid-areas");
  });

  it("renders callable contents through the existing callable area", () => {
    mockSectionType = SectionTypeEnum.Callable;

    const markup = renderToStaticMarkup(
      <SectionContents sectionId="callable-section" />,
    );

    expect(markup).toContain('data-testid="mock-callable-area"');
    expect(markup).toContain('data-section-id="callable-section"');
  });
});
