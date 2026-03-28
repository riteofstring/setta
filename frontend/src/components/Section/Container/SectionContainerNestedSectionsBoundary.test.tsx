import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SectionContainerCoreBodyProps } from "./sectionContainerCoreBodyView";
import { SectionContainerNestedSectionsBoundary } from "./SectionContainerNestedSectionsBoundary";
import type { SortableSectionNestedSectionsRenderer } from "./sortableSectionBodyView";

vi.mock("./SectionContainerNestedSections", () => ({
  SectionContainerNestedSections: ({
    renderNestedSections,
  }: {
    renderNestedSections: ({
      childIds,
      childClassName,
    }: {
      childIds: string[];
      childClassName: string;
    }) => ReactNode;
  }) => (
    <div data-testid="mock-section-container-nested-sections">
      {renderNestedSections({
        childIds: ["child-a", "child-b"],
        childClassName: "from-boundary",
      })}
    </div>
  ),
}));

vi.mock("./SectionContainerCoreCanvasBody", () => ({
  SectionContainerCoreCanvasBody: ({
    sectionId,
    sectionTypeName,
    bgColor,
  }: SectionContainerCoreBodyProps) => (
    <div
      data-testid="mock-section-container-core-body"
      data-section-id={sectionId}
      data-section-type={sectionTypeName}
      data-bg-color={bgColor}
    />
  ),
}));

vi.mock("./SortableSectionContainer", () => ({
  SortableSectionContainer: ({
    sectionId,
    className,
    SectionBoundary,
    renderCoreBody,
    renderNestedSections,
  }: {
    sectionId: string;
    className?: string;
    SectionBoundary: ReactNode;
    renderCoreBody: (props: SectionContainerCoreBodyProps) => ReactNode;
    renderNestedSections: SortableSectionNestedSectionsRenderer;
  }) => (
    <div
      data-testid="mock-sortable-section"
      data-section-id={sectionId}
      data-class-name={className ?? ""}
      data-has-section-boundary={String(Boolean(SectionBoundary))}
      data-has-render-nested-sections={String(Boolean(renderNestedSections))}
    >
      {renderCoreBody({
        sectionId,
        sectionTypeName: "Code",
        bgColor: "bg:white",
        isMinimized: false,
        isUserView: false,
      })}
    </div>
  ),
}));

describe("SectionContainerNestedSectionsBoundary", () => {
  it("owns the lifted sortable section boundary while injecting the default sortable nested-section renderer into the generic nested-sections boundary", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerNestedSectionsBoundary
        sectionId="section-1"
        isGroup={false}
        layoutVariant="default"
        isJoinedCodeTerminalGroup={false}
      />,
    );

    expect(markup).toContain(
      'data-testid="mock-section-container-nested-sections"',
    );
    expect(markup).toContain('data-testid="mock-sortable-section"');
    expect(markup).toContain('data-section-id="child-a"');
    expect(markup).toContain('data-class-name="from-boundary"');
    expect(markup).toContain('data-has-section-boundary="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
    expect(markup).toContain('data-testid="mock-section-container-core-body"');
  });
});
