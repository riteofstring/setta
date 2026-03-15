/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatInputMetaControls } from "./ChatInputMetaControls";

function getElementByAriaLabel(
  host: HTMLElement,
  ariaLabel: string,
): HTMLElement | null {
  return host.querySelector(`[aria-label="${ariaLabel}"]`);
}

function getButtonByText(
  host: HTMLElement,
  text: string,
): HTMLButtonElement | null {
  return Array.from(host.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === text,
  ) as HTMLButtonElement | null;
}

describe("ChatInputMetaControls", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

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
  });

  it("returns no markup when there are no execution, context, or runtime controls", async () => {
    await act(async () => {
      root.render(<ChatInputMetaControls disabled={false} />);
    });

    expect(host.innerHTML).toBe("");
  });

  it("toggles the context badge between percentage and tokens", async () => {
    await act(async () => {
      root.render(
        <ChatInputMetaControls
          disabled={false}
          contextWindowTokens={200_000}
          contextUsedTokens={150_000}
        />,
      );
    });

    const initialBadge = getElementByAriaLabel(host, "context left 25%");
    expect(initialBadge).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      if (!(initialBadge instanceof HTMLButtonElement)) {
        throw new Error("Missing context badge button.");
      }
      initialBadge.click();
    });

    expect(getElementByAriaLabel(host, "context left ~50k")).toBeInstanceOf(
      HTMLButtonElement,
    );
  });

  it("fires thinking and search callbacks with the toggled values", async () => {
    const onThinkingEnabledChange = vi.fn();
    const onSearchEnabledChange = vi.fn();

    await act(async () => {
      root.render(
        <ChatInputMetaControls
          disabled={false}
          executionControls={{
            thinkingEnabled: false,
            onThinkingEnabledChange,
            permissionMode: "minimal",
            searchEnabled: true,
            onPermissionModeChange: vi.fn(),
            onSearchEnabledChange,
          }}
        />,
      );
    });

    const thinkingButton = getElementByAriaLabel(host, "Thinking");
    const searchButton = getButtonByText(host, "Search");

    await act(async () => {
      if (!(thinkingButton instanceof HTMLButtonElement)) {
        throw new Error("Missing thinking button.");
      }
      thinkingButton.click();
      searchButton?.click();
    });

    expect(onThinkingEnabledChange).toHaveBeenCalledWith(true);
    expect(onSearchEnabledChange).toHaveBeenCalledWith(false);
  });

  it("renders runtime dropdown triggers when detailed entries are available", async () => {
    await act(async () => {
      root.render(
        <ChatInputMetaControls
          disabled={false}
          runtimeActivityCounts={{
            activeBackgroundTerminals: 0,
            activeSubagents: 0,
          }}
          runtimeActivityDetails={{
            activeBackgroundTerminals: [
              {
                id: "terminal-a",
                label: "pnpm test",
                toolName: "command_execution",
              },
            ],
            activeSubagents: [
              {
                id: "subagent-a",
                label: "reviewer",
                toolName: "run_agent_profile",
              },
            ],
          }}
        />,
      );
    });

    const backgroundTrigger = getElementByAriaLabel(
      host,
      "1 background terminal active",
    );
    const subagentTrigger = getElementByAriaLabel(host, "1 subagent active");

    expect(backgroundTrigger).toBeInstanceOf(HTMLButtonElement);
    expect(subagentTrigger).toBeInstanceOf(HTMLButtonElement);
    expect(backgroundTrigger?.getAttribute("aria-haspopup")).toBe("menu");
    expect(subagentTrigger?.getAttribute("aria-haspopup")).toBe("menu");
  });

  it("renders a context unavailable badge when telemetry is missing", async () => {
    await act(async () => {
      root.render(
        <ChatInputMetaControls
          disabled={false}
          contextUsageUnavailable={true}
        />,
      );
    });

    const unavailableBadge = getElementByAriaLabel(host, "context unavailable");

    expect(unavailableBadge).toBeInstanceOf(HTMLSpanElement);
    expect(unavailableBadge?.textContent).toContain("context unavailable");
  });
});
