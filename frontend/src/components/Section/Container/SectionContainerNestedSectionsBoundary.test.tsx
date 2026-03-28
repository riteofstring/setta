import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SectionContainerCoreBodyProps } from "./sectionContainerCoreBodyView";
import { SectionContainerNestedSectionsBoundary } from "./SectionContainerNestedSectionsBoundary";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";
import type { SectionContainerSectionProps } from "./SectionContainerSection";
import type { SortableSectionBodySectionBoundaryProps } from "./sortableSectionBodyView";

vi.mock("./SectionContainerNestedSections", () => ({
  SectionContainerNestedSections: ({
    sectionId,
    isGroup,
    layoutVariant,
    isJoinedCodeTerminalGroup,
    SectionBoundary,
    renderCoreBody,
    renderNestedSections,
  }: {
    sectionId: string;
    isGroup: boolean;
    layoutVariant?: "default" | "tight";
    isJoinedCodeTerminalGroup: boolean;
    SectionBoundary: (
      props: SortableSectionBodySectionBoundaryProps,
    ) => ReactNode;
    renderCoreBody: (props: SectionContainerCoreBodyProps) => ReactNode;
    renderNestedSections: (
      props: SectionContainerNestedSectionsProps,
    ) => ReactNode;
  }) => (
    <div
      data-testid="mock-section-container-nested-sections"
      data-section-id={sectionId}
      data-is-group={String(isGroup)}
      data-layout-variant={layoutVariant ?? "default"}
      data-is-joined-code-terminal-group={String(isJoinedCodeTerminalGroup)}
      data-has-render-nested-sections={String(Boolean(renderNestedSections))}
    >
      <SectionBoundary
        sectionId="child-a"
        dragListeners={{ onPointerDown: "listener" }}
        renderCoreBody={renderCoreBody}
        renderNestedSections={() => (
          <div data-testid="unused-recursive-renderer" />
        )}
      />
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

vi.mock("./SectionContainerSection", () => ({
  renderDefaultSectionContainerCoreBody: () => null,
  renderDefaultSectionContainerNestedSections: () => null,
  SectionContainerSection: ({
    sectionId,
    dragListeners,
  }: SectionContainerSectionProps &
    Pick<
      SortableSectionBodySectionBoundaryProps,
      "renderCoreBody" | "renderNestedSections"
    >) => (
    <div
      data-testid="mock-section-container-section"
      data-section-id={sectionId}
      data-has-drag-listeners={String(Boolean(dragListeners))}
    />
  ),
}));

describe("SectionContainerNestedSectionsBoundary", () => {
  it("injects the default sortable section boundary and recursive nested-section renderer into the lifted nested-sections seam", () => {
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
    expect(markup).toContain('data-layout-variant="default"');
    expect(markup).toContain('data-is-joined-code-terminal-group="false"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
    expect(markup).toContain('data-testid="mock-section-container-section"');
    expect(markup).toContain('data-section-id="child-a"');
    expect(markup).toContain('data-has-drag-listeners="true"');
  });
});
