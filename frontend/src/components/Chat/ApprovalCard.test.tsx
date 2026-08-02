/* @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "testUtils/reactRefreshPreamble";
import { createToolChatMessage } from "utils/generatedTypes";

const respondExternalAgentApprovalMock = vi.fn();

vi.mock("state/actions/ai", () => ({
  respondExternalAgentApproval: (...args: unknown[]) =>
    respondExternalAgentApprovalMock(...args),
}));

import { ApprovalCard } from "./ApprovalCard";

type ApprovalCardRenderProps = Partial<ComponentProps<typeof ApprovalCard>>;

type RenderedApprovalCard = {
  host: HTMLDivElement;
  root: Root;
  rerender: (props?: ApprovalCardRenderProps) => Promise<void>;
};

function createDeferred<T>() {
  let resolve: ((value: T | PromiseLike<T>) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return {
    promise,
    resolve(value: T) {
      resolve?.(value);
    },
    reject(reason?: unknown) {
      reject?.(reason);
    },
  };
}

function queryButton(
  host: HTMLDivElement,
  label: string,
): HTMLButtonElement | null {
  for (const button of host.querySelectorAll("button")) {
    if (
      button instanceof HTMLButtonElement &&
      button.textContent?.trim() === label
    ) {
      return button;
    }
  }
  return null;
}

function getButton(host: HTMLDivElement, label: string): HTMLButtonElement {
  const button = queryButton(host, label);
  if (!button) {
    throw new Error(`Expected button ${label}.`);
  }
  return button;
}

async function renderApprovalCard(
  props: ApprovalCardRenderProps = {},
): Promise<RenderedApprovalCard> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  async function rerender(nextProps: ApprovalCardRenderProps = {}) {
    await act(async () => {
      root.render(
        <ApprovalCard
          toolCallId="approval-1"
          toolName="setta__get_setta_docs"
          input={{ path: "docs/reference" }}
          toolType="function"
          isStreaming={true}
          {...props}
          {...nextProps}
        />,
      );
    });
  }

  await rerender();
  return { host, root, rerender };
}

describe("ApprovalCard", () => {
  beforeEach(() => {
    respondExternalAgentApprovalMock.mockReset();
  });

  afterEach(async () => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("keeps the approval buttons pending until a tool result confirms the outcome", async () => {
    const deferred = createDeferred<boolean>();
    respondExternalAgentApprovalMock.mockReturnValue(deferred.promise);

    const { host, root, rerender } = await renderApprovalCard();

    try {
      await act(async () => {
        getButton(host, "Approve").click();
      });

      expect(respondExternalAgentApprovalMock).toHaveBeenCalledWith(
        "approval-1",
        true,
      );
      expect(getButton(host, "Approve").disabled).toBe(true);
      expect(getButton(host, "Deny").disabled).toBe(true);

      await act(async () => {
        deferred.resolve(true);
        await deferred.promise;
      });

      expect(getButton(host, "Approve").disabled).toBe(true);

      await rerender({
        toolResult: createToolChatMessage({
          id: "tool-result-1",
          tool_call_id: "approval-1",
          is_error: false,
        }),
      });

      expect(host.textContent).toContain("Approved");
      expect(queryButton(host, "Approve")).toBeNull();
      expect(queryButton(host, "Deny")).toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("shows a failure message when the approval response is rejected by the backend", async () => {
    respondExternalAgentApprovalMock.mockResolvedValue(false);

    const { host, root } = await renderApprovalCard();

    try {
      await act(async () => {
        getButton(host, "Deny").click();
        await Promise.resolve();
      });

      expect(respondExternalAgentApprovalMock).toHaveBeenCalledWith(
        "approval-1",
        false,
      );
      expect(host.textContent).toContain("Failed to send approval response.");
      expect(getButton(host, "Approve").disabled).toBe(false);
      expect(getButton(host, "Deny").disabled).toBe(false);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
