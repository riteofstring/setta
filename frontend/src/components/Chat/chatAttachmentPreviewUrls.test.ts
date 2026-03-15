import { ChatRoleEnum, type BaseChatMessageUnion } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  collectChatMessageAttachments,
  isChatAttachmentUrlStale,
} from "./chatAttachmentPreviewUrls";

describe("chatAttachmentPreviewUrls helpers", () => {
  it("deduplicates message attachments by artifact id while preserving first-seen metadata", () => {
    const messages: BaseChatMessageUnion[] = [
      {
        id: "user-attachment-message",
        role: ChatRoleEnum.user,
        content: [],
        attachments: [
          {
            id: "attachment-1",
            name: "release-plan.md",
            mimeType: "text/markdown",
            size: 128,
          },
        ],
      },
      {
        id: "assistant-attachment-message",
        role: ChatRoleEnum.assistant,
        content: [],
        attachments: [
          {
            id: "attachment-1",
            name: "release-plan-renamed.md",
            mimeType: "text/markdown",
            size: 256,
          },
          {
            id: "attachment-2",
            name: "diagram.png",
            mimeType: "image/png",
            size: 512,
          },
        ],
        tool_calls: null,
      },
    ];

    // Repeated attachment ids should not create duplicate preview fetch work.
    expect(collectChatMessageAttachments(messages)).toEqual([
      {
        id: "attachment-1",
        name: "release-plan.md",
        mimeType: "text/markdown",
        size: 128,
      },
      {
        id: "attachment-2",
        name: "diagram.png",
        mimeType: "image/png",
        size: 512,
      },
    ]);
  });

  it("treats soon-to-expire attachment URLs as stale", () => {
    // The preview loader should refresh URLs slightly ahead of expiration.
    expect(
      isChatAttachmentUrlStale({ url: "/artifact/1", expiresAt: 29_999 }, 0),
    ).toBe(true);
    expect(
      isChatAttachmentUrlStale({ url: "/artifact/2", expiresAt: 40_000 }, 0),
    ).toBe(false);
  });
});
