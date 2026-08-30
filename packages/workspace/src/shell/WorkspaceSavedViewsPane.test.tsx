/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { act, createRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { enableWorkspaceSavedViews } from "../saved-views/operations";
import { isWorkspaceSavedViewEditing } from "../saved-views/editingState";
import { WorkspaceSavedViewsPane } from "./WorkspaceSavedViewsPane";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function section(id: string, name: string, children: Array<string> = []) {
  return {
    children,
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: children.length > 0 ? "group" : "leaf",
    name,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 100, width: 200 },
    styleColor: null,
    tagColor: null,
  };
}

function loadDocument(): void {
  registerSectionKinds(testWorkspace.host, {
    leaf: { renderContent: () => null },
  });
  loadWorkspaceDocument(testWorkspace.host, {
    activeIds: [],
    savedViews: null,
    sections: {
      child: section("child", "Child"),
      group: section("group", "Group", ["child"]),
      side: section("side", "Side"),
    },
    topLevelSections: {
      group: { h: 200, w: 300, x: 0, y: 0, zIndex: 0 },
      side: { h: 100, w: 200, x: 400, y: 0, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  });
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!setter) {
    throw new Error("Expected the native input value setter.");
  }
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("WorkspaceSavedViewsPane", () => {
  let container: HTMLDivElement;
  let root: Root;
  let initialFocusRef: RefObject<HTMLElement | null>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    initialFocusRef = createRef<HTMLElement>();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    registerSectionKinds(testWorkspace.host, {});
  });

  async function render(showTabBookmarks = false): Promise<void> {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <WorkspaceSavedViewsPane
            initialFocusRef={initialFocusRef}
            showTabBookmarks={showTabBookmarks}
          />
        </WorkspaceTestProvider>,
      );
    });
  }

  function getButton(label: string): HTMLButtonElement {
    const matching = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find(
      (candidate) =>
        candidate.getAttribute("aria-label") === label ||
        candidate.textContent === label,
    );
    if (!matching) {
      throw new Error(`Expected button ${label}.`);
    }
    return matching;
  }

  function getStatus(): HTMLElement {
    const status = container.querySelector<HTMLElement>("[aria-live='polite']");
    if (!status) {
      throw new Error("Expected saved-views status region.");
    }
    return status;
  }

  function getElement<ElementType extends Element>(
    selector: string,
    label: string,
  ): ElementType {
    const element = container.querySelector<ElementType>(selector);
    if (!element) {
      throw new Error(`Expected ${label}.`);
    }
    return element;
  }

  it("renders an unavailable state with a stable focus target", async () => {
    await render();

    const pane = container.querySelector<HTMLElement>(
      '[data-testid="workspace-saved-views-pane"]',
    );
    expect(pane?.textContent).toContain(
      "Saved views are not enabled for this workspace.",
    );
    expect(pane?.tabIndex).toBe(0);
    expect(initialFocusRef.current).toBe(pane);
  });

  it("keeps switching compact and reveals management in edit mode", async () => {
    loadDocument();
    enableWorkspaceSavedViews(testWorkspace.host, {
      id: "overview",
      name: "Overview",
    });
    await render();

    expect(getButton("Overview").getAttribute("aria-pressed")).toBe("true");
    expect(initialFocusRef.current).toBe(getButton("Create view"));
    expect(
      container.querySelector('[aria-label="Delete Overview"]'),
    ).toBeNull();
    expect(
      container.querySelector('[aria-label="Show Overview as a tab"]'),
    ).toBeNull();
    await act(async () => {
      getButton("Edit saved view").click();
    });
    expect(getButton("Delete Overview").disabled).toBe(true);
    expect(getButton("Delete Overview").title).toBe(
      "The last saved view cannot be deleted.",
    );
    await act(async () => {
      getButton("Finish editing saved view").click();
    });

    await act(async () => {
      getButton("Create view").click();
    });
    expect(testWorkspace.document.getState().savedViews?.activeViewId).toBe(
      "view-1",
    );
    expect(getButton("View 1").getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      getButton("Edit saved view").click();
    });
    expect(
      container
        .querySelector('[data-testid="workspace-saved-views-pane"]')
        ?.getAttribute("data-workspace-saved-view-editing"),
    ).toBe("true");
    expect(container.textContent).toContain(
      "Dimmed sections are hidden from this view.",
    );
    expect(container.textContent).not.toContain("Full list");
    expect(getButton("Delete Overview").disabled).toBe(false);

    const nameInput = getElement<HTMLInputElement>(
      'input[aria-label="Rename View 1"]',
      "saved-view name input",
    );
    await act(async () => {
      nameInput.focus();
      setInputValue(nameInput, "Dashboard");
      nameInput.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
    });
    expect(
      getElement<HTMLInputElement>(
        'input[aria-label="Rename Dashboard"]',
        "renamed saved-view input",
      ).value,
    ).toBe("Dashboard");

    const overviewRow = getElement<HTMLElement>(
      '[data-workspace-saved-view-id="overview"]',
      "Overview row",
    );
    await act(async () => {
      getButton("Reorder Dashboard").dispatchEvent(
        new Event("dragstart", { bubbles: true }),
      );
    });
    await act(async () => {
      overviewRow.dispatchEvent(new Event("drop", { bubbles: true }));
    });
    expect(
      testWorkspace.document.getState().savedViews?.views["view-1"]?.sortIndex,
    ).toBe(0);
    expect(
      testWorkspace.document.getState().savedViews?.views.overview?.sortIndex,
    ).toBe(1);

    await act(async () => {
      getButton("Activate Overview").click();
    });
    expect(testWorkspace.document.getState().savedViews?.activeViewId).toBe(
      "overview",
    );
    expect(getStatus().textContent).toBe("Overview is now active.");

    await act(async () => {
      getButton("Finish editing saved view").click();
    });
    expect(
      container.querySelector('input[aria-label="Rename Overview"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="workspace-saved-view-drag-handle"]',
      ),
    ).toBeNull();
  });

  it("shows bookmark controls only when saved-view tabs are enabled", async () => {
    loadDocument();
    enableWorkspaceSavedViews(testWorkspace.host, {
      id: "overview",
      name: "Overview",
    });
    await render(true);

    expect(
      container.querySelector('[aria-label="Show Overview as a tab"]'),
    ).toBeNull();
    await act(async () => {
      getButton("Edit saved view").click();
    });
    await act(async () => {
      getButton("Show Overview as a tab").click();
    });

    expect(
      testWorkspace.document.getState().savedViews?.views.overview?.isTab,
    ).toBe(true);
    expect(
      getButton("Hide Overview from tabs").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(getStatus().textContent).toBe("Overview is shown as a tab.");
  });

  it("ends edit mode when the pane is removed", async () => {
    loadDocument();
    enableWorkspaceSavedViews(testWorkspace.host, {
      id: "overview",
      name: "Overview",
    });
    await render();
    await act(async () => {
      getButton("Edit saved view").click();
    });
    expect(isWorkspaceSavedViewEditing(testWorkspace.host)).toBe(true);

    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <div />
        </WorkspaceTestProvider>,
      );
    });
    expect(isWorkspaceSavedViewEditing(testWorkspace.host)).toBe(false);
  });

  it("restores invalid or canceled names and updates disabled states", async () => {
    loadDocument();
    enableWorkspaceSavedViews(testWorkspace.host, {
      id: "overview",
      name: "Overview",
    });
    await render();

    await act(async () => {
      getButton("Edit saved view").click();
    });
    const nameInput = getElement<HTMLInputElement>(
      'input[aria-label="Rename Overview"]',
      "saved-view name input",
    );
    await act(async () => {
      nameInput.focus();
      setInputValue(nameInput, "");
    });
    expect(container.querySelector("[role='alert']")?.textContent).toBe(
      "A saved view name is required.",
    );
    await act(async () => {
      nameInput.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
    });
    expect(nameInput.value).toBe("Overview");
    expect(container.querySelector("[role='alert']")).toBeNull();

    await act(async () => {
      nameInput.focus();
      setInputValue(nameInput, "Changed");
    });
    await act(async () => {
      nameInput.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });
    expect(
      testWorkspace.document.getState().savedViews?.views.overview?.name,
    ).toBe("Overview");

    await act(async () => {
      testWorkspace.capabilities.setState({ canEditLayout: false });
    });
    expect(getButton("Create view").disabled).toBe(true);
    expect(getButton("Overview").disabled).toBe(false);
    expect(container.textContent).toContain(
      "Editing saved views requires permission to edit workspace layout.",
    );
  });
});
