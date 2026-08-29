/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WorkspaceWindowSurface,
  type WorkspaceWindowSurfaceProps,
} from "./WorkspaceWindowSurface";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const TITLE = "Original title";

describe("WorkspaceWindowSurface", () => {
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
    props: Partial<WorkspaceWindowSurfaceProps> = {},
  ): Promise<void> {
    await act(async () => {
      root.render(
        <WorkspaceWindowSurface
          title={TITLE}
          windowId="window-1"
          onFocus={() => {}}
          {...props}
        >
          <div data-testid="window-body">Window body</div>
        </WorkspaceWindowSurface>,
      );
    });
  }

  function getTitle(): HTMLParagraphElement {
    const title = host.querySelector<HTMLParagraphElement>(
      '[data-testid="workspace-window-title"]',
    );
    if (!title) {
      throw new Error("Expected the window title.");
    }
    return title;
  }

  function getTitleInput(): HTMLInputElement {
    const input = host.querySelector<HTMLInputElement>(
      '[data-testid="workspace-window-title-input"]',
    );
    if (!input) {
      throw new Error("Expected the title input.");
    }
    return input;
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

  async function beginTitleEditingWithDoubleClick(): Promise<void> {
    await act(async () => {
      getTitle().dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
      );
    });
  }

  it("renders an optional header, a focusable title, and a body slot", async () => {
    const onFocus = vi.fn();
    await mount({ onFocus });

    const frame = host.querySelector<HTMLElement>(
      '[data-testid="workspace-window-surface"]',
    );
    expect(frame?.dataset.workspaceWindowFrame).toBe("true");
    expect(
      host.querySelector('[data-testid="workspace-window-header"]'),
    ).not.toBeNull();
    expect(getTitle().tabIndex).toBe(0);
    expect(host.querySelector('[data-testid="window-body"]')?.textContent).toBe(
      "Window body",
    );

    await act(async () => getTitle().click());
    expect(onFocus).toHaveBeenCalledOnce();

    await mount({ showHeader: false });
    expect(
      host.querySelector('[data-testid="workspace-window-header"]'),
    ).toBeNull();
    expect(
      host.querySelector('[data-testid="workspace-window-title"]'),
    ).toBeNull();
    expect(host.querySelector('[data-testid="window-body"]')).not.toBeNull();
  });

  it("edits a title on double click, selects it, and commits a trimmed title on Enter", async () => {
    const onTitleCommit = vi.fn();
    await mount({ onTitleCommit });
    await beginTitleEditingWithDoubleClick();

    const input = getTitleInput();
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(TITLE.length);

    await act(async () => {
      setNativeInputValue(input, "  Renamed window  ");
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: "Enter",
          key: "Enter",
        }),
      );
    });

    expect(onTitleCommit).toHaveBeenCalledOnce();
    expect(onTitleCommit).toHaveBeenCalledWith("Renamed window");
    expect(
      host.querySelector('[data-testid="workspace-window-title-input"]'),
    ).toBeNull();
  });

  it("starts title editing with Space and cancels it with Escape while restoring title focus", async () => {
    const onTitleCommit = vi.fn();
    await mount({ onTitleCommit });
    const title = getTitle();
    title.focus();

    await act(async () => {
      title.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: "Space",
          key: " ",
        }),
      );
    });
    const input = getTitleInput();
    await act(async () => {
      setNativeInputValue(input, "Discard this");
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: "Escape",
          key: "Escape",
        }),
      );
    });

    expect(onTitleCommit).not.toHaveBeenCalled();
    expect(getTitle().textContent).toBe(TITLE);
    expect(document.activeElement).toBe(getTitle());
  });

  it("keeps an invalid title draft visible with its inline error instead of committing it", async () => {
    const onTitleCommit = vi.fn();
    await mount({ onTitleCommit });
    await beginTitleEditingWithDoubleClick();
    const input = getTitleInput();

    await act(async () => {
      setNativeInputValue(input, "  \t ");
    });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "A window title is required.",
    );

    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: "Enter",
          key: "Enter",
        }),
      );
    });
    expect(onTitleCommit).not.toHaveBeenCalled();
    expect(
      host.querySelector('[data-testid="workspace-window-title-input"]'),
    ).not.toBeNull();
  });

  it("removes title editing, drag wiring, and layout actions in read-only mode while keeping host extensions", async () => {
    const onTitleCommit = vi.fn();
    const onPointerDown = vi.fn();
    const onLayoutAction = vi.fn();
    const onExtensionAction = vi.fn();
    await mount({
      allowLayoutMutations: false,
      onTitleCommit,
      dragHandleTestId: "workspace-window-drag-handle",
      onTitlePointerDown: onPointerDown,
      actions: [
        {
          id: "maximize",
          label: "Maximize window",
          icon: <span aria-hidden="true">+</span>,
          onClick: onLayoutAction,
          testId: "maximize-window",
        },
        {
          id: "help",
          label: "Open window help",
          icon: <span aria-hidden="true">?</span>,
          onClick: onExtensionAction,
          isLayoutAction: false,
          testId: "window-help",
        },
      ],
      headerExtensions: <span data-testid="host-header-extension">Host</span>,
    });

    const title = getTitle();
    expect(
      host.querySelector('[data-testid="workspace-window-drag-handle"]'),
    ).toBeNull();
    expect(host.querySelector('[data-testid="maximize-window"]')).toBeNull();
    expect(host.querySelector('[data-testid="window-help"]')).not.toBeNull();
    expect(
      host.querySelector('[data-testid="host-header-extension"]'),
    ).not.toBeNull();

    await act(async () => {
      title.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      title.dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true, cancelable: true }),
      );
    });
    expect(onPointerDown).not.toHaveBeenCalled();
    expect(
      host.querySelector('[data-testid="workspace-window-title-input"]'),
    ).toBeNull();
    expect(onTitleCommit).not.toHaveBeenCalled();
  });

  it("uses native labelled compact actions with neutral, minimize, and close tones", async () => {
    await mount({
      actions: [
        {
          id: "maximize",
          label: "Maximize window",
          icon: <span aria-hidden="true">+</span>,
          onClick: () => {},
          testId: "maximize-window",
        },
        {
          id: "minimize",
          label: "Minimize window",
          icon: <span aria-hidden="true">−</span>,
          onClick: () => {},
          tone: "minimize",
          testId: "minimize-window",
        },
        {
          id: "close",
          label: "Close window",
          icon: <span aria-hidden="true">×</span>,
          onClick: () => {},
          tone: "close",
          testId: "close-window",
        },
      ],
    });

    for (const [testId, label, tone] of [
      ["maximize-window", "Maximize window", "neutral"],
      ["minimize-window", "Minimize window", "minimize"],
      ["close-window", "Close window", "close"],
    ] as const) {
      const button = host.querySelector<HTMLButtonElement>(
        `[data-testid="${testId}"]`,
      );
      expect(button?.type).toBe("button");
      expect(button?.getAttribute("aria-label")).toBe(label);
      expect(button?.title).toBe(label);
      expect(button?.dataset.settaWorkspaceTouchTarget).toBe("compact");
      expect(button?.dataset.workspaceWindowActionTone).toBe(tone);
    }
  });
});
