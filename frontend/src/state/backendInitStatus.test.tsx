/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeGetBackendInitStatusMock = vi.fn();

vi.mock("utils/generatedEndpoints", () => ({
  route_get_backend_init_status: (...args: unknown[]) =>
    routeGetBackendInitStatusMock(...args),
}));

import {
  BackendInitStatusProvider,
  useBackendInitStatus,
} from "./backendInitStatus";

type RenderedBackendInitStatus = {
  host: HTMLDivElement;
  root: Root;
};

function StatusConsumer({ testId }: { testId: string }) {
  const status = useBackendInitStatus();
  return <div data-testid={testId}>{status?.worktreeName ?? "missing"}</div>;
}

async function renderBackendInitStatusConsumers(): Promise<RenderedBackendInitStatus> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <BackendInitStatusProvider>
        <StatusConsumer testId="consumer-a" />
        <StatusConsumer testId="consumer-b" />
      </BackendInitStatusProvider>,
    );
  });

  return { host, root };
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("BackendInitStatusProvider", () => {
  beforeEach(() => {
    routeGetBackendInitStatusMock.mockReset();
  });

  afterEach(async () => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("shares a single backend init status load across multiple consumers", async () => {
    routeGetBackendInitStatusMock.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        events: [],
        isReady: true,
        error: null,
        authCookieRefreshWindowSeconds: 300,
        worktreeName: "feature/cleanup",
      },
    });

    const { host, root } = await renderBackendInitStatusConsumers();

    try {
      await flushEffects();

      expect(routeGetBackendInitStatusMock).toHaveBeenCalledOnce();
      expect(
        host.querySelector('[data-testid="consumer-a"]')?.textContent,
      ).toBe("feature/cleanup");
      expect(
        host.querySelector('[data-testid="consumer-b"]')?.textContent,
      ).toBe("feature/cleanup");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("retries failed loads until the Go-owned backend init snapshot succeeds", async () => {
    vi.useFakeTimers();
    routeGetBackendInitStatusMock
      .mockResolvedValueOnce({
        status: 503,
        hasResponse: true,
        data: null,
      })
      .mockResolvedValueOnce({
        status: 200,
        hasResponse: true,
        data: {
          events: [],
          isReady: true,
          error: null,
          authCookieRefreshWindowSeconds: 300,
          worktreeName: "retry-ready",
        },
      });

    const { host, root } = await renderBackendInitStatusConsumers();

    try {
      await flushEffects();

      expect(routeGetBackendInitStatusMock).toHaveBeenCalledOnce();
      expect(
        host.querySelector('[data-testid="consumer-a"]')?.textContent,
      ).toBe("missing");

      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      await flushEffects();

      expect(routeGetBackendInitStatusMock).toHaveBeenCalledTimes(2);
      expect(
        host.querySelector('[data-testid="consumer-a"]')?.textContent,
      ).toBe("retry-ready");
      expect(
        host.querySelector('[data-testid="consumer-b"]')?.textContent,
      ).toBe("retry-ready");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
