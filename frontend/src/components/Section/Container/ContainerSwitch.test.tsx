import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ContainerSwitch } from "./ContainerSwitch";

vi.mock("./ContainerWrappers", () => ({
  GpuSceneSectionContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-gpu-scene-container">{children}</div>
  ),
  StaticSectionContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-static-section-container">{children}</div>
  ),
}));

const baseProps = {
  isGroup: false,
  sectionId: "section-1",
  visibility: true,
  isEditingViewMode: false,
  isUserView: false,
};

describe("ContainerSwitch", () => {
  it("routes scene-owned surfaces around dnd-kit section wrappers", () => {
    const markup = renderToStaticMarkup(
      <ContainerSwitch {...baseProps} isTopLevel={false} sceneSurface>
        content
      </ContainerSwitch>,
    );

    expect(markup).toContain('data-testid="mock-gpu-scene-container"');
    expect(markup).not.toContain('data-testid="mock-static-section-container"');
  });

  it("routes standalone nested sections through the static section container", () => {
    const markup = renderToStaticMarkup(
      <ContainerSwitch {...baseProps} isTopLevel={false}>
        content
      </ContainerSwitch>,
    );

    expect(markup).toContain('data-testid="mock-static-section-container"');
  });
});
