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
import { WorkspaceDropdownMenu } from "./WorkspaceDropdownMenu";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function requiredElement<ElementType extends Element>(
  element: ElementType | null,
  description: string,
): ElementType {
  if (element === null) {
    throw new Error(`Expected ${description}.`);
  }
  return element;
}

function menuItemWithText(menu: HTMLElement, label: string): HTMLElement {
  const item = [
    ...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
  ].find((candidate) => candidate.textContent === label);
  if (item === undefined) {
    throw new Error(`Expected the ${label} menu item.`);
  }
  return item;
}

describe("WorkspaceDropdownMenu", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("opens a scoped grouped menu and runs the chosen action", async () => {
    const chooseRectangle = vi.fn();
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          <WorkspaceDropdownMenu
            ariaLabel="Draw a line or shape"
            groups={[
              {
                items: [
                  {
                    id: "line",
                    label: "Line",
                    onSelect: vi.fn(),
                  },
                ],
                label: "Lines",
              },
              {
                items: [
                  {
                    id: "rectangle",
                    label: "Rectangle",
                    onSelect: chooseRectangle,
                  },
                ],
                label: "Shapes",
              },
            ]}
            selectedItemId="line"
          >
            Line &amp; shape
          </WorkspaceDropdownMenu>
        </WorkspaceTestProvider>,
      );
    });

    const trigger = requiredElement(
      container.querySelector<HTMLButtonElement>(
        'button[aria-label="Draw a line or shape"]',
      ),
      "the drawing menu trigger",
    );
    expect(trigger.hasAttribute("aria-pressed")).toBe(false);
    await act(async () =>
      trigger.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      ),
    );

    const menu = requiredElement(
      document.body.querySelector<HTMLElement>(
        '[role="menu"][aria-label="Draw a line or shape"]',
      ),
      "the drawing menu",
    );
    expect(menu.classList.contains("setta-workspace-menu")).toBe(true);
    expect(menu.classList.contains("setta-workspace-dropdown-menu")).toBe(true);
    expect(menu.classList.contains("setta-workspace")).toBe(true);
    expect(menu.textContent).toContain("Lines");
    expect(menu.textContent).toContain("Shapes");
    const line = requiredElement(
      menu.querySelector<HTMLElement>(
        '[role="menuitemradio"][aria-checked="true"]',
      ),
      "the selected line menu item",
    );
    expect(line.textContent).toBe("Line");

    const rectangle = menuItemWithText(menu, "Rectangle");
    await act(async () => rectangle.click());

    expect(chooseRectangle).toHaveBeenCalledOnce();
    expect(
      document.body.querySelector(
        '[role="menu"][aria-label="Draw a line or shape"]',
      ),
    ).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
