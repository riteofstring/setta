/* @vitest-environment jsdom */

import {
  createWorkspaceHost,
  createWorkspaceShellViewState,
  DEFAULT_SECTION_TAG_COLOR_PALETTE,
  WorkspaceProvider,
  type WorkspaceHost,
  type WorkspaceShellViewState,
} from "@setta/workspace";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playgroundDocument } from "./playgroundDocument";
import { PlaygroundWindowingDemo } from "./PlaygroundWindowingDemo";
import {
  PLAYGROUND_INITIAL_ITEM_DIAGNOSTICS,
  registerPlaygroundSectionKinds,
} from "./sectionKinds";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createVisibleWindowSpacesViewState(): WorkspaceShellViewState {
  const initial = createWorkspaceShellViewState({
    trailingTabId: "host-window-spaces",
  });
  return {
    ...initial,
    trailing: { ...initial.trailing, visible: true },
  };
}

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
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  return event;
}

function flushDeferredInteraction(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function requireValue<Value>(
  value: Value | null | undefined,
  description: string,
): Value {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${description}.`);
  }
  return value;
}

function requireElement<ElementType extends Element>(
  root: ParentNode,
  selector: string,
  description: string,
): ElementType {
  return requireValue(root.querySelector<ElementType>(selector), description);
}

function parseDiagnosticEntries(log: string): Array<Record<string, unknown>> {
  return log
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function WindowingDemoHarness() {
  const [shellViewState, setShellViewState] = useState(
    createVisibleWindowSpacesViewState,
  );
  return (
    <PlaygroundWindowingDemo
      baseTrailingTabs={[]}
      itemDiagnostics={PLAYGROUND_INITIAL_ITEM_DIAGNOSTICS}
      leadingPaneShiftsCanvas={false}
      leadingTabs={[]}
      onShellViewStateChange={setShellViewState}
      sectionTagColorPalette={DEFAULT_SECTION_TAG_COLOR_PALETTE}
      shellViewState={shellViewState}
    />
  );
}

describe("playground floating-window demo", () => {
  let host: HTMLDivElement;
  let root: Root;
  let workspaceHost: WorkspaceHost;

  beforeEach(async () => {
    globalThis.sessionStorage.clear();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getPlaygroundTestBounds(this: HTMLElement) {
        if (
          this.classList.contains("playground-workspace") ||
          this.classList.contains("react-flow") ||
          this.dataset.workspaceWindowManager === "true"
        ) {
          return new DOMRect(0, 0, 1_600, 720);
        }
        return new DOMRect();
      },
    );
    workspaceHost = createWorkspaceHost();
    registerPlaygroundSectionKinds(workspaceHost);
    workspaceHost.loadDocument(playgroundDocument);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <WorkspaceProvider host={workspaceHost}>
          <WindowingDemoHarness />
        </WorkspaceProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    workspaceHost.dispose();
    vi.restoreAllMocks();
  });

  async function click(selector: string): Promise<void> {
    const button = host.querySelector<HTMLButtonElement>(selector);
    if (!button) {
      throw new Error(`Expected ${selector} to be rendered.`);
    }
    await act(async () => {
      button.click();
      await flushDeferredInteraction();
    });
  }

  it("records section-window drag acceptance and canvas-owned wheel routing", async () => {
    await click('[data-testid="playground-window-diagnostics-toggle"]');
    await click(
      '[data-section-id="idle-leaf"] [data-testid="section-window-toggle"]',
    );

    const floatingSection = requireElement<HTMLElement>(
      host,
      '[data-testid="workspace-window-manager-window"] [data-testid="section-window-surface"][data-section-id="idle-leaf"]',
      "the external Idle leaf window",
    );
    const floatingWindow = requireValue(
      floatingSection.closest<HTMLElement>(
        '[data-testid="workspace-window-manager-window"]',
      ),
      "the external Idle leaf window frame",
    );
    const title = requireElement<HTMLElement>(
      floatingWindow,
      '[data-setta-workspace-section-title-display="true"]',
      "the external Idle leaf window title",
    );
    const viewport = requireElement<HTMLElement>(
      host,
      ".react-flow__viewport",
      "the canvas viewport",
    );
    const transformBeforeWheel = viewport.style.transform;
    let wheelEvent: WheelEvent | undefined;

    await act(async () => {
      title.dispatchEvent(
        createPointerEvent("pointerdown", {
          clientX: 420,
          clientY: 120,
          pointerId: 13,
        }),
      );
      title.dispatchEvent(
        createPointerEvent("pointermove", {
          clientX: 475,
          clientY: 145,
          pointerId: 13,
        }),
      );
      title.dispatchEvent(
        createPointerEvent("pointerup", {
          clientX: 475,
          clientY: 145,
          pointerId: 13,
        }),
      );
      await flushDeferredInteraction();
    });
    const currentFloatingSection = requireElement<HTMLElement>(
      host,
      '[data-testid="workspace-window-manager-window"] [data-testid="section-window-surface"][data-section-id="idle-leaf"]',
      "the moved external Idle leaf window",
    );
    await act(async () => {
      wheelEvent = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: 42,
        deltaY: 3,
      });
      currentFloatingSection.dispatchEvent(wheelEvent);
      await Promise.resolve();
    });

    const log = requireElement<HTMLTextAreaElement>(
      host,
      '[aria-label="Window interaction diagnostic log"]',
      "recorded window diagnostics",
    ).value;
    const entries = parseDiagnosticEntries(log);

    expect(
      entries.find((entry) => entry["event"] === "pointerdown"),
    ).toMatchObject({
      defaultPrevented: true,
      surface: "section",
      target: { isSectionTitleDisplay: true },
    });
    expect(
      entries.find((entry) => entry["event"] === "pointerup"),
    ).toMatchObject({
      pointer: {
        gesture: { deltaX: 55, deltaY: 25, moveCount: 1 },
      },
    });
    expect(
      entries.find((entry) => entry["event"] === "pointermove"),
    ).toMatchObject({
      pointer: { clientX: 475, clientY: 145 },
      surface: "section",
      windowBounds: expect.objectContaining({
        height: expect.any(Number),
        left: expect.any(Number),
        top: expect.any(Number),
        width: expect.any(Number),
      }),
    });
    expect(wheelEvent?.defaultPrevented).toBe(true);
    expect(viewport.style.transform).not.toBe(transformBeforeWheel);
    expect(log).not.toContain("Generic renderer");
  });

  it("renders arbitrary content, reopens a closed demo window, and restores a host snapshot", async () => {
    expect(
      host.querySelectorAll('[data-testid="workspace-window-manager-window"]'),
    ).toHaveLength(2);
    expect(host.textContent).toContain("Generic renderer");

    await click('[aria-label="Close Reference note"]');
    expect(
      host.querySelectorAll('[data-testid="workspace-window-manager-window"]'),
    ).toHaveLength(1);

    await click(".playground-window-spaces-host-pane .playground-pane-action");
    expect(
      host.querySelectorAll('[data-testid="workspace-window-manager-window"]'),
    ).toHaveLength(2);

    await click('[data-testid="workspace-window-space-save"]');
    expect(
      host.querySelectorAll('[data-testid="workspace-window-space-row"]'),
    ).toHaveLength(1);

    await click('[aria-label="Close Reference note"]');
    await click('[data-testid="workspace-window-space-restore"]');
    expect(
      host.querySelectorAll('[data-testid="workspace-window-manager-window"]'),
    ).toHaveLength(2);
  });

  it("restores a minimized demo window from the manager recovery strip", async () => {
    await click('[aria-label="Minimize Reference note"]');

    expect(
      host.querySelectorAll('[data-testid="workspace-window-manager-window"]'),
    ).toHaveLength(1);
    const recovery = host.querySelector<HTMLButtonElement>(
      '[aria-label="Restore Reference note"]',
    );
    if (!recovery)
      throw new Error("Expected the minimized-window recovery pill.");
    expect(recovery.closest("nav")?.getAttribute("aria-label")).toBe(
      "Window recovery",
    );
    expect(recovery.closest<HTMLElement>("nav")?.style.insetInlineEnd).toBe(
      "500px",
    );

    await act(async () => {
      recovery.click();
      await flushDeferredInteraction();
    });

    expect(
      host.querySelectorAll('[data-testid="workspace-window-manager-window"]'),
    ).toHaveLength(2);
    expect(
      host.querySelector(
        '[data-workspace-window-id="playground-reference-note-window"][data-focused="true"]',
      ),
    ).not.toBeNull();
    expect(
      host.querySelector('[aria-label="Restore Reference note"]'),
    ).toBeNull();
  });

  it("moves a real canvas section through the reference window placements and recovery paths", async () => {
    const sectionSelector = '[data-section-id="idle-leaf"]';
    await click(`${sectionSelector} [data-testid="section-window-toggle"]`);

    expect(
      host.querySelector(
        '[data-testid="section-canvas-window-placeholder"][data-workspace-section-id="idle-leaf"]',
      ),
    ).not.toBeNull();
    expect(
      host.querySelector(
        '[data-testid="workspace-window-manager-window"] [data-testid="section-window-surface"][data-section-id="idle-leaf"]',
      ),
    ).not.toBeNull();

    const clickSectionWindowAction = async (testId: string) => {
      await click(
        `[data-testid="section-window-surface"][data-section-id="idle-leaf"] [data-testid="${testId}"]`,
      );
    };
    await clickSectionWindowAction("workspace-window-dock");
    expect(
      host.querySelector(
        '[data-testid="workspace-bottom-dock-window-panel"] [data-testid="section-window-surface"][data-section-id="idle-leaf"]',
      ),
    ).not.toBeNull();

    await clickSectionWindowAction("workspace-bottom-dock-window-maximize");
    await clickSectionWindowAction("workspace-window-restore");
    expect(
      host.querySelector(
        '[data-testid="workspace-bottom-dock-window-panel"] [data-section-id="idle-leaf"]',
      ),
    ).not.toBeNull();

    await clickSectionWindowAction("workspace-bottom-dock-window-undock");
    await clickSectionWindowAction("workspace-window-minimize");
    expect(
      host.querySelector('[aria-label="Restore Idle leaf"]'),
    ).not.toBeNull();
    await click(
      `${sectionSelector} [data-testid="section-window-placeholder-focus"]`,
    );

    await clickSectionWindowAction("workspace-window-close");
    await click(
      '[data-workspace-window-id="workspace-section-window:idle-leaf"] [data-testid="workspace-bottom-dock-manager-reopen"]',
    );
    await clickSectionWindowAction("workspace-window-show-in-canvas");

    expect(
      host.querySelector(
        '[data-testid="section-canvas-window-placeholder"][data-workspace-section-id="idle-leaf"]',
      ),
    ).toBeNull();
    expect(
      host
        .querySelector(
          `${sectionSelector} [data-testid="section-window-toggle"]`,
        )
        ?.getAttribute("aria-label"),
    ).toBe("Open section in floating window");
  });
});
