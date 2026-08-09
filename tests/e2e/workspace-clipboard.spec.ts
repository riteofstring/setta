import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  PLAYGROUND_DOCUMENT_STORAGE_KEY,
  resetPlaygroundExample,
  seedEmptyPlaygroundDocument,
} from "./workspace-test-helpers.js";

const PLAYGROUND_ORIGIN = "http://127.0.0.1:4173";
const NATIVE_COPY_SHORTCUT = process.platform === "darwin" ? "Meta+c" : "Control+c";

async function grantClipboard(context: BrowserContext): Promise<void> {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: PLAYGROUND_ORIGIN,
  });
}

async function focusBlankCanvasPoint(page: Page): Promise<void> {
  const pane = page.locator(".react-flow__pane");
  const bounds = await pane.boundingBox();
  if (!bounds) throw new Error("The workspace canvas pane is not measurable.");
  // A pasted block anchored here stays inside the viewport culling overscan
  // even after smart placement moves it off the example sections.
  await page.mouse.move(bounds.x + bounds.width * 0.36, bounds.y + bounds.height * 0.75);
  const canvas = page.getByRole("application", { name: "Section workspace canvas" });
  await canvas.focus();
  await expect(canvas).toBeFocused();
}

async function workspaceDocument(page: Page) {
  return page.evaluate((key) => {
    const serialized = localStorage.getItem(key);
    if (serialized === null) throw new Error("The persisted workspace document is unavailable.");
    return JSON.parse(serialized) as {
      rootSections: Array<{ position: { x: number; y: number }; sectionId: string }>;
      sections: Record<string, { data: unknown; kind: string; title: string }>;
    };
  }, PLAYGROUND_DOCUMENT_STORAGE_KEY);
}

