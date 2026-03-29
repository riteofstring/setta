import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ShareStandaloneProjectSurfacePage } from "./ShareStandaloneProjectSurfacePage";

vi.mock("./ShareStandaloneProjectSurfacePageBoundary", () => ({
  ShareStandaloneProjectSurfacePageBoundary: ({
    renderDictArea,
  }: {
    renderDictArea: unknown;
  }) => (
    <div
      data-testid="mock-share-standalone-project-surface-page-boundary"
      data-has-render-dict-area={Boolean(renderDictArea) ? "true" : "false"}
    />
  ),
}));

describe("ShareStandaloneProjectSurfacePage", () => {
  it("forwards the caller-owned dict-area renderer seam through the share entrypoint", () => {
    const markup = renderToStaticMarkup(
      <ShareStandaloneProjectSurfacePage renderDictArea={() => null} />,
    );

    expect(markup).toContain(
      'data-testid="mock-share-standalone-project-surface-page-boundary"',
    );
    expect(markup).toContain('data-has-render-dict-area="true"');
  });
});
