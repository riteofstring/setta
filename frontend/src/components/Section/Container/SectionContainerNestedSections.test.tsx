import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ManyNestedSectionsRenderer } from "./ManyNestedSectionsBody";
import { SectionContainerNestedSections } from "./SectionContainerNestedSections";
import type { SectionContainerCoreBodyProps } from "./sectionContainerCoreBodyView";

vi.mock("./ManyNestedSections", () => ({
  MaybeManyNestedSections: ({
    sectionId,
    isGroup,
    layoutVariant,
    renderNestedSections,
  }: {
    sectionId: string;
    isGroup: boolean;
    layoutVariant?: "default" | "tight";
    renderNestedSections: ManyNestedSectionsRenderer;
  }) => (
    <div
      data-testid="mock-maybe-many-nested-sections"
      data-section-id={sectionId}
      data-is-group={String(isGroup)}
      data-layout-variant={layoutVariant ?? "default"}
    >
      {renderNestedSections({
        childIds: ["child-a", "child-b"],
        childClassName: "from-section-container",
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
  }: {
    sectionId: string;
    className?: string;
    renderCoreBody: (props: SectionContainerCoreBodyProps) => ReactNode;
  }) => (
    <div
      data-testid="mock-sortable-section"
      data-section-id={sectionId}
      data-class-name={className ?? ""}
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

describe("SectionContainerNestedSections", () => {
  it("injects the default sortable nested-section renderer into MaybeManyNestedSections", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerNestedSections
        sectionId="section-1"
        isGroup={false}
        layoutVariant="default"
        isJoinedCodeTerminalGroup={false}
      />,
    );

    expect(markup).toContain('data-testid="mock-maybe-many-nested-sections"');
    expect(markup).toContain('data-layout-variant="default"');
    expect(markup).toContain('data-testid="mock-sortable-section"');
    expect(markup).toContain('data-section-id="child-a"');
    expect(markup).toContain('data-class-name="from-section-container"');
    expect(markup).toContain('data-testid="mock-section-container-core-body"');
  });

  it("keeps the joined code-terminal wrapper while routing the same renderer", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerNestedSections
        sectionId="section-2"
        isGroup={true}
        layoutVariant="tight"
        isJoinedCodeTerminalGroup={true}
      />,
    );

    expect(markup).toContain('class="-mt-px"');
    expect(markup).toContain('data-layout-variant="tight"');
    expect(markup).toContain('data-testid="mock-sortable-section"');
    expect(markup).toContain('data-class-name="from-section-container"');
  });
});
