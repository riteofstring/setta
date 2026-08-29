/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceCommands } from "../commands/workspaceCommandRegistry";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import type { WorkspaceSection } from "../document/types";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";
import {
  WorkspaceSectionWindowSurface,
  type WorkspaceSectionWindowSurfaceProps,
} from "./WorkspaceSectionWindowSurface";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SECTION_ID = "section-1";

function makeSection(
  name: string,
  overrides: Partial<WorkspaceSection> = {},
): WorkspaceSection {
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
    ...overrides,
  };
}

function loadTestDocument(
  workspace: WorkspaceTestHost,
  name: string,
  overrides: Partial<WorkspaceSection> = {},
): void {
  loadWorkspaceDocument(workspace.host, {
    activeIds: [],
    sections: { [SECTION_ID]: makeSection(name, overrides) },
    topLevelSections: {
      [SECTION_ID]: { h: 96, w: 224, x: 0, y: 0, zIndex: 0 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  });
}

describe("WorkspaceSectionWindowSurface", () => {
  let host: HTMLDivElement;
  let root: Root;
  let workspace: WorkspaceTestHost;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    workspace = createWorkspaceTestHost();
    registerWorkspaceCommands(workspace.host, []);
    registerSectionKinds(workspace.host, {
      text: {
        renderContent: (section) =>
          createElement(
            "output",
            { "data-testid": "registered-section-body" },
            `${section.name} body`,
          ),
      },
    });
    loadTestDocument(workspace, "Original section");
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    workspace.host.dispose();
  });

  async function mount(
    props: Partial<WorkspaceSectionWindowSurfaceProps> = {},
  ): Promise<void> {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <WorkspaceSectionWindowSurface sectionId={SECTION_ID} {...props} />
        </WorkspaceTestProvider>,
      );
    });
  }

  function getSurface(): HTMLElement {
    const surface = host.querySelector<HTMLElement>(
      '[data-testid="section-window-surface"]',
    );
    if (!surface) {
      throw new Error("Expected the section window surface.");
    }
    return surface;
  }

  it("shares the registered body and renders only supplied window header actions", async () => {
    const onHeaderPointerDown = vi.fn();
    const onWindowAction = vi.fn();
    await mount({
      headerActions: createElement(
        "button",
        {
          "data-testid": "window-only-action",
          onClick: onWindowAction,
          type: "button",
        },
        "Window action",
      ),
      headerProps: {
        "data-testid": "section-window-header",
        className: "window-header-drag-handle",
        onPointerDown: onHeaderPointerDown,
      },
    });

    const surface = getSurface();
    const header = host.querySelector<HTMLElement>(
      '[data-testid="section-window-header"]',
    );
    expect(surface.dataset.sectionId).toBe(SECTION_ID);
    expect(surface.dataset.sectionType).toBe("text");
    expect(header?.className).toContain("section-title");
    expect(header?.className).toContain("window-header-drag-handle");
    expect(host.textContent).toContain("Original section");
    expect(
      host.querySelector('[data-testid="registered-section-body"]')?.textContent,
    ).toBe("Original section body");
    expect(host.querySelector('[data-testid="window-only-action"]')).not.toBeNull();
    expect(
      host.querySelector('[aria-label="Lock position and size"]'),
    ).toBeNull();
    expect(host.querySelector('[aria-label="Minimize section"]')).toBeNull();
    expect(host.querySelector('[aria-label="Delete section"]')).toBeNull();
    expect(host.querySelector('[data-testid="section-window-toggle"]')).toBeNull();
    expect(host.querySelector(".react-resizable")).toBeNull();
    expect(host.querySelector(".section-resize-handle")).toBeNull();
    expect(workspace.sectionRefs.getState().selfOnly[SECTION_ID]).toBeUndefined();
    expect(workspace.sectionRefs.getState().withNested[SECTION_ID]).toBeUndefined();

    await act(async () => {
      header?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      host
        .querySelector<HTMLButtonElement>('[data-testid="window-only-action"]')
        ?.click();
    });
    expect(onHeaderPointerDown).toHaveBeenCalledOnce();
    expect(onWindowAction).toHaveBeenCalledOnce();
  });

  it("keeps the live document title, body, and section style theme in sync", async () => {
    await mount();
    await act(async () => {
      loadTestDocument(workspace, "Renamed section", {
        styleColor: "#245c85",
      });
    });

    const surface = getSurface();
    expect(host.textContent).toContain("Renamed section");
    expect(
      host.querySelector('[data-testid="registered-section-body"]')?.textContent,
    ).toBe("Renamed section body");
    expect(surface.style.getPropertyValue("--setta-section-style-bg")).not.toBe(
      "",
    );
    expect(surface.className).toContain(
      "!border-[color:var(--setta-section-style-border)]",
    );
  });
});
