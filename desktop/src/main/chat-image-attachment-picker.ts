import { dialog } from "electron";

export async function selectChatImageAttachmentPaths(): Promise<string[] | null> {
  const scriptedPaths = testImageAttachmentSelectionPaths();
  if (scriptedPaths !== null) {
    return scriptedPaths;
  }
  const selection = await dialog.showOpenDialog({
    filters: [{ extensions: ["png", "jpg", "jpeg", "gif"], name: "Images" }],
    properties: ["openFile", "multiSelections"],
  });
  return selection.canceled ? null : selection.filePaths;
}

function testImageAttachmentSelectionPaths(): string[] | null {
  if (process.env.SETTA_E2E !== "1" || process.env.SETTA_E2E_IMAGE_ATTACHMENT_PATHS === undefined) {
    return null;
  }
  const parsed: unknown = JSON.parse(process.env.SETTA_E2E_IMAGE_ATTACHMENT_PATHS);
  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
    throw new Error("SETTA_E2E_IMAGE_ATTACHMENT_PATHS must be a JSON array of paths");
  }
  return parsed;
}
