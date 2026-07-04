const workflowImagePNGBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAG0lEQVR4nGL6z8DA8J+BiZHh/38GBkAAAAD//x0hBAKGdL17AAAAAElFTkSuQmCC";

export async function runImageAttachmentWorkflow({
  backend,
  clickButtonByAria,
  client,
  conversationId,
  setInputValue,
  waitForRunWithPrompt,
  waitForState,
  waitForTexts,
  workspaceId,
}) {
  await pasteImageIntoComposer(client, waitForState, "workflow-image.png", workflowImagePNGBase64);
  await setInputValue(client, 'textarea[aria-label="Ask Setta"]', "image attachment workflow");
  await clickButtonByAria(client, "Send message");
  const run = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    "image attachment workflow",
    "completed",
  );
  await waitForTexts(client, [
    "image attachment workflow",
    "Scripted response: image attachment workflow",
  ]);

  const page = await backend.post("/chat/messages/page", {
    beforeBlockOrdinal: 0,
    conversationId,
    limit: 20,
    workspaceId,
  });
  const userMessage = page.messages.find(
    (message) =>
      message.role === "user" &&
      message.runId === run.id &&
      message.parts.some((part) => part.type === "image"),
  );
  if (!userMessage) {
    throw new Error(`image user message was not persisted: ${JSON.stringify(page.messages)}`);
  }
  const imagePart = userMessage.parts.find((part) => part.type === "image")?.image;
  if (!imagePart || imagePart.fileName !== "workflow-image.png" || !hasImageVariants(imagePart)) {
    throw new Error(`image part metadata was not persisted: ${JSON.stringify(imagePart)}`);
  }

  await waitForState(
    client,
    `Boolean(document.querySelector('button[aria-label="Preview workflow-image.png"]'))`,
    Boolean,
  );
  await waitForState(
    client,
    `Array.from(document.images).some((image) => image.alt === "workflow-image.png" && image.dataset.attachmentVariantKind === "inline" && image.src.endsWith("/inline"))`,
    Boolean,
  );
  await clickButtonByAria(client, "Preview workflow-image.png");
  await waitForState(
    client,
    `Array.from(document.images).some((image) => image.alt === "workflow-image.png" && image.dataset.attachmentVariantKind === "preview" && image.src.endsWith("/preview"))`,
    Boolean,
  );
  await clickButtonByAria(client, "Close image preview");
}

function hasImageVariants(imagePart) {
  const variants = new Map((imagePart.variants ?? []).map((variant) => [variant.kind, variant]));
  for (const kind of ["thumbnail", "inline", "preview", "original"]) {
    const variant = variants.get(kind);
    if (
      !variant ||
      !variant.url.endsWith(`/${kind}`) ||
      variant.byteSize <= 0 ||
      variant.width <= 0 ||
      variant.height <= 0
    ) {
      return false;
    }
  }
  return true;
}

export async function pasteImageIntoComposer(client, waitForState, fileName, base64) {
  await waitForState(
    client,
    `Boolean(document.querySelector('textarea[aria-label="Ask Setta"]:not([disabled])'))`,
    Boolean,
  );
  const pasted = await client.evaluate(`(async () => {
    const textarea = document.querySelector('textarea[aria-label="Ask Setta"]');
    if (!textarea) {
      return false;
    }
    const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (char) => char.charCodeAt(0));
    const file = new File([bytes], ${JSON.stringify(fileName)}, { type: "image/png" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    });
    textarea.dispatchEvent(event);
    return true;
  })()`);
  if (!pasted) {
    throw new Error("image paste event was not dispatched");
  }
  await waitForState(
    client,
    `Boolean(document.querySelector('img[alt=${JSON.stringify(fileName)}]'))`,
    Boolean,
  );
}
