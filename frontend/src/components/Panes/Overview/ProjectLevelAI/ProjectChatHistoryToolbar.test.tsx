/* @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectChatHistoryToolbar } from "./ProjectChatHistoryToolbar";

type ToolbarProps = ComponentProps<typeof ProjectChatHistoryToolbar>;

function createToolbarProps(
  overrides: Partial<ToolbarProps> = {},
): ToolbarProps {
  return {
    masterSearchInput: "",
    hasMasterSearch: false,
    masterSearchCounterText: "0/0",
    masterSearchMatchCount: 0,
    showThreadAgentBadges: true,
    canUndoDeletedThreadOrGroup: false,
    onMasterSearchInputChange: vi.fn(),
    onStepMasterSearch: vi.fn(),
    onToggleThreadAgentBadges: vi.fn(),
    onRestoreDeletedThreadOrGroup: vi.fn(),
    onCreateGroup: vi.fn(),
    ...overrides,
  };
}

describe("ProjectChatHistoryToolbar", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
  });

  async function renderToolbar(
    overrides: Partial<ToolbarProps> = {},
  ): Promise<ToolbarProps> {
    const props = createToolbarProps(overrides);

    await act(async () => {
      root.render(<ProjectChatHistoryToolbar {...props} />);
    });

    return props;
  }

  it("publishes search changes and stepping commands from the extracted toolbar", async () => {
    const onMasterSearchInputChange = vi.fn();
    const onStepMasterSearch = vi.fn();

    await renderToolbar({
      masterSearchInput: "alpha",
      hasMasterSearch: true,
      masterSearchCounterText: "2/5",
      masterSearchMatchCount: 5,
      onMasterSearchInputChange,
      onStepMasterSearch,
    });

    const input = host.querySelector(
      '[data-testid="project-chat-master-search-input"]',
    );
    const previousButton = host.querySelector(
      'button[aria-label="Previous conversation result"]',
    );
    const nextButton = host.querySelector(
      'button[aria-label="Next conversation result"]',
    );
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected a master search input.");
    }
    if (
      !(previousButton instanceof HTMLButtonElement) ||
      !(nextButton instanceof HTMLButtonElement)
    ) {
      throw new Error("Expected master search step buttons.");
    }

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!valueSetter) {
        throw new Error("Expected an input value setter.");
      }
      valueSetter.call(input, "beta");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      previousButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      nextButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    // Search entry and result stepping should stay owned by the extracted toolbar surface.
    expect(onMasterSearchInputChange).toHaveBeenCalledWith("beta");
    expect(onStepMasterSearch).toHaveBeenCalledWith("previous");
    expect(onStepMasterSearch).toHaveBeenCalledWith("next");
    expect(host.textContent).toContain("2/5");
  });

  it("routes badge toggle, undo delete, and new group actions", async () => {
    const onToggleThreadAgentBadges = vi.fn();
    const onRestoreDeletedThreadOrGroup = vi.fn();
    const onCreateGroup = vi.fn();

    await renderToolbar({
      showThreadAgentBadges: false,
      canUndoDeletedThreadOrGroup: true,
      onToggleThreadAgentBadges,
      onRestoreDeletedThreadOrGroup,
      onCreateGroup,
    });

    const badgeToggleButton = host.querySelector(
      '[data-testid="project-chat-thread-agent-badge-toggle-button"]',
    );
    const undoButton = host.querySelector(
      '[data-testid="project-chat-thread-restore-last-delete-button"]',
    );
    const createGroupButton = host.querySelector(
      '[data-testid="project-chat-thread-group-new-group-button"]',
    );
    if (
      !(badgeToggleButton instanceof HTMLButtonElement) ||
      !(undoButton instanceof HTMLButtonElement) ||
      !(createGroupButton instanceof HTMLButtonElement)
    ) {
      throw new Error("Expected toolbar action buttons.");
    }

    await act(async () => {
      badgeToggleButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      undoButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      createGroupButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    // The extracted toolbar should keep the action buttons wired directly to the parent controller.
    expect(onToggleThreadAgentBadges).toHaveBeenCalledTimes(1);
    expect(onRestoreDeletedThreadOrGroup).toHaveBeenCalledTimes(1);
    expect(onCreateGroup).toHaveBeenCalledTimes(1);
    expect(badgeToggleButton.getAttribute("aria-pressed")).toBe("false");
    expect(undoButton.disabled).toBe(false);
  });
});
