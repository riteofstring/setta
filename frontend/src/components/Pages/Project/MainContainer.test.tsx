import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MainContainer } from "./MainContainer";

let doneLoading = false;
let is404 = false;

vi.mock("state/hooks/project", () => ({
  useLoadProjectConfig: () => [doneLoading, is404] as const,
}));

vi.mock("../MainContainerCore", () => ({
  MainContainerCore: ({
    doneLoading: currentDoneLoading,
    is404: currentIs404,
    SectionBoundary,
  }: {
    doneLoading: boolean;
    is404: boolean;
    SectionBoundary: ({ sectionId }: { sectionId: string }) => ReactNode;
  }) => (
    <div
      data-testid="mock-main-container-core"
      data-done-loading={String(currentDoneLoading)}
      data-is-404={String(currentIs404)}
    >
      <SectionBoundary sectionId="project-section" />
    </div>
  ),
}));

describe("MainContainer", () => {
  const MockSectionBoundary = ({ sectionId }: { sectionId: string }) => (
    <div
      data-testid="mock-section-container-boundary"
      data-section-id={sectionId}
    />
  );

  beforeEach(() => {
    doneLoading = false;
    is404 = false;
  });

  it("passes the caller-owned section boundary through to MainContainerCore", () => {
    doneLoading = true;

    const markup = renderToStaticMarkup(
      <MainContainer SectionBoundary={MockSectionBoundary} />,
    );

    expect(markup).toContain('data-testid="mock-main-container-core"');
    expect(markup).toContain('data-done-loading="true"');
    expect(markup).toContain('data-is-404="false"');
    expect(markup).toContain('data-testid="mock-section-container-boundary"');
    expect(markup).toContain('data-section-id="project-section"');
  });

  it("passes through the current project loading flags unchanged", () => {
    is404 = true;

    const markup = renderToStaticMarkup(
      <MainContainer SectionBoundary={MockSectionBoundary} />,
    );

    expect(markup).toContain('data-done-loading="false"');
    expect(markup).toContain('data-is-404="true"');
  });
});
