/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagedChatAreaHeader } from "./ManagedChatAreaHeader";

describe("ManagedChatAreaHeader", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the plan-mode badge and zero-scope banner with dismiss support", () => {
    const dismissZeroScopeBanner = vi.fn();

    act(() => {
      root.render(
        <ManagedChatAreaHeader
          shellClassName="shell"
          showPlanModeBadge={true}
          showZeroScopeBanner={true}
          hasAnyAgenticEdge={false}
          hasWriteScope={false}
          canUseManagedChat={true}
          showHistory={false}
          onToggleHistory={() => undefined}
          onStartNewChat={() => undefined}
          onDismissZeroScopeBanner={dismissZeroScopeBanner}
        />,
      );
    });

    expect(container.textContent).toContain("Plan mode");
    expect(container.textContent).toContain("No outgoing scope links.");
    expect(container.textContent).toContain("Scope limited");
    const dismissButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Dismiss",
    );
    expect(dismissButton).toBeTruthy();

    act(() => {
      dismissButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(dismissZeroScopeBanner).toHaveBeenCalledTimes(1);
  });

  it("renders the no-write-scope warning when scope exists but no writable target is available", () => {
    act(() => {
      root.render(
        <ManagedChatAreaHeader
          shellClassName="shell"
          showPlanModeBadge={false}
          showZeroScopeBanner={false}
          hasAnyAgenticEdge={true}
          hasWriteScope={false}
          canUseManagedChat={false}
          showHistory={false}
          onToggleHistory={() => undefined}
          onStartNewChat={() => undefined}
          onDismissZeroScopeBanner={() => undefined}
        />,
      );
    });

    expect(container.textContent).toContain(
      "No writable sections in scope. This chat cannot modify sections.",
    );
    expect(container.textContent).not.toContain("Scope limited");
    expect(container.textContent).not.toContain("History");
  });

  it("renders managed history controls and toggles the history label for active history mode", () => {
    const toggleHistory = vi.fn();
    const startNewChat = vi.fn();

    act(() => {
      root.render(
        <ManagedChatAreaHeader
          shellClassName="shell"
          showPlanModeBadge={false}
          showZeroScopeBanner={false}
          hasAnyAgenticEdge={true}
          hasWriteScope={true}
          canUseManagedChat={true}
          showHistory={true}
          onToggleHistory={toggleHistory}
          onStartNewChat={startNewChat}
          onDismissZeroScopeBanner={() => undefined}
        />,
      );
    });

    const historyButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Back",
    );
    const newChatButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "New Chat",
    );
    expect(historyButton).toBeTruthy();
    expect(newChatButton).toBeTruthy();

    act(() => {
      historyButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      newChatButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(toggleHistory).toHaveBeenCalledTimes(1);
    expect(startNewChat).toHaveBeenCalledTimes(1);
  });
});
