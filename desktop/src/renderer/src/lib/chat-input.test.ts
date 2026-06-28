import type { ChatMessage, ImageAttachment } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { chatInputFromDraft, chatInputFromMessageEdit, chatMessagePartsText } from "./chat-input";

const attachment: ImageAttachment = {
  byteSize: 12,
  conversationId: "conversation_api",
  createdAt: "2026-05-29T20:00:00Z",
  fileName: "fixture.png",
  height: 2,
  id: "attachment_api",
  mimeType: "image/png",
  previewUrl: "setta-attachment://image/workspace_api/conversation_api/attachment_api/preview",
  schemaVersion: 1,
  thumbnailUrl: "setta-attachment://image/workspace_api/conversation_api/attachment_api/thumbnail",
  width: 2,
  workspaceId: "workspace_api",
};

describe("chat input helpers", () => {
  test("builds ordered text and image input parts", () => {
    expect(chatInputFromDraft("describe", [attachment])).toEqual({
      parts: [
        {
          image: null,
          text: { format: "plain", text: "describe" },
          type: "text",
        },
        {
          image: { attachmentId: "attachment_api", detail: null },
          text: null,
          type: "image",
        },
      ],
    });
  });

  test("preserves image attachments when editing queued text", () => {
    const message: ChatMessage = {
      conversationId: "conversation_api",
      createdAt: "2026-05-29T20:00:00Z",
      delivery: "queued",
      id: "message_queued",
      ordinal: 1,
      parts: [
        {
          id: "part_text",
          image: null,
          text: { format: "plain", text: "old text" },
          type: "text",
        },
        {
          id: "part_image",
          image: {
            attachmentId: "attachment_api",
            byteSize: 12,
            detail: "high",
            fileName: "fixture.png",
            height: 2,
            mimeType: "image/png",
            previewUrl: attachment.previewUrl,
            thumbnailUrl: attachment.thumbnailUrl,
            width: 2,
          },
          text: null,
          type: "image",
        },
      ],
      role: "user",
      runId: "run_queued",
      schemaVersion: 1,
      status: "pending",
      updatedAt: "2026-05-29T20:00:00Z",
    };

    expect(chatInputFromMessageEdit(message, "new text")).toEqual({
      parts: [
        {
          image: null,
          text: { format: "plain", text: "new text" },
          type: "text",
        },
        {
          image: { attachmentId: "attachment_api", detail: "high" },
          text: null,
          type: "image",
        },
      ],
    });
    expect(chatMessagePartsText(message.parts)).toBe("old text");
  });

  test("preserves queued image when text is removed", () => {
    const message: ChatMessage = {
      conversationId: "conversation_api",
      createdAt: "2026-05-29T20:00:00Z",
      delivery: "queued",
      id: "message_queued",
      ordinal: 1,
      parts: [
        {
          id: "part_text",
          image: null,
          text: { format: "plain", text: "old text" },
          type: "text",
        },
        {
          id: "part_image",
          image: {
            attachmentId: "attachment_api",
            byteSize: 12,
            detail: null,
            fileName: "fixture.png",
            height: 2,
            mimeType: "image/png",
            previewUrl: attachment.previewUrl,
            thumbnailUrl: attachment.thumbnailUrl,
            width: 2,
          },
          text: null,
          type: "image",
        },
      ],
      role: "user",
      runId: "run_queued",
      schemaVersion: 1,
      status: "pending",
      updatedAt: "2026-05-29T20:00:00Z",
    };

    expect(chatInputFromMessageEdit(message, "")).toEqual({
      parts: [
        {
          image: { attachmentId: "attachment_api", detail: null },
          text: null,
          type: "image",
        },
      ],
    });
  });
});
