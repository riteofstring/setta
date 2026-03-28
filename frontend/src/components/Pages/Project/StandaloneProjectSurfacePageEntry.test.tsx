import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StandaloneProjectSurfacePage } from "./StandaloneProjectSurfacePage";

vi.mock("./StandaloneProjectSurfacePageLoadBoundary", () => ({
  StandaloneProjectSurfacePageLoadBoundary: ({
    renderDictArea,
  }: {
    renderDictArea: unknown;
  }) => (
    <div
      data-testid="mock-standalone-project-surface-page-load-boundary"
      data-has-render-dict-area={Boolean(renderDictArea) ? "true" : "false"}
    />
  ),
  StandaloneProjectSurfacePageWithLoadState: () => null,
}));

describe("StandaloneProjectSurfacePage", () => {
  it("owns the standalone dict-area renderer seam above the load boundary", () => {
    const markup = renderToStaticMarkup(<StandaloneProjectSurfacePage />);

    expect(markup).toContain(
      'data-testid="mock-standalone-project-surface-page-load-boundary"',
    );
    expect(markup).toContain('data-has-render-dict-area="true"');
  });
});
