import { describe, expect, it } from "vitest";
import {
  ChatRoleEnum,
  createMessageTextContent,
} from "utils/generatedTypes";
import { buildEditedMessageHistory } from "./chatBranches";

describe("chatBranches", () => {
  it("truncates history and replaces edited message", () => {
    const messages = [
      {
        id: "msg-1",
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: "Original" })],
        attachments: [],
      },
      {
        id: "msg-2",
        role: ChatRoleEnum.assistant,
        content: [createMessageTextContent({ text: "Reply" })],
        attachments: [],
        tool_calls: null,
      },
    ];
    const edited = {
      id: "msg-1",
      role: ChatRoleEnum.user,
      content: [createMessageTextContent({ text: "Edited" })],
      attachments: [],
    };

    const result = buildEditedMessageHistory(messages, edited);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    if (!result) {
      return;
    }
    const first = result[0];
    if (first.content?.[0]?.type === "text") {
      expect(first.content[0].text).toBe("Edited");
    }
  });

  it("returns null when edited message id is missing", () => {
    const messages = [
      {
        id: "msg-1",
        role: ChatRoleEnum.user,
        content: [createMessageTextContent({ text: "Original" })],
        attachments: [],
      },
    ];
    const edited = {
      id: "missing",
      role: ChatRoleEnum.user,
      content: [createMessageTextContent({ text: "Edited" })],
      attachments: [],
    };

    const result = buildEditedMessageHistory(messages, edited);

    expect(result).toBeNull();
  });
});
