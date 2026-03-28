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
    renderCoreBody,
    renderNestedSections,
  }: {
    sectionId: string;
    className?: string;
    renderCoreBody: (props: SectionContainerCoreBodyProps) => ReactNode;
    renderNestedSections: SortableSectionNestedSectionsRenderer;
  }) => (
    <div
      data-testid="mock-sortable-section"
      data-section-id={sectionId}
      data-class-name={className ?? ""}
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
  it("injects the default sortable nested-section renderer into the generic nested-sections boundary", () => {
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
    expect(markup).toContain('data-has-render-nested-sections="true"');
    expect(markup).toContain('data-testid="mock-section-container-core-body"');
  });
});
