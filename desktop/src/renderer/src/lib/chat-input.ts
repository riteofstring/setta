import type {
  ChatImageInput,
  ChatInput,
  ChatMessage,
  ImageAttachment,
  MessagePart,
} from "@generated/backend";

export function chatTextInput(text: string): ChatInput {
  return {
    parts: [
      {
        image: null,
        text: { format: "plain", text },
        type: "text",
      },
    ],
  };
}

export function chatInputFromDraft(
  text: string,
  attachments: ImageAttachment[],
  imageInputsByAttachmentId: Record<string, ChatImageInput | undefined> = {},
): ChatInput {
  const parts: ChatInput["parts"] = [];
  if (text !== "") {
    parts.push({
      image: null,
      text: { format: "plain", text },
      type: "text",
    });
  }
  for (const attachment of attachments) {
    const imageInput = imageInputsByAttachmentId[attachment.id];
    parts.push({
      image: {
        attachmentId: attachment.id,
        detail: imageInput?.detail ?? null,
      },
      text: null,
      type: "image",
    });
  }
  return { parts };
}

export function chatInputHasContent(input: ChatInput) {
  return input.parts.some((part) => {
    if (part.type === "text") {
      return part.text?.text.trim() !== "";
    }
    return part.type === "image" && part.image !== null;
  });
}

export function chatInputsEqual(left: ChatInput, right: ChatInput) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function chatInputFromMessageEdit(message: Pick<ChatMessage, "parts">, text: string) {
  const parts: ChatInput["parts"] = [];
  let textInserted = false;
  for (const part of message.parts) {
    if (part.type === "text") {
      if (!textInserted && text !== "") {
        parts.push({
          image: null,
          text: { format: "plain", text },
          type: "text",
        });
        textInserted = true;
      }
      continue;
    }
    if (part.type === "image" && part.image) {
      parts.push({
        image: {
          attachmentId: part.image.attachmentId,
          detail: part.image.detail,
        },
        text: null,
        type: "image",
      });
    }
  }
  if (!textInserted && text !== "") {
    parts.unshift({
      image: null,
      text: { format: "plain", text },
      type: "text",
    });
  }
  return { parts };
}

export function chatMessagePartsText(parts: MessagePart[]) {
  return parts.map((part) => (part.type === "text" ? (part.text?.text ?? "") : "")).join("");
}
