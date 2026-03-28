import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SectionContainerSection } from "./SectionContainerSection";
import type { SectionContainerCoreBodyProps } from "./sectionContainerCoreBodyView";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";
import type { SortableSectionBodySectionBoundaryProps } from "./sortableSectionBodyView";

vi.mock("./SectionContainer", () => ({
  SectionContainer: ({
    sectionId,
    isTopLevel,
    SectionBoundary,
    renderCoreBody,
    renderNestedSections,
  }: {
    sectionId: string;
    isTopLevel: boolean;
    SectionBoundary: (
      props: SortableSectionBodySectionBoundaryProps,
    ) => ReactNode;
    renderCoreBody: (props: SectionContainerCoreBodyProps) => ReactNode;
    renderNestedSections: (
      props: SectionContainerNestedSectionsProps,
    ) => ReactNode;
  }) => (
    <div
      data-testid="mock-section-container"
      data-section-id={sectionId}
      data-is-top-level={String(isTopLevel)}
      data-has-section-boundary={String(Boolean(SectionBoundary))}
    >
      {renderCoreBody({
        sectionId,
        sectionTypeName: "Code",
        bgColor: "bg:blue",
        isMinimized: false,
        isUserView: false,
      })}
      {renderNestedSections({
        sectionId,
        isGroup: true,
        layoutVariant: "default",
        isJoinedCodeTerminalGroup: false,
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

vi.mock("./SectionContainerNestedSections", () => ({
  SectionContainerNestedSections: ({
    sectionId,
    isGroup,
    layoutVariant,
    isJoinedCodeTerminalGroup,
    renderCoreBody,
    renderNestedSections,
  }: {
    sectionId: string;
    isGroup: boolean;
    layoutVariant?: "default" | "tight";
    isJoinedCodeTerminalGroup: boolean;
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
      data-has-render-core-body={String(Boolean(renderCoreBody))}
      data-has-render-nested-sections={String(Boolean(renderNestedSections))}
    />
  ),
}));

describe("SectionContainerSection", () => {
  it("delegates caller-owned core-body and nested-section renderers into the generic section container", () => {
    const renderCoreBody = ({
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
    );
    const renderNestedSections = ({
      sectionId,
      isGroup,
      layoutVariant,
      isJoinedCodeTerminalGroup,
    }: SectionContainerNestedSectionsProps) => (
      <div
        data-testid="mock-section-container-nested-sections"
        data-section-id={sectionId}
        data-is-group={String(isGroup)}
        data-layout-variant={layoutVariant ?? "default"}
        data-is-joined-code-terminal-group={String(isJoinedCodeTerminalGroup)}
      />
    );
    const markup = renderToStaticMarkup(
      <SectionContainerSection
        sectionId="section-1"
        isTopLevel={true}
        renderCoreBody={renderCoreBody}
        renderNestedSections={renderNestedSections}
      />,
    );

    expect(markup).toContain('data-testid="mock-section-container"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-is-top-level="true"');
    expect(markup).toContain('data-has-section-boundary="true"');
    expect(markup).toContain('data-testid="mock-section-container-core-body"');
    expect(markup).toContain(
      'data-testid="mock-section-container-nested-sections"',
    );
    expect(markup).toContain('data-bg-color="bg:blue"');
    expect(markup).toContain('data-layout-variant="default"');
  });
});
