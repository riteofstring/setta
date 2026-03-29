import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  IdeStandaloneProjectSurfaceRouteBoundary,
  ShareStandaloneProjectSurfaceRouteBoundary,
} from "./StandaloneProjectSurfaceRouteElementBoundary";

vi.mock("components/Modals/ModalContainer", () => ({
  ModalContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-modal-container">{children}</div>
  ),
}));

vi.mock("../GlobalWrapper", () => ({
  GlobalWrapper: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-global-wrapper">{children}</div>
  ),
}));

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
}));

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

describe("IdeStandaloneProjectSurfaceRouteBoundary", () => {
  it("owns the ide route-entry shell above the standalone project surface page load boundary", () => {
    const markup = renderToStaticMarkup(
      <IdeStandaloneProjectSurfaceRouteBoundary renderDictArea={() => null} />,
    );

    expect(markup).toContain('data-testid="mock-global-wrapper"');
    expect(markup).toContain('data-testid="mock-modal-container"');
    expect(markup).toContain(
      'data-testid="mock-standalone-project-surface-page-load-boundary"',
    );
    expect(markup).toContain('data-has-render-dict-area="true"');
  });
});

describe("ShareStandaloneProjectSurfaceRouteBoundary", () => {
  it("owns the share route-entry handoff above the share standalone page boundary", () => {
    const markup = renderToStaticMarkup(
      <ShareStandaloneProjectSurfaceRouteBoundary
        renderDictArea={() => null}
      />,
    );

    expect(markup).toContain(
      'data-testid="mock-share-standalone-project-surface-page-boundary"',
    );
    expect(markup).toContain('data-has-render-dict-area="true"');
  });
});
