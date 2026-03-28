import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ShareMainContainer } from "./ShareMainContainer";

vi.mock("components/Section/Container/SectionContainerBoundary", () => ({
  SectionContainerBoundary: ({ sectionId }: { sectionId: string }) => (
    <div
      data-testid="mock-section-container-boundary"
      data-section-id={sectionId}
    />
  ),
}));

vi.mock("../MainContainerCore", () => ({
  MainContainerCore: ({
    doneLoading,
    is404,
    SectionBoundary,
  }: {
    doneLoading: boolean;
    is404: boolean;
    SectionBoundary: ({ sectionId }: { sectionId: string }) => ReactNode;
  }) => (
    <div
      data-testid="mock-main-container-core"
      data-done-loading={String(doneLoading)}
      data-is-404={String(is404)}
    >
      <SectionBoundary sectionId="share-section" />
    </div>
  ),
}));

describe("ShareMainContainer", () => {
  it("owns the lifted section boundary handoff above MainContainerCore", () => {
    const markup = renderToStaticMarkup(
      <ShareMainContainer doneLoading is404={false} />,
    );

    expect(markup).toContain('data-testid="mock-main-container-core"');
    expect(markup).toContain('data-done-loading="true"');
    expect(markup).toContain('data-is-404="false"');
    expect(markup).toContain('data-testid="mock-section-container-boundary"');
    expect(markup).toContain('data-section-id="share-section"');
  });
});
