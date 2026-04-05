/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeGetBackendInitStatusMock = vi.fn();

vi.mock("openapi/http", () => ({
  getBackendInitStatus: (...args: unknown[]) =>
    routeGetBackendInitStatusMock(...args),
}));

import { BackendInitStatusProvider } from "state/backendInitStatus";
import { WorktreeHint } from "./WorktreeHint";

type RenderedWorktreeHint = {
  host: HTMLDivElement;
  root: Root;
};

async function renderWorktreeHint(): Promise<RenderedWorktreeHint> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <BackendInitStatusProvider>
        <WorktreeHint />
      </BackendInitStatusProvider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });

  return { host, root };
}

describe("WorktreeHint", () => {
  beforeEach(() => {
    routeGetBackendInitStatusMock.mockReset();
  });

  afterEach(async () => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders the current worktree name from the Go-owned backend init status route", async () => {
    routeGetBackendInitStatusMock.mockResolvedValue({
      data: {
        events: [],
        isReady: true,
        error: null,
        authCookieRefreshWindowSeconds: 300,
        worktreeName: "feature/cleanup",
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    const { host, root } = await renderWorktreeHint();

    try {
      expect(routeGetBackendInitStatusMock).toHaveBeenCalledOnce();
      expect(
        host.querySelector('[data-testid="worktree-hint"]')?.textContent,
      ).toContain("feature/cleanup");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("dismisses the rendered worktree label locally after close", async () => {
    routeGetBackendInitStatusMock.mockResolvedValue({
      data: {
        events: [],
        isReady: true,
        error: null,
        authCookieRefreshWindowSeconds: 300,
        worktreeName: "feature/cleanup",
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    const { host, root } = await renderWorktreeHint();

    try {
      const closeButton = host.querySelector(
        '[data-testid="worktree-hint-close"]',
      );
      if (!(closeButton instanceof HTMLButtonElement)) {
        throw new Error("Expected worktree close button.");
      }

      await act(async () => {
        closeButton.click();
      });

      expect(host.querySelector('[data-testid="worktree-hint"]')).toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("keeps the hint hidden when the backend init status lacks a worktree name", async () => {
    routeGetBackendInitStatusMock.mockResolvedValue({
      data: {
        events: [],
        isReady: true,
        error: null,
        authCookieRefreshWindowSeconds: 300,
        worktreeName: null,
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    const { host, root } = await renderWorktreeHint();

    try {
      // The Go route remains the source of truth, but callers should not render
      // a label when no worktree name is available.
      expect(routeGetBackendInitStatusMock).toHaveBeenCalledOnce();
      expect(host.querySelector('[data-testid="worktree-hint"]')).toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
