/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceCommands } from "../commands/workspaceCommandRegistry.js";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument.js";
import { registerSectionKinds } from "../document/sectionKindRegistry.js";
import type {
  WorkspaceDocumentInput,
  WorkspaceSection,
} from "../document/types.js";
import { getWorkspaceHostForElement } from "../workspaceHostInternals.js";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost.js";
import {
  StandaloneWorkspaceSectionSurface,
  type StandaloneWorkspaceSectionSurfaceProps,
} from "./StandaloneWorkspaceSectionSurface.js";

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

function loadLeafDocument(workspace: WorkspaceTestHost): void {
  loadDocument(
    workspace,
    {
      [SECTION_ID]: makeSection(SECTION_ID, { name: "Original section" }),
    },
    {
      [SECTION_ID]: { h: 96, w: 224, x: 0, y: 0, zIndex: 0 },
    },
  );
}

function getRequiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Expected an element matching ${selector}.`);
  }
  return element;
}

describe("StandaloneWorkspaceSectionSurface", () => {
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
    props: Partial<StandaloneWorkspaceSectionSurfaceProps> = {},
  ): Promise<void> {
    const { sectionId = SECTION_ID, ...surfaceProps } = props;
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <StandaloneWorkspaceSectionSurface
            sectionId={sectionId}
            {...surfaceProps}
          />
        </WorkspaceTestProvider>,
      );
    });
  }

  function getSurface(): HTMLElement {
    return getRequiredElement(
      container,
      '[data-testid="standalone-workspace-section-surface"]',
    );
  }

  it("renders a leaf with its root header contract and application actions", async () => {
    loadLeafDocument(workspace);
    const onHeaderPointerDown = vi.fn();
    const onHeaderAction = vi.fn();
    await mount({
      ariaLabel: "Research section",
      className: "focused-section-route",
      headerActions: createElement(
        "button",
        {
          "data-testid": "focused-section-action",
          onClick: onHeaderAction,
          type: "button",
        },
        "Open in canvas",
      ),
      headerProps: {
        "data-testid": "focused-section-header",
        className: "focused-section-header",
        onPointerDown: onHeaderPointerDown,
      },
    });

    const surface = getSurface();
    const header = getRequiredElement(
      container,
      '[data-testid="focused-section-header"]',
    );
    expect(surface.getAttribute("aria-label")).toBe("Research section");
    expect(surface.getAttribute("role")).toBe("region");
    expect(surface.dataset.sectionId).toBe(SECTION_ID);
    expect(surface.dataset.workspaceStandaloneSectionSurface).toBe("true");
    expect(surface.className).toContain("focused-section-route");
    expect(header.className).toContain("section-title");
    expect(header.className).toContain("focused-section-header");
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

    await act(async () => {
      header.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      getRequiredElement(
        container,
        '[data-testid="focused-section-action"]',
      ).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onHeaderPointerDown).toHaveBeenCalledOnce();
    expect(onHeaderAction).toHaveBeenCalledOnce();
  });

  it("renders a package group with its owned descendants", async () => {
    loadDocument(
      workspace,
      {
        group: makeSection("group", {
          children: ["child"],
          kind: "group",
          name: "Research group",
          size: { height: "auto", width: "auto" },
        }),
        child: makeSection("child", { name: "Group child" }),
      },
      {
        group: { h: null, w: null, x: 0, y: 0, zIndex: 0 },
      },
    );
    await mount({ sectionId: "group" });

    const surface = getSurface();
    expect(surface.getAttribute("aria-label")).toBe("Research group");
    expect(surface.textContent).toContain("Research group");
    expect(
      getRequiredElement(surface, '[data-sortable-section-id="child"]'),
    ).not.toBeNull();
    expect(
      surface.querySelector('[data-testid="registered-section-body-child"]')
        ?.textContent,
    ).toBe("Group child body");
  });

  it("renders a nesting-capable registered section body before its descendants", async () => {
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

    const surface = getSurface();
    const body = getRequiredElement(
      surface,
      '[data-testid="registered-section-body-list"]',
    );
    const child = getRequiredElement(
      surface,
      '[data-sortable-section-id="child"]',
    );
    expect(body.textContent).toBe("Task list body");
    expect(child.compareDocumentPosition(body)).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );
    expect(
      surface.querySelector('[aria-label="Focus parent section"]'),
    ).not.toBeNull();
    expect(
      surface.querySelector('[data-testid="registered-section-body-child"]')
        ?.textContent,
    ).toBe("List child body");
  });

  it("registers and unregisters its root with the owning workspace host", async () => {
    loadLeafDocument(workspace);
    await mount();

    const surface = getSurface();
    expect(getWorkspaceHostForElement(surface)).toBe(workspace.host);

    await act(async () => root.render(null));
    expect(getWorkspaceHostForElement(surface)).toBeNull();
  });

  it("propagates missing section lookup failures to the downstream route", async () => {
    loadDocument(workspace, {}, {});

    await expect(mount({ sectionId: "missing" })).rejects.toThrowError(
      "Unknown section missing.",
    );
  });
});
