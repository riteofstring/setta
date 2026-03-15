/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatMessageActions } from "./chatMessageActions";

describe("ChatMessageActions", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("routes branch navigation to the adjacent chat ids", async () => {
    const onBranchSwitch = vi.fn();

    await act(async () => {
      root.render(
        <div className="group">
          <ChatMessageActions
            onCopy={() => {}}
            showRedo={false}
            redoDisabled={false}
            redoDisabledReason={null}
            showEdit={false}
            editDisabled={false}
            editDisabledReason={null}
            branchInfo={{
              branchChatIds: ["chat-1", "chat-2", "chat-3"],
              activeIndex: 1,
            }}
            onBranchSwitch={onBranchSwitch}
          />
        </div>,
      );
    });

    const previousButton = host.querySelector(
      'button[aria-label="Previous branch"]',
    );
    const nextButton = host.querySelector('button[aria-label="Next branch"]');
    expect(previousButton).not.toBeNull();
    expect(nextButton).not.toBeNull();
    if (!previousButton || !nextButton) {
      throw new Error("Expected branch navigation buttons.");
    }

    // The branch switcher must keep previous/next navigation aligned with the owning chat ids.
    await act(async () => {
      previousButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      nextButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onBranchSwitch).toHaveBeenNthCalledWith(1, "chat-1");
    expect(onBranchSwitch).toHaveBeenNthCalledWith(2, "chat-3");
  });

  it("passes the current user bubble width into edit mode", async () => {
    const onEdit = vi.fn();

    await act(async () => {
      root.render(
        <div className="group">
          <div data-chat-user-bubble="true">
            <ChatMessageActions
              onCopy={() => {}}
              showRedo={false}
              redoDisabled={false}
              redoDisabledReason={null}
              showEdit={true}
              editDisabled={false}
              editDisabledReason={null}
              onEdit={onEdit}
            />
          </div>
        </div>,
      );
    });

    const bubble = host.querySelector('[data-chat-user-bubble="true"]');
    const editButton = host.querySelector('button[aria-label="Edit message"]');
    expect(bubble).not.toBeNull();
    expect(editButton).not.toBeNull();
    if (!bubble || !editButton) {
      throw new Error("Expected the user bubble edit surface.");
    }

    Object.defineProperty(bubble, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        width: 312,
        height: 48,
        top: 0,
        left: 0,
        right: 312,
        bottom: 48,
        x: 0,
        y: 0,
        toJSON: () => null,
      }),
    });

    // The edit action should preserve the current bubble width when it hands off to the editor.
    await act(async () => {
      editButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onEdit).toHaveBeenCalledWith(312);
  });
});
