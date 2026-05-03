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
  getCurrEffectiveSectionImplOfType: () => ({
    children: ["child-section"],
    positionAndSizeLocked: false,
    isInOtherProjectConfigs: false,
    overflowMode: true,
    size: { height: 240, width: 320 },
  }),
}));

vi.mock("state/activeSectionUI", () => ({
  useIsSectionUIActive: () => false,
}));

vi.mock("state/hooks/keyActivations", () => ({
  useShouldDisablePointerEvents: () => false,
}));

vi.mock("../Header/ChangeOrientationButton", () => ({
  ChangeOrientationButton: () => <button type="button">orientation</button>,
}));

vi.mock("../Header/DeleteOrHideButton", () => ({
  DeleteOrHideButton: () => <button type="button">delete</button>,
}));

vi.mock("../Header/LockPositionButton", () => ({
  LockPositionButton: () => <button type="button">lock</button>,
}));

vi.mock("../Header/MenuButton/MenuButton", () => ({
  default: () => <button type="button">menu</button>,
}));

vi.mock("../Header/SectionTitle", () => ({
  SectionTitle: ({ sectionId }: { sectionId: string }) => (
    <div data-testid="mock-section-title">{sectionId}</div>
  ),
}));

vi.mock("./utils", () => ({
  getOnSectionClick: () => () => {},
  getOutlineColor: () => "outline-transparent",
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

  it("keeps scene-owned group wrappers out of native wheel scroll ownership", () => {
    renderHarness(
      <GpuSceneSectionContainer
        isGroup
        sectionId="scene-group"
        visibility
        isEditingViewMode={false}
        isUserView={false}
      >
        <div data-testid="scene-owned-child-placeholder" />
      </GpuSceneSectionContainer>,
    );

    const markup = document.body.innerHTML;
    expect(markup).not.toContain("overflow-auto");
    expect(document.querySelector(".nowheel")).toBeNull();

    const refs = useSectionRefs.getState();
    expect(refs.withNested["scene-group"]).toBeUndefined();
  });
});

function renderHarness(element: ReactElement): void {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
}
