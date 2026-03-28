import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ShareStandaloneProjectSurfacePage } from "./ShareStandaloneProjectSurfacePage";

vi.mock("./ShareStandaloneProjectSurfacePageBoundary", () => ({
  ShareStandaloneProjectSurfacePageBoundary: () => (
    <div data-testid="mock-share-standalone-project-surface-page-boundary" />
  ),
}));

describe("ShareStandaloneProjectSurfacePage", () => {
  it("routes the share entrypoint through the lifted share boundary", () => {
    const markup = renderToStaticMarkup(<ShareStandaloneProjectSurfacePage />);

    expect(markup).toContain(
      'data-testid="mock-share-standalone-project-surface-page-boundary"',
    );
  });
});
