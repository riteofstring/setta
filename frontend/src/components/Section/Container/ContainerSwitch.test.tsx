import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ContainerSwitch } from "./ContainerSwitch";

vi.mock("./ContainerWrappers", () => ({
  DndSlotAndDndWatcher: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-dnd-slot">{children}</div>
  ),
  GpuSceneSectionContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-gpu-scene-container">{children}</div>
  ),
}));

vi.mock("./TopLevelContainer", () => ({
  TopLevelContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="mock-top-level-container">{children}</div>
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
    expect(markup).not.toContain('data-testid="mock-dnd-slot"');
    expect(markup).not.toContain('data-testid="mock-top-level-container"');
  });

  it("keeps standalone nested sections on the nested dnd wrapper", () => {
    const markup = renderToStaticMarkup(
      <ContainerSwitch {...baseProps} isTopLevel={false}>
        content
      </ContainerSwitch>,
    );

    expect(markup).toContain('data-testid="mock-dnd-slot"');
  });
});
