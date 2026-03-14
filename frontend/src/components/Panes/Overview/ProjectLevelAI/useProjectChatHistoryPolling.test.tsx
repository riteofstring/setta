/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectChatHistoryPolling } from "./useProjectChatHistoryPolling";

const { loadAgentRunsMock } = vi.hoisted(() => ({
  loadAgentRunsMock: vi.fn(async () => undefined),
}));

vi.mock("state/actions/ai/agentRuns", () => ({
  loadAgentRuns: loadAgentRunsMock,
}));

function PollingHarness({
  hasLoadError,
  hasRunningHistoryEntry,
  selectedChatMissingFromHistory,
}: {
  hasLoadError: boolean;
  hasRunningHistoryEntry: boolean;
  selectedChatMissingFromHistory: boolean;
}) {
  useProjectChatHistoryPolling({
    hasLoadError,
    hasRunningHistoryEntry,
    selectedChatMissingFromHistory,
  });
  return null;
}

describe("useProjectChatHistoryPolling", () => {
  let host: HTMLDivElement;
  let root: Root;
  let visibilityState: DocumentVisibilityState;

  beforeEach(() => {
    vi.useFakeTimers();
    loadAgentRunsMock.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    visibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads once on mount when the history surface has no polling reason", async () => {
    await act(async () => {
      root.render(
        <PollingHarness
          hasLoadError={false}
          hasRunningHistoryEntry={false}
          selectedChatMissingFromHistory={false}
        />,
      );
    });

    // With polling disabled, the hook should preserve the one-time bootstrap fetch only.
    expect(loadAgentRunsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    expect(loadAgentRunsMock).toHaveBeenCalledTimes(1);
  });

  it("polls while visible and refreshes when the document becomes visible again", async () => {
    await act(async () => {
      root.render(
        <PollingHarness
          hasLoadError={false}
          hasRunningHistoryEntry={true}
          selectedChatMissingFromHistory={false}
        />,
      );
    });

    // The extracted hook should keep the existing eager bootstrap plus active polling behavior.
    expect(loadAgentRunsMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(loadAgentRunsMock).toHaveBeenCalledTimes(3);

    visibilityState = "hidden";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(5_000);
    });
    expect(loadAgentRunsMock).toHaveBeenCalledTimes(3);

    visibilityState = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(loadAgentRunsMock).toHaveBeenCalledTimes(4);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(loadAgentRunsMock).toHaveBeenCalledTimes(5);
  });
});