test("copy and paste clone a selected root block as one persistent history change", async ({
  context,
  page,
}) => {
  await grantClipboard(context);
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await seedEmptyPlaygroundDocument(page);
  await page.goto("/");
  await resetPlaygroundExample(page);

  const workspace = page.getByRole("region", { name: "Section workspace", exact: true });
  const selectNote = workspace.getByRole("button", { name: "Select Welcome note" });
  await selectNote.click();
  await workspace
    .getByRole("button", { name: "Select Workspace status" })
    .click({ modifiers: ["Shift"] });
  await selectNote.focus();
  await page.keyboard.press(NATIVE_COPY_SHORTCUT);
  const clipboardAnnouncement = workspace.locator("[data-workspace-clipboard-announcement]");
  await expect(clipboardAnnouncement).toHaveText(
    "Copied 2 selected sections with 2 sections in the complete subtree.",
  );

  await focusBlankCanvasPoint(page);
  await page.keyboard.press("Control+v");
  const copiedNote = workspace.locator('[data-workspace-section-id^="sample-note-copy-"]');
  const copiedStatus = workspace.locator('[data-workspace-section-id^="sample-status-copy-"]');
  await expect(copiedNote).toBeVisible();
  await expect(copiedStatus).toBeVisible();
  await expect(copiedNote).toHaveAttribute("data-workspace-selected", "true");
  await expect(copiedStatus).toHaveAttribute("data-workspace-selected", "true");
  await expect(copiedNote.getByRole("button", { name: "Select Welcome note" })).toBeFocused();
  await expect(clipboardAnnouncement).toHaveText("Pasted 2 sections in one change.");
  await expect(page.locator(".announcement")).toHaveText("Document change: section-paste.");

  const document = await workspaceDocument(page);
  const pastedRoots = document.rootSections.filter((root) => root.sectionId.includes("-copy-"));
  expect(pastedRoots).toHaveLength(2);
  expect((pastedRoots[1]?.position.x ?? 0) - (pastedRoots[0]?.position.x ?? 0)).toBe(0);
  expect((pastedRoots[1]?.position.y ?? 0) - (pastedRoots[0]?.position.y ?? 0)).toBe(248);
  await page.mouse.move(1_279, 1);
  await expect(workspace).toHaveScreenshot("workspace-pasted-root-block.png");

  await page.keyboard.press("Control+z");
  await expect(workspace.locator('[data-workspace-section-id*="-copy-"]')).toHaveCount(0);
  await expect(workspace.locator("[data-workspace-history-announcement]")).toHaveText(
    "Undo complete.",
  );
  await page.keyboard.press("Control+Shift+z");
  await expect(workspace.locator('[data-workspace-section-id*="-copy-"]')).toHaveCount(2);
  await expect(workspace.locator("[data-workspace-history-announcement]")).toHaveText(
    "Redo complete.",
  );

  await page.reload();
  await expect(page.getByRole("article", { name: "Welcome note" })).toHaveCount(2);
  await expect(page.getByRole("article", { name: "Workspace status" })).toHaveCount(2);
  const accessibility = await new AxeBuilder({ page })
    .include('[aria-label="Section workspace"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("untrusted clipboard versions and host-invalid payloads never mount a renderer", async ({
  context,
  page,
}) => {
  await grantClipboard(context);
  await seedEmptyPlaygroundDocument(page);
  await page.goto("/");
  await resetPlaygroundExample(page);
  const workspace = page.getByRole("region", { name: "Section workspace", exact: true });
  await workspace.getByRole("button", { name: "Select Welcome note" }).click();
  await page.keyboard.press(NATIVE_COPY_SHORTCUT);
  const validClipboard = await page.evaluate(() => navigator.clipboard.readText());
  const clipboardAnnouncement = workspace.locator("[data-workspace-clipboard-announcement]");

  await page.evaluate(async (serialized) => {
    const frame = JSON.parse(serialized) as { schemaVersion: number };
    frame.schemaVersion += 1;
    await navigator.clipboard.writeText(JSON.stringify(frame));
  }, validClipboard);
  await focusBlankCanvasPoint(page);
  await page.keyboard.press("Control+v");
  await expect(clipboardAnnouncement).toHaveText(
    "The copied sections use an unsupported clipboard version.",
  );
  await expect(workspace.getByRole("article", { name: "Welcome note" })).toHaveCount(1);

  await page.evaluate(async (serialized) => {
    const frame = JSON.parse(serialized) as {
      sections: Record<string, { data: unknown }>;
    };
    const sourceId = Object.keys(frame.sections)[0];
    if (!sourceId || !frame.sections[sourceId]) throw new Error("Missing copied source section.");
    frame.sections[sourceId].data = { count: 2, label: "wrong", type: "status" };
    await navigator.clipboard.writeText(JSON.stringify(frame));
  }, validClipboard);
  await page.keyboard.press("Control+v");
  await expect(clipboardAnnouncement).toContainText(
    "Paste failed because the clipboard section data is invalid.",
  );
  await expect(clipboardAnnouncement).toContainText('Note data for "example-note"');
  await expect(workspace.getByRole("article", { name: "Welcome note" })).toHaveCount(1);

  const accessibility = await new AxeBuilder({ page })
    .include('[aria-label="Section workspace"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.setViewportSize({ height: 720, width: 320 });
  const reflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(reflow.scrollWidth).toBeLessThanOrEqual(reflow.clientWidth);
});

test("workspace shortcuts do not replace native copy inside host inputs", async ({
  context,
  page,
}) => {
  await grantClipboard(context);
  await seedEmptyPlaygroundDocument(page);
  await page.goto("/");
  await resetPlaygroundExample(page);
  const workspace = page.getByRole("region", { name: "Section workspace", exact: true });
  const input = workspace.getByRole("textbox", { name: "Name" });
  await input.focus();
  await input.evaluate((element: HTMLInputElement) => element.select());
  await page.keyboard.press(NATIVE_COPY_SHORTCUT);

  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("Ada Lovelace");
  await expect(workspace.locator("[data-workspace-clipboard-announcement]")).toHaveText("");
  await expect(input).toBeFocused();
});
