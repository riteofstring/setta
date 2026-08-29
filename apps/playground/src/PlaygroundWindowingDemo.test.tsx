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
    await act(async () => button.click());
  }

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
      "Window recovery and manager",
    );
    expect(recovery.closest<HTMLElement>("nav")?.style.insetInlineEnd).toBe(
      "500px",
    );

    await act(async () => recovery.click());

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
