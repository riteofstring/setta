import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SectionContainerCoreBodyProps } from "./sectionContainerCoreBodyView";
import {
  renderDefaultSectionContainerCoreBody,
  renderDefaultSectionContainerNestedSections,
} from "./sectionContainerDefaultRenderers";
import type { SectionContainerNestedSectionsProps } from "./sectionContainerNestedSectionsView";
import type { SortableSectionBodySectionBoundaryProps } from "./sortableSectionBodyView";

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
    SectionBoundary,
    isGroup,
    layoutVariant,
    isJoinedCodeTerminalGroup,
    renderCoreBody,
    renderNestedSections,
  }: {
    sectionId: string;
    SectionBoundary: (
      props: SortableSectionBodySectionBoundaryProps,
    ) => ReactNode;
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
      data-has-section-boundary={String(Boolean(SectionBoundary))}
      data-has-render-core-body={String(Boolean(renderCoreBody))}
      data-has-render-nested-sections={String(Boolean(renderNestedSections))}
    />
  ),
}));

describe("sectionContainerDefaultRenderers", () => {
  it("renders the default core body through the canvas body surface", () => {
    const markup = renderToStaticMarkup(
      renderDefaultSectionContainerCoreBody({
        sectionId: "section-1",
        sectionTypeName: "Code",
        bgColor: "bg:blue",
        isMinimized: false,
        isUserView: false,
      }),
    );

    expect(markup).toContain('data-testid="mock-section-container-core-body"');
    expect(markup).toContain('data-section-id="section-1"');
    expect(markup).toContain('data-section-type="Code"');
    expect(markup).toContain('data-bg-color="bg:blue"');
  });

  it("injects the default recursive renderers into nested sections", () => {
    const markup = renderToStaticMarkup(
      renderDefaultSectionContainerNestedSections({
        sectionId: "section-2",
        isGroup: true,
        layoutVariant: "tight",
        isJoinedCodeTerminalGroup: false,
      }),
    );

    expect(markup).toContain(
      'data-testid="mock-section-container-nested-sections"',
    );
    expect(markup).toContain('data-section-id="section-2"');
    expect(markup).toContain('data-is-group="true"');
    expect(markup).toContain('data-layout-variant="tight"');
    expect(markup).toContain('data-is-joined-code-terminal-group="false"');
    expect(markup).toContain('data-has-section-boundary="true"');
    expect(markup).toContain('data-has-render-core-body="true"');
    expect(markup).toContain('data-has-render-nested-sections="true"');
  });
});
