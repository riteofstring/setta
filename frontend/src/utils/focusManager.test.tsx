/* @vitest-environment jsdom */

import { act, useRef, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  focusAdjacentTopLevelSection,
  handleTabNavigation,
  moveFocus,
  useTabScope,
} from "./focusManager";

const hoisted = vi.hoisted(() => {
  const movePaneToIncludeElementMock = vi.fn();
  const applyActiveSectionChangeMock = vi.fn();
  const getCurrEffectiveSectionImplMock = vi.fn(() => ({ type: "Code" }));
  const getTopLevelSectionIdsForDisplayMock = vi.fn(() => [
    "section-1",
    "section-2",
  ]);
  const projectState = {
    projectConfig: {
      topLevelSections: {
        "section-1": { x: 0, y: 0, zIndex: 0 },
        "section-2": { x: 100, y: 0, zIndex: 0 },
      } as Record<string, { x: number; y: number; zIndex?: number }>,
    },
  };
  const sectionRefsState = {
    selfOnly: {} as Record<string, HTMLElement>,
    withNested: {} as Record<string, HTMLElement>,
  };

  return {
    applyActiveSectionChangeMock,
    getCurrEffectiveSectionImplMock,
    getTopLevelSectionIdsForDisplayMock,
    movePaneToIncludeElementMock,
    projectState,
    sectionRefsState,
  };
});

vi.mock("forks/xyflow/core/utils/graph", () => ({
  movePaneToIncludeElement: hoisted.movePaneToIncludeElementMock,
}));

vi.mock("state/actions/activeSectionController", () => ({
  applyActiveSectionChange: hoisted.applyActiveSectionChangeMock,
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: hoisted.getCurrEffectiveSectionImplMock,
  getTopLevelSectionIdsForDisplay: hoisted.getTopLevelSectionIdsForDisplayMock,
}));

vi.mock("state/definitions", () => ({
  useProjectState: {
    getState: () => hoisted.projectState,
  },
  useSectionRefs: {
    getState: () => hoisted.sectionRefsState,
  },
}));

function markVisible(element: HTMLElement) {
  Object.defineProperty(element, "offsetParent", {
    configurable: true,
    get: () => document.body,
  });
}

function Scope({
  scopeId,
  order,
  behavior = "default",
  children,
}: {
  scopeId: string;
  order: number;
  behavior?: "default" | "canvas";
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useTabScope({ scopeId, order, rootRef, behavior });
  return (
    <div data-tab-scope={scopeId} ref={rootRef}>
      {children}
    </div>
  );
}

describe("focusManager", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    document.body.innerHTML = "";
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    hoisted.applyActiveSectionChangeMock.mockReset();
    hoisted.getCurrEffectiveSectionImplMock.mockReset();
    hoisted.getCurrEffectiveSectionImplMock.mockReturnValue({ type: "Code" });
    hoisted.getTopLevelSectionIdsForDisplayMock.mockReset();
    hoisted.getTopLevelSectionIdsForDisplayMock.mockReturnValue([
      "section-1",
      "section-2",
    ]);
    hoisted.movePaneToIncludeElementMock.mockReset();
    hoisted.projectState.projectConfig.topLevelSections = {
      "section-1": { x: 0, y: 0, zIndex: 0 },
      "section-2": { x: 100, y: 0, zIndex: 0 },
    };
    hoisted.sectionRefsState.selfOnly = {};
    hoisted.sectionRefsState.withNested = {};
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
  });

  it("moves focus to the next registered scope", async () => {
    await act(async () => {
      root.render(
        <>
          <Scope scopeId="overview" order={1}>
            <button type="button" data-testid="first">
              First
            </button>
          </Scope>
          <Scope scopeId="canvas" order={2}>
            <button type="button" data-testid="second">
              Second
            </button>
          </Scope>
        </>,
      );
    });

    const firstButton = host.querySelector(
      '[data-testid="first"]',
    ) as HTMLButtonElement;
    const secondButton = host.querySelector(
      '[data-testid="second"]',
    ) as HTMLButtonElement;
    markVisible(firstButton);
    markVisible(secondButton);
    firstButton.focus();

    const moved = moveFocus({ direction: 1, from: firstButton });

    expect(moved).toBe(true);
    expect(document.activeElement).toBe(secondButton);
  });

  it("preserves native tab behavior for inputs outside the canvas scope", async () => {
    await act(async () => {
      root.render(
        <Scope scopeId="overview" order={1}>
          <input data-testid="native-input" />
        </Scope>,
      );
    });

    const input = host.querySelector(
      '[data-testid="native-input"]',
    ) as HTMLInputElement;
    input.focus();

    const handled = handleTabNavigation({
      defaultPrevented: false,
      shiftKey: false,
      target: input,
    } as KeyboardEvent);

    expect(handled).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  it("focuses the next top-level section and marks it active", () => {
    const canvasScope = document.createElement("div");
    canvasScope.setAttribute("data-tab-scope", "canvas");
    document.body.appendChild(canvasScope);

    const sectionOne = document.createElement("div");
    sectionOne.className = "react-flow__node";
    sectionOne.setAttribute("data-id", "section-1");
    const sourceButton = document.createElement("button");
    sourceButton.type = "button";
    sourceButton.textContent = "source";
    sectionOne.appendChild(sourceButton);

    const sectionTwo = document.createElement("div");
    sectionTwo.className = "react-flow__node";
    sectionTwo.setAttribute("data-id", "section-2");
    const targetButton = document.createElement("button");
    targetButton.type = "button";
    targetButton.textContent = "target";
    sectionTwo.appendChild(targetButton);

    canvasScope.append(sectionOne, sectionTwo);
    hoisted.sectionRefsState.selfOnly["section-2"] = sectionTwo;
    hoisted.sectionRefsState.withNested["section-2"] = sectionTwo;
    markVisible(sourceButton);
    markVisible(targetButton);
    sourceButton.focus();

    const focused = focusAdjacentTopLevelSection({ direction: 1 });

    expect(focused).toBe(true);
    expect(hoisted.applyActiveSectionChangeMock).toHaveBeenCalledWith({
      interaction: "go-to",
      sectionId: "section-2",
    });
    expect(document.activeElement?.textContent).toBe("target");
    expect(hoisted.movePaneToIncludeElementMock).toHaveBeenCalledWith(
      targetButton,
    );
  });
});
