import { readFile } from "node:fs/promises";

import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const DOCUMENT_STORAGE_KEY = "setta-workspace-playground-document-v1";
const PREFERENCES_STORAGE_KEY = "setta-workspace-playground-preferences-v1";

async function showWorkspaceData(page: Page): Promise<void> {
  const disclosure = page.getByRole("button", { name: "Show workspace data" });
  await disclosure.click();
  await expect(page.getByRole("button", { name: "Hide workspace data" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
}

test("the playground imports, exports, resets, and locally restores workspace state", async ({
  page,
}) => {
  await page.setViewportSize({ height: 900, width: 1280 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");

  const documentJson = page.getByTestId("workspace-json");
  const resetExample = page.getByRole("button", { name: "Reset example" });
  await expect(page.getByRole("region", { name: "Section workspace" })).toContainText(
    "No sections yet.",
  );

  await showWorkspaceData(page);
  await resetExample.click();
  const confirmation = page.getByRole("group", { name: "Confirm reset" });
  const resetWorkspace = confirmation.getByRole("button", { name: "Reset workspace" });
  await expect(resetWorkspace).toBeFocused();
  await page.keyboard.press("Enter");

  const welcomeNote = page.getByRole("article", { name: "Welcome note" });
  const workspaceStatus = page.getByRole("article", { name: "Workspace status" });
  const profileFields = page.getByRole("article", { name: "Profile fields" });
  await expect(welcomeNote).toContainText("Arrange sections freely");
  await expect(workspaceStatus).toContainText("3 workspace checks ready");
  await expect(profileFields.getByRole("textbox", { name: "Name" })).toHaveValue("Ada Lovelace");
  await expect(page.locator(".announcement")).toHaveText(
    "Example workspace restored with a note, status, and field-list section.",
  );
  await expect(page.locator(".playground-host-controls")).toHaveScreenshot(
    "playground-persistence-controls.png",
  );

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("setta-workspace.json");
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("The workspace JSON export did not produce a local download.");
  }
  const exportedDocument = JSON.parse(await readFile(downloadPath, "utf8")) as {
    sections: Record<string, { title: string }>;
  };
  expect(exportedDocument.sections["example-note"]?.title).toBe("Welcome note");
  expect(exportedDocument.sections["example-fields"]?.title).toBe("Profile fields");

  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  await page.getByRole("checkbox", { name: "Show grid" }).uncheck();
  await page.getByRole("checkbox", { name: "Snap to grid" }).uncheck();

  const importedDocument = JSON.parse(await documentJson.inputValue()) as {
    schemaVersion: number;
    sections: Record<string, { title: string }>;
  };
  const currentSchemaVersion = importedDocument.schemaVersion;
  const welcomeSection = importedDocument.sections["example-note"];
  if (!welcomeSection) {
    throw new Error("The example note is missing from the exported document.");
  }
  welcomeSection.title = "Persisted planning note";
  await documentJson.fill(JSON.stringify(importedDocument, null, 2));
  await page.getByRole("button", { name: "Import JSON" }).click();
  await expect(page.getByRole("article", { name: "Persisted planning note" })).toBeVisible();
  await expect(page.locator(".announcement")).toHaveText(
    "Workspace imported. 3 sections restored.",
  );

  await documentJson.fill("{");
  await page.getByRole("button", { name: "Import JSON" }).click();
  await expect(documentJson).toHaveAttribute("aria-invalid", "true");
  await expect(documentJson).toBeFocused();
  await expect(page.locator("#workspace-json-error")).toHaveText(
    "Enter valid JSON, then import it again.",
  );
  await expect(page.getByRole("article", { name: "Persisted planning note" })).toBeVisible();

  importedDocument.schemaVersion = currentSchemaVersion + 1;
  await documentJson.fill(JSON.stringify(importedDocument, null, 2));
  await page.getByRole("button", { name: "Import JSON" }).click();
  await expect(page.locator("#workspace-json-error")).toContainText(
    `Use workspace schema version ${String(currentSchemaVersion)}`,
  );
  await expect(page.getByRole("article", { name: "Persisted planning note" })).toBeVisible();

  importedDocument.schemaVersion = currentSchemaVersion;
  const statusSection = importedDocument.sections["example-status"] as unknown as {
    data: unknown;
  };
  statusSection.data = { body: "Wrong renderer payload", type: "note" };
  await documentJson.fill(JSON.stringify(importedDocument, null, 2));
  await page.getByRole("button", { name: "Import JSON" }).click();
  await expect(page.locator("#workspace-json-error")).toContainText(
    'Status data for "example-status"',
  );
  await expect(page.getByRole("article", { name: "Workspace status" })).toContainText(
    "3 workspace checks ready",
  );

  await page.getByRole("button", { name: "Restore current JSON" }).click();
  await expect(documentJson).not.toHaveAttribute("aria-invalid");
  await page.reload();
  await expect(page.getByRole("article", { name: "Persisted planning note" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Appearance" })).toHaveValue("dark");
  await expect(page.getByRole("checkbox", { name: "Show grid" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Snap to grid" })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Snap to grid" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await showWorkspaceData(page);
  await resetExample.click();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(resetExample).toBeFocused();
  await expect(page.getByRole("article", { name: "Persisted planning note" })).toBeVisible();
  await resetExample.click();
  await resetWorkspace.click();
  await expect(page.getByRole("article", { name: "Welcome note" })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("invalid saved state recovers accessibly without losing reflow or input reachability", async ({
  page,
}) => {
  await page.addInitScript(
    ({ documentKey, preferencesKey }) => {
      window.localStorage.setItem(documentKey, "{");
      window.localStorage.setItem(preferencesKey, "[]");
    },
    { documentKey: DOCUMENT_STORAGE_KEY, preferencesKey: PREFERENCES_STORAGE_KEY },
  );
  await page.setViewportSize({ height: 720, width: 320 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.locator(".announcement")).toContainText(
    "Saved workspace could not be restored.",
  );
  await expect(page.locator(".announcement")).toContainText("Default preferences are active.");
  await expect(page.getByRole("region", { name: "Section workspace" })).toContainText(
    "No sections yet.",
  );
  await showWorkspaceData(page);

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  for (const control of [
    page.getByRole("link", { name: "Export JSON" }),
    page.getByRole("button", { name: "Import JSON" }),
    page.getByRole("button", { name: "Reset example" }),
  ]) {
    const bounds = await control.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
  }
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  const importButton = page.getByRole("button", { name: "Import JSON" });
  await importButton.focus();
  await expect(importButton).toBeFocused();
  await expect(importButton).toBeVisible();
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await session.detach();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
