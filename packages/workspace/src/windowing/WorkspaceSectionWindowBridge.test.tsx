/* @vitest-environment jsdom */

import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceCommands } from "../commands/workspaceCommandRegistry";
import { getSectionOrThrow } from "../document/documentSelectors";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { useWorkspaceDocument } from "../document/stores";
import type { WorkspaceSection } from "../document/types";
import { SectionContainerContent } from "../section/container/SectionContainerContent";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";
import { WorkspaceWindowingContextProvider } from "./workspaceWindowingContext";
import { IntegratedWorkspaceWindowManager } from "./IntegratedWorkspaceWindowManager";
import {
  createWorkspaceWindowingState,
  createWorkspaceWindowViewport,
  type WorkspaceWindowingState,
} from "./windowingTypes";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SECTION_ID = "section-a";

function createPointerEvent(
  type: string,
  {
    clientX,
    clientY,
    pointerId = 1,
  }: { clientX: number; clientY: number; pointerId?: number },
): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
}

function makeSection(): WorkspaceSection {
  return {
    children: [],
    id: SECTION_ID,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: "ordinary",
    name: "Research Notes",
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 260, width: 420 },
    styleColor: null,
    tagColor: null,
  };
}

function SectionHarness() {
  const section = useWorkspaceDocument((state) =>
    getSectionOrThrow(state, SECTION_ID),
  );
  return (
    <SectionContainerContent hasSectionStyleTheme={false} section={section} />
  );
}

function ControlledHarness({
  initialState,
}: {
  initialState: WorkspaceWindowingState;
}) {
  const [state, setState] = useState(initialState);
  return (
    <WorkspaceWindowingContextProvider
      configuration={{
        onStateChange: setState,
        renderers: {},
        state,
        viewport: createWorkspaceWindowViewport({
          height: 720,
          insets: { bottom: 0, left: 40, right: 40, top: 40 },
          width: 1_200,
        }),
      }}
    >
      <SectionHarness />
      <IntegratedWorkspaceWindowManager />
    </WorkspaceWindowingContextProvider>
  );
}

describe("workspace section/window bridge", () => {
  let host: HTMLDivElement;
  let root: Root;
  let workspace: WorkspaceTestHost;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 1_200, 720),
    );
    workspace = createWorkspaceTestHost();
    registerWorkspaceCommands(workspace.host, []);
    registerSectionKinds(workspace.host, {
      ordinary: {
        renderContent: (section) =>
          createElement(
            "output",
            { "data-testid": "registered-body" },
            `${section.name} body`,
          ),
      },
    });
    const section = makeSection();
    loadWorkspaceDocument(workspace.host, {
      activeIds: [],
      sections: { [SECTION_ID]: section },
      topLevelSections: {
        [SECTION_ID]: { h: 260, w: 420, x: 0, y: 0, zIndex: 0 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      savedViews: null,
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    workspace.host.dispose();
    vi.restoreAllMocks();
  });

  async function mount(initialState = createWorkspaceWindowingState()) {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <ControlledHarness initialState={initialState} />
        </WorkspaceTestProvider>,
      );
    });
  }

  function getButton(testId: string): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(
      `[data-testid="${testId}"]`,
    );
    if (!button) throw new Error(`Expected ${testId}.`);
    return button;
  }

  it("drags a floating section window from its displayed section title", async () => {
    await mount();
    await act(async () => getButton("section-window-toggle").click());

    const floatingWindow = host.querySelector<HTMLElement>(
      '[data-testid="workspace-window-manager-window"]',
    );
    const title = floatingWindow?.querySelector<HTMLElement>(
      '[role="button"][aria-label="Research Notes, edit section title"]',
    );
    if (!floatingWindow || !title) {
      throw new Error("Expected the floating section window and its title.");
    }
    const initialLeft = Number.parseFloat(floatingWindow.style.left);
    const initialTop = Number.parseFloat(floatingWindow.style.top);

    await act(async () => {
      title.dispatchEvent(
        createPointerEvent("pointerdown", {
          clientX: 500,
          clientY: 100,
          pointerId: 7,
        }),
      );
      title.dispatchEvent(
        createPointerEvent("pointermove", {
          clientX: 580,
          clientY: 140,
          pointerId: 7,
        }),
      );
      title.dispatchEvent(
        createPointerEvent("pointerup", {
          clientX: 580,
          clientY: 140,
          pointerId: 7,
        }),
      );
    });

    expect(Number.parseFloat(floatingWindow.style.left)).toBe(initialLeft + 80);
    expect(Number.parseFloat(floatingWindow.style.top)).toBe(initialTop + 40);
  });

  it("moves one registered body through floating, docked, and canvas ownership", async () => {
    await mount();

    expect(
      host.querySelectorAll('[data-testid="registered-body"]'),
    ).toHaveLength(1);
    expect(getButton("section-window-toggle").ariaLabel).toBe(
      "Open section in floating window",
    );

    await act(async () => getButton("section-window-toggle").click());
    expect(
      host.querySelectorAll('[data-testid="registered-body"]'),
    ).toHaveLength(1);
    expect(
      host.querySelector('[data-testid="section-window-surface"]'),
    ).not.toBeNull();
    expect(host.textContent).toContain("Research Notes moved to a window");
    expect(getButton("section-window-toggle").ariaLabel).toBe(
      "Show section in canvas",
    );

    await act(async () => getButton("workspace-window-dock").click());
    expect(
      host.querySelector('[data-testid="workspace-bottom-dock-window-panel"]'),
    ).not.toBeNull();
    expect(
      host.querySelectorAll('[data-testid="registered-body"]'),
    ).toHaveLength(1);

    await act(async () =>
      getButton("workspace-bottom-dock-window-show-in-canvas").click(),
    );
    expect(
      host.querySelectorAll('[data-testid="registered-body"]'),
    ).toHaveLength(1);
    expect(
      host.querySelector('[data-testid="section-canvas-window-placeholder"]'),
    ).toBeNull();
  });

  it("keeps a closed external binding in the placeholder and Focus reopens it", async () => {
    await mount(
      createWorkspaceWindowingState({
        windows: [
          {
            bounds: { height: 400, width: 600, x: 100, y: 100 },
            contentId: `workspace-section:${SECTION_ID}`,
            id: "section-window",
            isClosed: true,
            rendererData: null,
            sectionId: SECTION_ID,
            surfaceKind: "workspace_section",
            title: "Research Notes",
          },
        ],
      }),
    );

    expect(host.querySelector('[data-testid="registered-body"]')).toBeNull();
    expect(host.textContent).toContain("Research Notes moved to a window");
    await act(async () =>
      getButton("section-window-placeholder-focus").click(),
    );
    expect(host.textContent).toContain("Research Notes moved to a window");
    expect(getButton("section-window-placeholder-focus")).not.toBeNull();
    expect(
      host.querySelectorAll('[data-testid="registered-body"]'),
    ).toHaveLength(1);
  });
});
