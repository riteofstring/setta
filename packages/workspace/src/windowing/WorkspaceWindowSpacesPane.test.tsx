/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WorkspaceWindowSpacesPane,
  type WorkspaceWindowSpacesPaneProps,
} from "./WorkspaceWindowSpacesPane.js";
import {
  createWorkspaceWindowingState,
  type WorkspaceFloatingWindowInput,
  type WorkspaceWindowViewport,
} from "./windowingTypes.js";
import {
  createWorkspaceWindowSpace,
  type WorkspaceWindowSpace,
} from "./windowSpaces.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const viewport: WorkspaceWindowViewport = {
  height: 800,
  insets: { bottom: 0, left: 0, right: 0, top: 0 },
  width: 1_000,
};

function createWindow(
  id: string,
  overrides: Partial<WorkspaceFloatingWindowInput> = {},
): WorkspaceFloatingWindowInput {
  return {
    bounds: { height: 300, width: 500, x: 100, y: 120 },
    contentId: `content-${id}`,
    id,
    rendererData: {},
    surfaceKind: "example",
    title: `Window ${id}`,
    ...overrides,
  };
}

function createSpace(
  id: string,
  name: string,
  order: number,
): WorkspaceWindowSpace {
  return createWorkspaceWindowSpace({
    id,
    name,
    order,
    windows: [
      {
        contentId: `content-${id}`,
        id: `window-${id}`,
        normalizedBounds: { height: 1, width: 0.5, x: 0, y: 0 },
        rendererData: { id },
        sectionId: null,
        surfaceKind: "example",
        title: `${name} window`,
        zIndex: order,
      },
    ],
  });
}

