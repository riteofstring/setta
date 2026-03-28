import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SectionContainerCoreBodyProps } from "./sectionContainerCoreBodyView";
import { SectionContainerNestedSectionsBoundary } from "./SectionContainerNestedSectionsBoundary";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";

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
      data-has-render-nested-sections={String(Boolean(renderNestedSections))}
      data-has-render-core-body={String(Boolean(renderCoreBody))}
    />
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
}));

describe("SectionContainerNestedSectionsBoundary", () => {
  it("injects the default recursive nested-section renderer into the lifted nested-sections seam", () => {
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
    expect(markup).toContain('data-has-render-core-body="true"');
  });
});
