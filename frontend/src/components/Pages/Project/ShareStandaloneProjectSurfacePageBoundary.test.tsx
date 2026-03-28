import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ShareStandaloneProjectSurfacePageBoundary,
  ShareStandaloneProjectSurfacePageWithShareState,
} from "./ShareStandaloneProjectSurfacePageBoundary";

vi.mock("components/Modals/ModalContainer", () => ({
  ModalContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-modal-container">{children}</div>
  ),
}));

vi.mock("components/Pages/Share/ShareWrapper", () => ({
  ShareWrapper: ({
    children,
    manageTitle,
  }: {
    children:
      | ReactNode
      | ((state: { doneLoading: boolean; is404: boolean }) => ReactNode);
    manageTitle?: boolean;
  }) => (
    <div
      data-testid="mock-share-wrapper"
      data-manage-title={manageTitle === false ? "false" : "true"}
    >
      {typeof children === "function"
        ? children({ doneLoading: true, is404: false })
        : children}
    </div>
  ),
}));

vi.mock("./StandaloneProjectSurfacePageLoadBoundary", () => ({
  StandaloneProjectSurfacePageWithLoadState: ({
    doneLoading,
    is404,
    renderDictArea,
  }: {
    doneLoading: boolean;
    is404: boolean;
    renderDictArea: unknown;
  }) => (
    <div
      data-testid="mock-standalone-project-surface-page"
      data-done-loading={doneLoading ? "true" : "false"}
      data-is404={is404 ? "true" : "false"}
      data-has-render-dict-area={Boolean(renderDictArea) ? "true" : "false"}
    />
  ),
}));

describe("ShareStandaloneProjectSurfacePageBoundary", () => {
  const renderDictArea = () => null;

  it("routes the share wrapper load state through the lifted standalone surface boundary", () => {
    const markup = renderToStaticMarkup(
      <ShareStandaloneProjectSurfacePageBoundary
        renderDictArea={renderDictArea}
      />,
    );

    expect(markup).toContain('data-testid="mock-share-wrapper"');
    expect(markup).toContain('data-manage-title="false"');
    expect(markup).toContain('data-testid="mock-modal-container"');
    expect(markup).toContain(
      'data-testid="mock-standalone-project-surface-page"',
    );
    expect(markup).toContain('data-done-loading="true"');
    expect(markup).toContain('data-is404="false"');
    expect(markup).toContain('data-has-render-dict-area="true"');
  });

  it("reuses the same lifted share boundary for caller-supplied share state", () => {
    const markup = renderToStaticMarkup(
      <ShareStandaloneProjectSurfacePageWithShareState
        doneLoading={false}
        is404
        renderDictArea={renderDictArea}
      />,
    );

    expect(markup).toContain('data-testid="mock-modal-container"');
    expect(markup).toContain(
      'data-testid="mock-standalone-project-surface-page"',
    );
    expect(markup).toContain('data-done-loading="false"');
    expect(markup).toContain('data-is404="true"');
    expect(markup).toContain('data-has-render-dict-area="true"');
    expect(markup).not.toContain('data-testid="mock-share-wrapper"');
  });
});
