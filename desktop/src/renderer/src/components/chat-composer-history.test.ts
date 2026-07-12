import type { ChatInput, ComposerPromptHistoryEntry, ImageAttachment } from "@generated/backend";
import { describe, expect, test } from "vitest";

import {
  draftFromPromptHistoryEntry,
  promptHistoryNavigationAllowed,
  type ComposerPromptHistoryBrowsingState,
} from "./chat-composer-history";

describe("composer prompt history controller", () => {
  test("recalls typed text and image parts from history entries", () => {
    const attachment = imageAttachment("attachment_history");
    const entry = historyEntry({
      attachments: [attachment],
      input: {
        parts: [
          { image: null, text: { format: "plain", text: "describe" }, type: "text" },
          { image: { attachmentId: attachment.id, detail: "high" }, text: null, type: "image" },
        ],
      },
    });

    expect(draftFromPromptHistoryEntry(entry, 10)).toEqual({
      draft: {
        attachments: [attachment],
        imageInputsByAttachmentId: {
          [attachment.id]: { attachmentId: attachment.id, detail: "high" },
        },
        text: "describe",
      },
      error: null,
    });
  });

  test("returns a specific diagnostic when an image attachment cannot be restored", () => {
    const entry = historyEntry({
      attachments: [],
      input: {
        parts: [
          { image: null, text: { format: "plain", text: "describe" }, type: "text" },
          {
            image: { attachmentId: "attachment_missing", detail: null },
            text: null,
            type: "image",
          },
        ],
      },
    });

    expect(draftFromPromptHistoryEntry(entry, 10)).toEqual({
      draft: null,
      error: "Prompt history image is unavailable: attachment_missing",
    });
  });

  test("only takes ArrowUp from empty composers or unedited recalled entries", () => {
    const textarea = textareaWithValue("");

    expect(
      promptHistoryNavigationAllowed(
        "older",
        textarea,
        { attachments: [], imageInputsByAttachmentId: {}, text: "" },
        null,
      ),
    ).toBe(true);

    textarea.value = "line one\nline two";
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
    expect(
      promptHistoryNavigationAllowed(
        "older",
        textarea,
        { attachments: [], imageInputsByAttachmentId: {}, text: textarea.value },
        null,
      ),
    ).toBe(false);

    const browsing: ComposerPromptHistoryBrowsingState = {
      appliedDraft: { attachments: [], imageInputsByAttachmentId: {}, text: textarea.value },
      cursor: 0,
      preNavigationDraft: { attachments: [], imageInputsByAttachmentId: {}, text: "" },
    };
    expect(
      promptHistoryNavigationAllowed(
        "older",
        textarea,
        { attachments: [], imageInputsByAttachmentId: {}, text: textarea.value },
        browsing,
      ),
    ).toBe(false);

    textarea.selectionStart = 0;
    textarea.selectionEnd = 0;
    expect(
      promptHistoryNavigationAllowed(
        "older",
        textarea,
        { attachments: [], imageInputsByAttachmentId: {}, text: textarea.value },
        browsing,
      ),
    ).toBe(true);
    expect(
      promptHistoryNavigationAllowed(
        "newer",
        textarea,
        { attachments: [], imageInputsByAttachmentId: {}, text: textarea.value },
        browsing,
      ),
    ).toBe(false);

    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
    expect(
      promptHistoryNavigationAllowed(
        "newer",
        textarea,
        { attachments: [], imageInputsByAttachmentId: {}, text: textarea.value },
        browsing,
      ),
    ).toBe(true);
    expect(
      promptHistoryNavigationAllowed(
        "older",
        textarea,
        { attachments: [], imageInputsByAttachmentId: {}, text: "edited" },
        browsing,
      ),
    ).toBe(false);
  });
});

function historyEntry({
  attachments,
  input,
}: {
  attachments: ImageAttachment[];
  input: ChatInput;
}): ComposerPromptHistoryEntry {
  return {
    attachments,
    conversationId: "conversation_history",
    createdAt: "2026-07-02T00:00:00Z",
    input,
    messageId: "message_history",
    ordinal: 1,
  };
}

function imageAttachment(id: string): ImageAttachment {
  return {
    byteSize: 4,
    conversationId: "conversation_history",
    createdAt: "2026-07-02T00:00:00Z",
    fileName: "fixture.png",
    height: 2,
    id,
    mimeType: "image/png",
    schemaVersion: 1,
    variants: [
      {
        byteSize: 4,
        height: 2,
        kind: "thumbnail",
        mimeType: "image/png",
        url: "setta-chat-attachment://fixture/thumbnail",
        width: 2,
      },
    ],
    width: 2,
    workspaceId: "workspace_history",
  };
}

function textareaWithValue(value: string) {
  return {
    selectionEnd: value.length,
    selectionStart: value.length,
    value,
  } as HTMLTextAreaElement;
}
