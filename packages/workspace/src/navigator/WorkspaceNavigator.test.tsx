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

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceNavigator } from "./WorkspaceNavigator";
import { openWorkspaceNavigator } from "./workspaceNavigatorState";

const { resolveWorkspaceFindResults, resolveWorkspacePaletteEntries } =
  vi.hoisted(() => ({
    resolveWorkspaceFindResults: vi.fn(),
    resolveWorkspacePaletteEntries: vi.fn(),
  }));

vi.mock("./workspaceFind", () => ({ resolveWorkspaceFindResults }));
vi.mock("./workspacePalette", () => ({ resolveWorkspacePaletteEntries }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function makeFindEntry(
  id: string,
  label: string,
  type: "item" | "section",
  activation = { ran: true, statusMessage: null },
  onActivate?: () => void,
) {
  const activate = vi.fn(() => {
    onActivate?.();
    return activation;
  });
  return {
    activate,
    breadcrumb: type === "item" ? "Planning" : null,
    checked: null,
    disabled: false,
    disabledReason: null,
    group: type === "item" ? "Items" : "Sections",
    id,
    kind: type,
    label,
    shortcutLabel: null,
  };
}

describe("WorkspaceNavigator", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    resolveWorkspaceFindResults.mockReset();
    resolveWorkspacePaletteEntries.mockReset();
    resolveWorkspaceFindResults.mockReturnValue([]);
    resolveWorkspacePaletteEntries.mockReturnValue([]);
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <WorkspaceNavigator showTrigger />
        </WorkspaceTestProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.replaceChildren();
  });

  function getTrigger(): HTMLButtonElement {
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Open workspace navigator"]',
    );
    if (!trigger) {
      throw new Error("Expected workspace navigator trigger.");
    }
    return trigger;
  }

  function getDialog(): HTMLElement {
    const dialog = document.body.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Workspace navigator"]',
    );
    if (!dialog) {
      throw new Error("Expected workspace navigator dialog.");
    }
    return dialog;
  }

  function getInput(): HTMLInputElement {
    const input = document.body.querySelector<HTMLInputElement>(
      'input[role="combobox"]',
    );
    if (!input) {
      throw new Error("Expected workspace navigator input.");
    }
    return input;
  }

  it("opens a labelled modal find dialog, keeps focus on its combobox, and activates the highlighted result", async () => {
    const section = makeFindEntry("section:planning", "Planning", "section");
    const itemFocusTarget = document.createElement("button");
    document.body.appendChild(itemFocusTarget);
    const item = makeFindEntry(
      "item:budget",
      "Budget",
      "item",
      { ran: true, statusMessage: null },
      () => itemFocusTarget.focus(),
    );
    resolveWorkspaceFindResults.mockImplementation((_host, query: string) =>
      [section, item].filter((entry) =>
        entry.label.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    );
    const trigger = getTrigger();
    trigger.focus();

    await act(async () => {
      trigger.click();
    });

    const dialog = getDialog();
    const input = getInput();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(input.getAttribute("aria-label")).toBe("Find in workspace");
    expect(document.activeElement).toBe(input);
    expect(
      document.body.querySelector('[role="listbox"]')?.textContent,
    ).toContain("Planning");
    expect(
      document.body.querySelector('[role="status"]')?.textContent,
    ).toContain("2 results");

    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
    });
    expect(input.getAttribute("aria-activedescendant")).toContain("option-1");

    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
    });

    expect(item.activate).toHaveBeenCalledOnce();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(itemFocusTarget);
  });

  it("switches modes with tabs, filters palette entries, and keeps disabled reasons visible", async () => {
    resolveWorkspaceFindResults.mockReturnValue([]);
    resolveWorkspacePaletteEntries.mockReturnValue([
      {
        checked: null,
        disabled: true,
        disabledReason: "Editing is disabled for this workspace.",
        group: "Create",
        id: "creation:note",
        keywords: ["note", "create"],
        label: "Create note",
        run: vi.fn(() => ({ ran: false, statusMessage: null })),
      },
    ]);
    const trigger = getTrigger();
    trigger.focus();

    await act(async () => {
      trigger.click();
    });

    const findTab = document.body.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-selected="true"]',
    );
    if (!findTab) {
      throw new Error("Expected selected find tab.");
    }
    findTab.focus();
    await act(async () => {
      findTab.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
      );
    });

    const commandsTab = document.body.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-selected="true"]',
    );
    expect(commandsTab?.textContent).toContain("Commands");
    expect(document.activeElement).toBe(commandsTab);
    expect(getInput().getAttribute("aria-label")).toBe(
      "Search workspace commands",
    );
    expect(document.body.textContent).toContain(
      "Editing is disabled for this workspace.",
    );

    await act(async () => {
      openWorkspaceNavigator(testWorkspace.host, "commands");
    });
    expect(document.body.textContent).toContain("Create note");
  });

  it("closes with Escape and restores the opener focus", async () => {
    resolveWorkspaceFindResults.mockReturnValue([]);
    const trigger = getTrigger();
    trigger.focus();

    await act(async () => {
      trigger.click();
    });
    const input = getInput();

    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes from the pointer backdrop and restores the opener focus", async () => {
    const trigger = getTrigger();
    trigger.focus();

    await act(async () => {
      trigger.click();
    });
    const backdrop = document.body.querySelector<HTMLButtonElement>(
      ".setta-workspace-navigator-backdrop",
    );
    if (!backdrop) {
      throw new Error("Expected workspace navigator backdrop.");
    }

    await act(async () => {
      backdrop.click();
    });

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps the opener's text direction on the portaled dialog", async () => {
    host.dir = "rtl";
    const trigger = getTrigger();
    trigger.focus();

    await act(async () => {
      trigger.click();
    });

    expect(
      document.body.querySelector<HTMLElement>(
        '[data-workspace-navigator-overlay="true"]',
      )?.dir,
    ).toBe("rtl");
  });
});
