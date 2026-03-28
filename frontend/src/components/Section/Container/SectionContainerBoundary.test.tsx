import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SectionContainerBoundary } from "./SectionContainerBoundary";
import type { SectionContainerCoreBodyProps } from "./sectionContainerCoreBodyView";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";

vi.mock("./SectionContainer", () => ({
  SectionContainer: ({
    sectionId,
    isTopLevel,
    renderCoreBody,
    renderNestedSections,
  }: {
    sectionId: string;
    isTopLevel: boolean;
    renderCoreBody: (props: SectionContainerCoreBodyProps) => ReactNode;
    renderNestedSections: (
      props: SectionContainerNestedSectionsProps,
    ) => ReactNode;
  }) => (
    <div
      data-testid="mock-section-container"
      data-section-id={sectionId}
      data-is-top-level={String(isTopLevel)}
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

vi.mock("./SectionContainerNestedSectionsBoundary", () => ({
  renderSectionContainerNestedSections: ({
    sectionId,
    isGroup,
    layoutVariant,
    isJoinedCodeTerminalGroup,
  }: SectionContainerNestedSectionsProps) => (
    <div
      data-testid="mock-section-container-nested-sections"
      data-section-id={sectionId}
      data-is-group={String(isGroup)}
      data-layout-variant={layoutVariant}
      data-is-joined-code-terminal-group={String(isJoinedCodeTerminalGroup)}
    />
  ),
}));

describe("SectionContainerBoundary", () => {
  it("injects the default core-body and nested-sections boundaries into the generic section container", () => {
    const markup = renderToStaticMarkup(
      <SectionContainerBoundary sectionId="section-1" isTopLevel={true} />,
    );

    expect(markup).toContain('data-testid="mock-section-container"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-is-top-level="true"');
    expect(markup).toContain('data-testid="mock-section-container-core-body"');
    expect(markup).toContain(
      'data-testid="mock-section-container-nested-sections"',
    );
    expect(markup).toContain('data-layout-variant="default"');
    expect(markup).toContain(
      'data-is-joined-code-terminal-group="false"',
    );
  });
});
