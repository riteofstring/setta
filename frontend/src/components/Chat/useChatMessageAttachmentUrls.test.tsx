/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { ChatRoleEnum, createMessageTextContent } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("state/actions/sectionInfos", () => ({
  getCurrProjectConfigId: vi.fn(() => "project-config-1"),
}));

vi.mock("openapi/http", async () => {
  const actual =
    await vi.importActual<typeof import("openapi/http")>("openapi/http");
  return {
    ...actual,
    getAttachmentDownloadUrls: vi.fn(),
  };
});

import { getAttachmentDownloadUrls } from "openapi/http";

import {
  type AttachmentUrlEntry,
  useChatMessageAttachmentUrls,
} from "./useChatMessageAttachmentUrls";

function createDeferredPromise<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  if (!resolve) {
    throw new Error("Expected deferred promise resolver.");
  }
  return { promise, resolve };
}

describe("useChatMessageAttachmentUrls", () => {
  let host: HTMLDivElement;
  let root: Root;
  let latestAttachmentUrlMap: Record<string, AttachmentUrlEntry>;
  let latestRequestAttachmentUrls:
    | ((
        targets: Array<{
          id: string;
          name: string;
          mimeType: string | null;
          size: number | null;
        }>,
        options?: { force?: boolean },
      ) => Promise<Record<string, AttachmentUrlEntry>>)
    | null;

  const sharedAttachment = {
    id: "attachment-1",
    name: "design.png",
    mimeType: "image/png",
    size: 128,
  };

  const baseMessages = [
    {
      id: "message-user-1",
      role: ChatRoleEnum.user,
      content: [createMessageTextContent({ text: "Please inspect this." })],
      attachments: [sharedAttachment],
    },
    {
      id: "message-assistant-1",
      role: ChatRoleEnum.assistant,
      content: [createMessageTextContent({ text: "Reviewing it now." })],
      attachments: [sharedAttachment],
      tool_calls: null,
    },
  ];

  function Harness({ messages }: { messages: typeof baseMessages }) {
    const { attachmentUrlMap, requestAttachmentUrls } =
      useChatMessageAttachmentUrls(messages);
    latestAttachmentUrlMap = attachmentUrlMap;
    latestRequestAttachmentUrls = requestAttachmentUrls;
    return <div data-attachment-count={Object.keys(attachmentUrlMap).length} />;
  }

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    latestAttachmentUrlMap = {};
    latestRequestAttachmentUrls = null;
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("deduplicates in-flight attachment URL loads across rerenders", async () => {
    const routeGetAttachmentDownloadUrls = vi.mocked(getAttachmentDownloadUrls);
    const requestGate = createDeferredPromise<void>();
    routeGetAttachmentDownloadUrls.mockImplementation(async () => {
      await requestGate.promise;
      return {
        data: [
          {
            artifactId: sharedAttachment.id,
            url: "https://example.com/download/design.png",
            expiresAt: Math.ceil(Date.now() / 1000) + 120,
          },
        ],
        error: undefined,
        response: new Response(null, { status: 200 }),
      };
    });

    await act(async () => {
      root.render(<Harness messages={baseMessages} />);
      await Promise.resolve();
    });
    await act(async () => {
      root.render(<Harness messages={[...baseMessages]} />);
      await Promise.resolve();
    });

    expect(routeGetAttachmentDownloadUrls).toHaveBeenCalledTimes(1);
    expect(routeGetAttachmentDownloadUrls).toHaveBeenCalledWith({
      body: {
        artifactIds: [sharedAttachment.id],
        projectConfigId: "project-config-1",
      },
    });

    await act(async () => {
      requestGate.resolve(undefined);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(latestAttachmentUrlMap[sharedAttachment.id]?.url).toBe(
      "https://example.com/download/design.png",
    );
  });

  it("reuses fresh attachment URLs unless a force refresh is requested", async () => {
    const routeGetAttachmentDownloadUrls = vi.mocked(getAttachmentDownloadUrls);
    routeGetAttachmentDownloadUrls
      .mockResolvedValueOnce({
        data: [
          {
            artifactId: sharedAttachment.id,
            url: "https://example.com/download/design-v1.png",
            expiresAt: Math.ceil(Date.now() / 1000) + 120,
          },
        ],
        error: undefined,
        response: new Response(null, { status: 200 }),
      })
      .mockResolvedValueOnce({
        data: [
          {
            artifactId: sharedAttachment.id,
            url: "https://example.com/download/design-v2.png",
            expiresAt: Math.ceil(Date.now() / 1000) + 180,
          },
        ],
        error: undefined,
        response: new Response(null, { status: 200 }),
      });

    await act(async () => {
      root.render(<Harness messages={baseMessages} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    if (!latestRequestAttachmentUrls) {
      throw new Error("Expected attachment URL request helper.");
    }

    await act(async () => {
      await latestRequestAttachmentUrls([sharedAttachment]);
    });
    expect(routeGetAttachmentDownloadUrls).toHaveBeenCalledTimes(1);

    await act(async () => {
      await latestRequestAttachmentUrls([sharedAttachment], { force: true });
    });
    expect(routeGetAttachmentDownloadUrls).toHaveBeenCalledTimes(2);
    expect(latestAttachmentUrlMap[sharedAttachment.id]?.url).toBe(
      "https://example.com/download/design-v2.png",
    );
  });
});
