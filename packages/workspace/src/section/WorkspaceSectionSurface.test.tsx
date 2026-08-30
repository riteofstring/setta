/* @vitest-environment jsdom */

import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceCommands } from "../commands/workspaceCommandRegistry";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import type {
  WorkspaceDocumentInput,
  WorkspaceSection,
} from "../document/types";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";
import { WorkspaceSectionSurface } from "./WorkspaceSectionSurface";

type WorkspaceSectionSurfaceProps = ComponentProps<
  typeof WorkspaceSectionSurface
>;

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SECTION_ID = "section-1";

function makeSection(
  id: string,
  overrides: Partial<WorkspaceSection> = {},
): WorkspaceSection {
  return {
    children: [],
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: "text",
    name: id,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 96, width: 224 },
    styleColor: null,
    tagColor: null,
    ...overrides,
  };
}

function loadDocument(
  workspace: WorkspaceTestHost,
  sections: Record<string, WorkspaceSection>,
  topLevelSections: WorkspaceDocumentInput["topLevelSections"],
): void {
  loadWorkspaceDocument(workspace.host, {
    activeIds: [],
    savedViews: null,
    sections,
    topLevelSections,
    viewport: { x: 0, y: 0, zoom: 1 },
  });
}

function getRequiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Expected an element matching ${selector}.`);
  }
  return element;
}

describe("WorkspaceSectionSurface", () => {
  let container: HTMLDivElement;
  let root: Root;
  let workspace: WorkspaceTestHost;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    workspace = createWorkspaceTestHost();
    registerWorkspaceCommands(workspace.host, []);
    registerSectionKinds(workspace.host, {
      list: {
        nestedSections: "vertical",
        renderContent: (section) =>
          createElement(
            "output",
            { "data-testid": `registered-section-body-${section.id}` },
            `${section.name} body`,
          ),
      },
      text: {
        renderContent: (section) =>
          createElement(
            "output",
            { "data-testid": `registered-section-body-${section.id}` },
            `${section.name} body`,
          ),
      },
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    workspace.host.dispose();
  });

  async function mount(
    props: Partial<WorkspaceSectionSurfaceProps> = {},
  ): Promise<void> {
    const { sectionId = SECTION_ID, ...surfaceProps } = props;
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <WorkspaceSectionSurface sectionId={sectionId} {...surfaceProps} />
        </WorkspaceTestProvider>,
      );
    });
  }

  it("keeps managed section window leaf chrome and application header actions", async () => {
    loadDocument(
      workspace,
      {
        [SECTION_ID]: makeSection(SECTION_ID, {
          name: "Original section",
        }),
      },
      {
        [SECTION_ID]: { h: 96, w: 224, x: 0, y: 0, zIndex: 0 },
      },
    );
    const onHeaderPointerDown = vi.fn();
    const onWindowAction = vi.fn();
    await mount({
      dataTestId: "section-window-surface",
      dataWorkspaceSectionWindowSurface: true,
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

    const surface = getRequiredElement(
      container,
      '[data-testid="section-window-surface"]',
    );
    const header = getRequiredElement(
      container,
      '[data-testid="section-window-header"]',
    );
    expect(surface.dataset.sectionId).toBe(SECTION_ID);
    expect(surface.dataset.sectionType).toBe("text");
    expect(surface.dataset.workspaceSectionWindowSurface).toBe("true");
    expect(header.className).toContain("section-title");
    expect(header.className).toContain("window-header-drag-handle");
    expect(
      container.querySelector(
        `[data-testid="registered-section-body-${SECTION_ID}"]`,
      )?.textContent,
    ).toBe("Original section body");
    expect(
      container.querySelector('[aria-label="Lock position and size"]'),
    ).toBeNull();
    expect(
      container.querySelector('[aria-label="Minimize section"]'),
    ).toBeNull();
    expect(container.querySelector('[aria-label="Delete section"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="window-only-action"]'),
    ).not.toBeNull();
    expect(
      workspace.sectionRefs.getState().selfOnly[SECTION_ID],
    ).toBeUndefined();
    expect(
      workspace.sectionRefs.getState().withNested[SECTION_ID],
    ).toBeUndefined();

    await act(async () => {
      header.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      getRequiredElement(
        container,
        '[data-testid="window-only-action"]',
      ).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onHeaderPointerDown).toHaveBeenCalledOnce();
    expect(onWindowAction).toHaveBeenCalledOnce();
  });

  it("keeps the managed title, body, and section style theme in sync", async () => {
    loadDocument(
      workspace,
      {
        [SECTION_ID]: makeSection(SECTION_ID, {
          name: "Original section",
        }),
      },
      {
        [SECTION_ID]: { h: 96, w: 224, x: 0, y: 0, zIndex: 0 },
      },
    );
    await mount({ dataTestId: "section-window-surface" });

    await act(async () => {
      loadDocument(
        workspace,
        {
          [SECTION_ID]: makeSection(SECTION_ID, {
            name: "Renamed section",
            styleColor: "#245c85",
          }),
        },
        {
          [SECTION_ID]: { h: 96, w: 224, x: 0, y: 0, zIndex: 0 },
        },
      );
    });

    const surface = getRequiredElement(
      container,
      '[data-testid="section-window-surface"]',
    );
    expect(container.textContent).toContain("Renamed section");
    expect(
      container.querySelector(
        `[data-testid="registered-section-body-${SECTION_ID}"]`,
      )?.textContent,
    ).toBe("Renamed section body");
    expect(surface.style.getPropertyValue("--setta-section-style-bg")).not.toBe(
      "",
    );
    expect(surface.className).toContain(
      "!border-[color:var(--setta-section-style-border)]",
    );
  });

  it("keeps owned descendants out of the shared managed surface by default", async () => {
    loadDocument(
      workspace,
      {
        list: makeSection("list", {
          children: ["child"],
          kind: "list",
          name: "Task list",
        }),
        child: makeSection("child", { name: "List child" }),
      },
      {
        list: { h: 180, w: 320, x: 0, y: 0, zIndex: 0 },
      },
    );
    await mount({ sectionId: "list" });

    expect(
      container.querySelector('[data-testid="registered-section-body-list"]')
        ?.textContent,
    ).toBe("Task list body");
    expect(
      container.querySelector('[data-sortable-section-id="child"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="registered-section-body-child"]'),
    ).toBeNull();
  });
});