describe("WorkspaceWindowSpacesPane", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function mount(
    props: Partial<WorkspaceWindowSpacesPaneProps> = {},
  ): Promise<void> {
    await act(async () => {
      root.render(
        <WorkspaceWindowSpacesPane
          onStateChange={() => {}}
          spaces={[]}
          state={createWorkspaceWindowingState()}
          viewport={viewport}
          {...props}
        />,
      );
    });
  }

  function getButton(testId: string): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(
      `[data-testid="${testId}"]`,
    );
    if (!button) {
      throw new Error(`Expected button ${testId}.`);
    }
    return button;
  }

  function setNativeInputValue(input: HTMLInputElement, value: string): void {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!valueSetter) {
      throw new Error("The native input value setter is unavailable.");
    }
    valueSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("gates saving by editable eligible floating windows and keeps the frozen empty state", async () => {
    const onSave = vi.fn();
    await mount({ onSave });
    const save = getButton("workspace-window-space-save");
    expect(save.disabled).toBe(true);
    expect(save.title).toBe(
      "Open a floating window first to save a window space",
    );
    expect(host.querySelector("[role=status]")?.textContent).toContain(
      "No window spaces yet. Open a section or chat as a floating window",
    );

    await mount({
      onSave,
      state: createWorkspaceWindowingState({
        windows: [createWindow("floating")],
      }),
    });
    expect(getButton("workspace-window-space-save").disabled).toBe(false);
    await act(async () => getButton("workspace-window-space-save").click());
    expect(onSave).toHaveBeenCalledOnce();

    await mount({
      layoutEditable: false,
      onSave,
      state: createWorkspaceWindowingState({
        windows: [createWindow("floating")],
      }),
    });
    expect(getButton("workspace-window-space-save").disabled).toBe(true);
  });

  it("restores a named row through exactly one controlled state update", async () => {
    const onStateChange = vi.fn();
    const onRestore = vi.fn();
    const space = createSpace("research", "Research", 0);
    await mount({ onRestore, onStateChange, spaces: [space] });

    await act(async () => getButton("workspace-window-space-restore").click());

    expect(onStateChange).toHaveBeenCalledOnce();
    expect(onStateChange.mock.calls[0]?.[0].windows).toMatchObject([
      {
        contentId: "content-research",
        id: "window-research",
        title: "Research window",
      },
    ]);
    expect(onRestore).toHaveBeenCalledWith(space, expect.any(Object));
  });

  it("keeps only the disabled restore affordance and dedicated action in read-only mode", async () => {
    const onOpenDedicated = vi.fn();
    const onStateChange = vi.fn();
    const space = createSpace("research", "Research", 0);
    await mount({
      layoutEditable: false,
      onOpenDedicated,
      onStateChange,
      spaces: [space],
    });

    expect(getButton("workspace-window-space-restore").disabled).toBe(true);
    expect(
      host.querySelector('[data-testid="workspace-window-space-rename"]'),
    ).toBeNull();
    expect(
      host.querySelector('[data-testid="workspace-window-space-delete"]'),
    ).toBeNull();
    expect(
      host.querySelector('[data-testid="workspace-window-space-drag-handle"]'),
    ).toBeNull();
    await act(async () => getButton("workspace-window-space-restore").click());
    expect(onStateChange).not.toHaveBeenCalled();
    await act(async () =>
      getButton("workspace-window-space-open-dedicated").click(),
    );
    expect(onOpenDedicated).toHaveBeenCalledWith(space);
  });

  it("sorts controlled spaces and delegates edit-mode rename, delete, dedicated, and reorder actions", async () => {
    const onDelete = vi.fn();
    const onOpenDedicated = vi.fn();
    const onRename = vi.fn();
    const onReorder = vi.fn();
    const first = createSpace("first", "First", 0);
    const second = createSpace("second", "Second", 1);
    await mount({
      editing: true,
      onDelete,
      onOpenDedicated,
      onRename,
      onReorder,
      spaces: [second, first],
    });

    const rows = [
      ...host.querySelectorAll<HTMLElement>(
        "[data-testid=workspace-window-space-row]",
      ),
    ];
    expect(rows.map((row) => row.dataset.workspaceWindowSpaceId)).toEqual([
      "first",
      "second",
    ]);
    expect(
      host.querySelectorAll(
        '[data-testid="workspace-window-space-drag-handle"]',
      ),
    ).toHaveLength(2);
    const nameInput = host.querySelector<HTMLInputElement>(
      '[data-testid="workspace-window-space-name-input"]',
    );
    if (!nameInput) {
      throw new Error("Expected the edit-mode name input.");
    }
    await act(async () => {
      setNativeInputValue(nameInput, "  Renamed first  ");
      nameInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          code: "Enter",
          key: "Enter",
        }),
      );
    });
    expect(onRename).toHaveBeenCalledWith("first", "Renamed first");
    await act(async () => {
      setNativeInputValue(nameInput, "Discard this");
      nameInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          code: "Escape",
          key: "Escape",
        }),
      );
    });
    expect(nameInput.value).toBe("First");
    expect(onRename).toHaveBeenCalledOnce();

    await act(async () =>
      getButton("workspace-window-space-edit-restore").click(),
    );
    await act(async () =>
      getButton("workspace-window-space-open-dedicated").click(),
    );
    await act(async () => getButton("workspace-window-space-delete").click());
    expect(onOpenDedicated).toHaveBeenCalledWith(first);
    expect(onDelete).toHaveBeenCalledWith("first");

    const dragHandle = rows[0]?.querySelector<HTMLElement>(
      '[data-testid="workspace-window-space-drag-handle"]',
    );
    const targetRow = rows[1];
    if (!dragHandle || !targetRow) {
      throw new Error("Expected both sortable rows.");
    }
    await act(async () => {
      dragHandle.dispatchEvent(new Event("dragstart", { bubbles: true }));
    });
    await act(async () => {
      targetRow.dispatchEvent(new Event("drop", { bubbles: true }));
    });
    expect(onReorder).toHaveBeenCalledWith(["second", "first"]);
  });
});
