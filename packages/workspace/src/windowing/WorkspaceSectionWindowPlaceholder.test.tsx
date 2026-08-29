/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import type { WorkspaceSection } from "../document/types";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";
import {
  WorkspaceSectionWindowPlaceholder,
  type WorkspaceSectionWindowPlaceholderProps,
} from "./WorkspaceSectionWindowPlaceholder";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SECTION_ID = "section-1";
const WINDOW_ID = "window-1";

function makeSection(name: string): WorkspaceSection {
  return {
    children: [],
    id: SECTION_ID,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: "text",
    name,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 96, width: 224 },
    styleColor: null,
    tagColor: null,
  };
}

function loadTestDocument(workspace: WorkspaceTestHost, name: string): void {
  loadWorkspaceDocument(workspace.host, {
    activeIds: [],
    sections: { [SECTION_ID]: makeSection(name) },
    topLevelSections: {
      [SECTION_ID]: { h: 96, w: 224, x: 0, y: 0, zIndex: 0 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  });
}

describe("WorkspaceSectionWindowPlaceholder", () => {
  let host: HTMLDivElement;
  let root: Root;
  let workspace: WorkspaceTestHost;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    workspace = createWorkspaceTestHost();
    registerSectionKinds(workspace.host, {
      text: { renderContent: () => null },
    });
    loadTestDocument(workspace, "Original section");
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    workspace.host.dispose();
  });

  async function mount(
    props: Partial<WorkspaceSectionWindowPlaceholderProps> = {},
  ): Promise<void> {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <WorkspaceSectionWindowPlaceholder
            layoutEditable={true}
            onFocusWindow={() => {}}
            onShowInCanvas={() => {}}
            sectionId={SECTION_ID}
            windowId={WINDOW_ID}
            {...props}
          />
        </WorkspaceTestProvider>,
      );
    });
  }

  function getButton(testId: string): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(
      `[data-testid="${testId}"]`,
    );
    if (!button) {
      throw new Error(`Expected ${testId}.`);
    }
    return button;
  }

  it("uses the current document name and reports the main handoff actions", async () => {
    const calls: Array<string> = [];
    const onFocusWindow = vi.fn((windowId: string) => {
      calls.push(`focus:${windowId}`);
    });
    const onShowInCanvas = vi.fn((windowId: string) => {
      calls.push(`canvas:${windowId}`);
    });
    await mount({ onFocusWindow, onShowInCanvas });

    const placeholder = host.querySelector<HTMLElement>(
      '[data-testid="section-window-placeholder"]',
    );
    expect(placeholder?.dataset.workspaceSectionId).toBe(SECTION_ID);
    expect(placeholder?.dataset.workspaceSectionWindowId).toBe(WINDOW_ID);
    expect(placeholder?.classList.contains("section-main-full-w")).toBe(true);
    expect(host.textContent).toContain("Original section moved to a window");
    expect(host.textContent).toContain(
      "Focus the external window or return this section to the canvas.",
    );
    expect(
      getButton("section-window-placeholder-focus").getAttribute("aria-label"),
    ).toBe("Focus Original section window");
    expect(
      getButton("section-window-placeholder-restore").getAttribute(
        "aria-label",
      ),
    ).toBe("Show Original section in canvas");

    await act(async () => {
      getButton("section-window-placeholder-focus").click();
      getButton("section-window-placeholder-restore").click();
    });
    expect(calls).toEqual([`focus:${WINDOW_ID}`, `canvas:${WINDOW_ID}`]);

    await act(async () => loadTestDocument(workspace, "Renamed section"));
    expect(host.textContent).toContain("Renamed section moved to a window");
  });

  it("keeps Focus while hiding the canvas mutation and using read-only copy", async () => {
    const onFocusWindow = vi.fn();
    const onShowInCanvas = vi.fn();
    await mount({
      layoutEditable: false,
      onFocusWindow,
      onShowInCanvas,
    });

    expect(host.textContent).toContain("Focus the external window from here.");
    expect(
      host.querySelector('[data-testid="section-window-placeholder-restore"]'),
    ).toBeNull();
    expect(getButton("section-window-placeholder-focus")).not.toBeNull();

    await act(async () => {
      getButton("section-window-placeholder-focus").click();
    });
    expect(onFocusWindow).toHaveBeenCalledWith(WINDOW_ID);
    expect(onShowInCanvas).not.toHaveBeenCalled();
  });

  it("uses the main fallback name while a section is absent", async () => {
    await act(async () => {
      loadWorkspaceDocument(workspace.host, {
        activeIds: [],
        sections: {},
        topLevelSections: {},
        viewport: { x: 0, y: 0, zoom: 1 },
      });
    });
    await mount();

    expect(host.textContent).toContain("Section moved to a window");
  });
});
