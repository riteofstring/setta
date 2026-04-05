import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ShareStandaloneProjectSurfacePage } from "./ShareStandaloneProjectSurfacePage";

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

vi.mock("./StandaloneProjectSurfacePage", () => ({
  StandaloneProjectSurfacePageWithLoadState: ({
    doneLoading,
    is404,
  }: {
    doneLoading: boolean;
    is404: boolean;
  }) => (
    <div
      data-testid="mock-standalone-project-surface-page"
      data-done-loading={doneLoading ? "true" : "false"}
      data-is404={is404 ? "true" : "false"}
    />
  ),
}));

describe("ShareStandaloneProjectSurfacePage", () => {
  it("renders the standalone project surface inside the share wrapper", () => {
    const markup = renderToStaticMarkup(<ShareStandaloneProjectSurfacePage />);

    expect(markup).toContain('data-testid="mock-share-wrapper"');
    expect(markup).toContain('data-manage-title="false"');
    expect(markup).toContain('data-testid="mock-modal-container"');
    expect(markup).toContain(
      'data-testid="mock-standalone-project-surface-page"',
    );
    expect(markup).toContain('data-done-loading="true"');
    expect(markup).toContain('data-is404="false"');
  });
});
