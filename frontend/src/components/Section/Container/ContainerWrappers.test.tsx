/* @vitest-environment jsdom */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useSectionRefs } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GpuSceneSectionContainer } from "./ContainerWrappers";

vi.hoisted(() => {
  (
    globalThis as typeof globalThis & {
      ResizeObserver?: typeof ResizeObserver;
    }
  ).ResizeObserver = class ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
});

vi.mock("state/actions/sectionInfos", () => ({
  getAncestorSameVisibility: () => false,
}));

let root: Root | null = null;

describe("GpuSceneSectionContainer", () => {
  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.innerHTML = "";
    resetProjectStores();
  });

  it("keeps non-group scene surfaces out of legacy withNested refs", () => {
    renderHarness(
      <GpuSceneSectionContainer
        isGroup={false}
        sectionId="scene-section"
        visibility
        isEditingViewMode={false}
        isUserView={false}
      >
        <div>content</div>
      </GpuSceneSectionContainer>,
    );

    const refs = useSectionRefs.getState();
    expect(refs.withNested["scene-section"]).toBeUndefined();
  });
});

function renderHarness(element: ReactElement): void {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
}
