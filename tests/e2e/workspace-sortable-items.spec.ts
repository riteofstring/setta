import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const DOCUMENT_STORAGE_KEY = "setta-workspace-playground-document-v1";

async function resetFieldListExample(page: Page): Promise<Locator> {
  await page.goto("/");
  await page.getByRole("button", { name: "Show workspace data" }).click();
  await page.getByRole("button", { name: "Reset example" }).click();
  const confirmation = page.getByRole("group", { name: "Confirm reset" });
  await confirmation.getByRole("button", { name: "Reset workspace" }).click();
  return page.getByRole("article", { name: "Profile fields" });
}

async function hideDataAndFit(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Hide workspace data" }).click();
  await page.getByRole("button", { name: "Fit sections" }).click();
}

async function setWorkspaceZoom(page: Page, zoom: number): Promise<void> {
  const editor = page.getByTestId("workspace-json");
  const document = JSON.parse(await editor.inputValue()) as {
    viewport: { x: number; y: number; zoom: number };
  };
  document.viewport = {
    x: 80 - 816 * zoom,
    y: 48 - 72 * zoom,
    zoom,
  };
  await editor.fill(JSON.stringify(document, null, 2));
  await page.getByRole("button", { name: "Import JSON" }).click();
  await page.getByRole("button", { name: "Hide workspace data" }).click();
}

async function itemTreeOrder(tree: Locator, parentId: string): Promise<readonly string[]> {
  return tree
    .locator(`[data-sortable-item-parent-id="${parentId}"] > [data-sortable-item-id]`)
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-sortable-item-id") ?? ""));
}

async function namedListOrder(tree: Locator, listId: string): Promise<readonly string[]> {
  return tree
    .locator(
      `[data-sortable-item-list-id="${listId}"] > .setta-workspace__sortable-item-list > [data-sortable-item-id]`,
    )
    .evaluateAll((items) => items.map((item) => item.getAttribute("data-sortable-item-id") ?? ""));
}

async function requiredBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${label} must expose browser geometry.`);
  return box;
}

async function beginPointerDrag(page: Page, source: Locator, target: Locator, targetBand: number) {
  const sourceBox = await requiredBox(source, "The item drag source");
  const targetBox = await requiredBox(target, "The item drag target");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height * targetBand,
    { steps: 12 },
  );
}

async function dispatchTouchDrag({
  onActivated,
  onBeforeEnd,
  page,
  source,
  target,
}: Readonly<{
  onActivated(): Promise<void>;
  onBeforeEnd(): Promise<void>;
  page: Page;
  source: Readonly<{ x: number; y: number }>;
  target: Readonly<{ x: number; y: number }>;
}>) {
  const cdp = await page.context().newCDPSession(page);
  const touchPoint = (x: number, y: number) => ({
    force: 1,
    id: 91,
    radiusX: 1,
    radiusY: 1,
    x,
    y,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    touchPoints: [touchPoint(source.x, source.y)],
    type: "touchStart",
  });
  await page.waitForTimeout(300);
  await onActivated();
  for (let index = 1; index <= 12; index += 1) {
    const progress = index / 12;
    await cdp.send("Input.dispatchTouchEvent", {
      touchPoints: [
        touchPoint(
          source.x + (target.x - source.x) * progress,
          source.y + (target.y - source.y) * progress,
        ),
      ],
      type: "touchMove",
    });
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
  }
  await onBeforeEnd();
  await cdp.send("Input.dispatchTouchEvent", { touchPoints: [], type: "touchEnd" });
  await cdp.detach();
}

test("keyboard item movement stays atomic, editable, persistent, and accessible", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  const fieldSection = await resetFieldListExample(page);
  await hideDataAndFit(page);
  const tree = fieldSection.getByRole("group", { name: "Profile field lists" });
  const nameInput = tree.getByRole("textbox", { name: "Name" });
  await nameInput.fill("Grace Hopper");
  await expect(nameInput).toHaveValue("Grace Hopper");
  await expect(page.getByRole("application")).toHaveAttribute(
    "data-workspace-interaction-owner",
    "none",
  );
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const value = localStorage.getItem(key);
        if (!value) return null;
        const document = JSON.parse(value) as {
          sections: Record<string, { data: { items?: Record<string, { value?: string }> } }>;
        };
        return document.sections["example-fields"]?.data.items?.name?.value ?? null;
      }, DOCUMENT_STORAGE_KEY),
    )
    .toBe("Grace Hopper");

  const emailHandle = tree.getByRole("button", { name: "Move Email" });
  const sectionHandle = fieldSection.getByRole("button", { name: "Move Profile fields" });
  await emailHandle.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await expect(tree.locator("[data-sortable-item-placeholder]")).toHaveCount(0);
  await expect(tree.getByRole("status")).toHaveText(
    "The selected items are back at their original position.",
  );
  await page.keyboard.press("Enter");
  expect(await namedListOrder(tree, "required-fields")).toEqual(["name", "email", "preferences"]);
  await expect(tree.getByRole("status")).toHaveText("Email did not move.");
  await expect(emailHandle).toBeFocused();

  await emailHandle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("application")).toHaveAttribute(
    "data-workspace-interaction-owner",
    "item-tree",
  );
  await expect(sectionHandle).toBeDisabled();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  const placeholder = tree.locator(
    '[data-sortable-item-destination-parent="preferences"]' +
      '[data-sortable-item-destination-index="1"]',
  );
  await expect(placeholder).toBeVisible();
  await expect(tree.getByRole("status")).toHaveText(
    "Preview: Email will move to Preferences, position 2.",
  );
  await expect(fieldSection).toHaveScreenshot("sortable-item-keyboard-preview.png");
  await page.keyboard.press("Enter");

  await expect(emailHandle).toBeFocused();
  await expect(page.getByRole("application")).toHaveAttribute(
    "data-workspace-interaction-owner",
    "none",
  );
  await expect(sectionHandle).toBeEnabled();
  expect(await namedListOrder(tree, "required-fields")).toEqual(["name", "preferences"]);
  expect(await itemTreeOrder(tree, "preferences")).toEqual(["theme", "email"]);
  await expect(tree.getByRole("status")).toHaveText("Email moved to Preferences, position 2.");
  await nameInput.focus();
  await page.waitForTimeout(300);
  await expect(nameInput).toBeFocused();

  await emailHandle.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Escape");
  await expect(emailHandle).toBeFocused();
  expect(await itemTreeOrder(tree, "preferences")).toEqual(["theme", "email"]);
  await expect(tree.getByRole("status")).toHaveText("Email movement canceled.");

  const canvas = page.getByRole("application");
  const sectionHandleBox = await requiredBox(sectionHandle, "The field-list section handle");
  await page.mouse.move(
    sectionHandleBox.x + sectionHandleBox.width / 2,
    sectionHandleBox.y + sectionHandleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    sectionHandleBox.x + sectionHandleBox.width / 2 + 24,
    sectionHandleBox.y + sectionHandleBox.height / 2 + 12,
    { steps: 4 },
  );
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "root-layout");
  await expect(emailHandle).toBeDisabled();
  await page.mouse.up();
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "none");
  await expect(emailHandle).toBeEnabled();
  await expect(fieldSection).toHaveAttribute("data-workspace-selected", "true");

  await emailHandle.focus();
  await page.keyboard.press("Enter");
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "item-tree");
  await expect(sectionHandle).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "none");
  await expect(emailHandle).toBeFocused();
  await expect(fieldSection).toHaveAttribute("data-workspace-selected", "true");
  const accessibility = await new AxeBuilder({ page })
    .include("[data-sortable-item-tree]")
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await emailHandle.focus();
  await page.keyboard.press("Enter");
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "item-tree");
  await page
    .getByRole("button", { name: "Show workspace data" })
    .evaluate((element: HTMLButtonElement) => element.click());
  const editor = page.getByTestId("workspace-json");
  const emptyDocument = JSON.parse(await editor.inputValue()) as {
    rootSections: unknown[];
    sections: Record<string, unknown>;
  };
  emptyDocument.rootSections = [];
  emptyDocument.sections = {};
  await editor.fill(JSON.stringify(emptyDocument, null, 2));
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "item-tree");
  await page
    .getByRole("button", { name: "Import JSON" })
    .evaluate((element: HTMLButtonElement) => element.click());
  await expect(canvas).toHaveAttribute("data-workspace-interaction-owner", "none");
  await expect(page.getByRole("region", { name: "Section workspace" })).toContainText(
    "No sections yet.",
  );
});

test("an accepted cross-list move survives JSON import and local reload", async ({ page }) => {
  await page.setViewportSize({ height: 1_200, width: 1_440 });
  let fieldSection = await resetFieldListExample(page);
  await hideDataAndFit(page);
  let tree = fieldSection.getByRole("group", { name: "Profile field lists" });

  await expect(tree.getByRole("region", { name: "Required fields" })).toBeVisible();
  await expect(tree.getByRole("region", { name: "Optional fields" })).toBeVisible();

  const emailHandle = tree.getByRole("button", { name: "Move Email" });
  await expect(emailHandle).toHaveAttribute("aria-keyshortcuts", /PageUp PageDown/u);
  await emailHandle.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowLeft");
  await expect(tree.getByRole("status")).toHaveText(
    "Items cannot move outside a named list. Use Page Up or Page Down to move between lists.",
  );
  await page.keyboard.press("PageDown");
  await expect(
    tree
      .getByRole("region", { name: "Optional fields" })
      .locator('[data-sortable-item-placeholder][data-sortable-item-destination-index="1"]'),
  ).toBeVisible();
  await expect(tree.getByRole("status")).toHaveText(
    "Preview: Email will move to the Optional fields list, position 2.",
  );
  await fieldSection.locator(".setta-workspace__section-content").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(fieldSection).toHaveScreenshot("sortable-item-cross-list-preview.png");
  await page.keyboard.press("Enter");
  await expect.poll(() => namedListOrder(tree, "required-fields")).toEqual(["name", "preferences"]);
  await expect.poll(() => namedListOrder(tree, "optional-fields")).toEqual(["notes", "email"]);
  await expect(tree.getByRole("button", { name: "Move Email" })).toBeFocused();
  await expect(tree.getByRole("status")).toHaveText(
    "Email moved to the Optional fields list, position 2.",
  );
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const stored = localStorage.getItem(key);
        if (!stored) return null;
        const document = JSON.parse(stored) as {
          sections: Record<
            string,
            {
              data?: {
                lists?: readonly {
                  listId: string;
                  tree: { childrenByParent?: Record<string, readonly string[]> };
                }[];
              };
            }
          >;
        };
        return document.sections["example-fields"]?.data?.lists ?? null;
      }, DOCUMENT_STORAGE_KEY),
    )
    .toMatchObject([
      {
        listId: "required-fields",
        tree: { childrenByParent: { "required-fields-root": ["name", "preferences"] } },
      },
      {
        listId: "optional-fields",
        tree: { childrenByParent: { "optional-fields-root": ["notes", "email"] } },
      },
    ]);

  await page.getByRole("button", { name: "Show workspace data" }).click();
  const editor = page.getByTestId("workspace-json");
  const movedDocumentJson = await editor.inputValue();
  await page.getByRole("button", { name: "Reset example" }).click();
  await page
    .getByRole("group", { name: "Confirm reset" })
    .getByRole("button", { name: "Reset workspace" })
    .click();
  fieldSection = page.getByRole("article", { name: "Profile fields" });
  tree = fieldSection.getByRole("group", { name: "Profile field lists" });
  await expect
    .poll(() => namedListOrder(tree, "required-fields"))
    .toEqual(["name", "email", "preferences"]);
  await expect.poll(() => namedListOrder(tree, "optional-fields")).toEqual(["notes"]);

  await editor.fill(movedDocumentJson);
  await page.getByRole("button", { name: "Import JSON" }).click();
  fieldSection = page.getByRole("article", { name: "Profile fields" });
  tree = fieldSection.getByRole("group", { name: "Profile field lists" });
  await expect.poll(() => namedListOrder(tree, "required-fields")).toEqual(["name", "preferences"]);
  await expect.poll(() => namedListOrder(tree, "optional-fields")).toEqual(["notes", "email"]);

  await page.reload();
  fieldSection = page.getByRole("article", { name: "Profile fields" });
  tree = fieldSection.getByRole("group", { name: "Profile field lists" });
  await expect.poll(() => namedListOrder(tree, "required-fields")).toEqual(["name", "preferences"]);
  await expect.poll(() => namedListOrder(tree, "optional-fields")).toEqual(["notes", "email"]);
});

test("pointer block feedback stays zoom-correct and excludes outer movement owners", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  let fieldSection = await resetFieldListExample(page);
  await setWorkspaceZoom(page, 0.5);
  fieldSection = page.getByRole("article", { name: "Profile fields" });
  await fieldSection.scrollIntoViewIfNeeded();
  let tree = fieldSection.getByRole("group", { name: "Profile field lists" });
  await tree.getByRole("button", { name: "Select Name" }).click();
  await expect(tree.getByRole("button", { name: "Deselect Name" })).toBeVisible();
  await tree.getByRole("button", { name: "Select Email" }).click({ modifiers: ["Control"] });
  await expect(tree.getByRole("button", { name: "Deselect Name" })).toBeVisible();
  await expect(tree.getByRole("button", { name: "Deselect Email" })).toBeVisible();
  const selectedItems = tree.locator(
    '[data-sortable-item-id="name"], [data-sortable-item-id="email"]',
  );
  const selectedBoxes = await selectedItems.evaluateAll((items) =>
    items.map((item) => {
      const rect = item.getBoundingClientRect();
      return { bottom: rect.bottom, top: rect.top };
    }),
  );
  const selectedHeight =
    Math.max(...selectedBoxes.map((box) => box.bottom)) -
    Math.min(...selectedBoxes.map((box) => box.top));
  await beginPointerDrag(
    page,
    tree.getByRole("button", { name: "Move Name" }),
    tree.locator('[data-sortable-item-id="notes"] > .setta-workspace__sortable-item-row'),
    0.95,
  );
  await expect(page.getByRole("application")).toHaveAttribute(
    "data-workspace-interaction-owner",
    "item-tree",
  );
  const placeholder = tree.locator('[data-sortable-item-placeholder-count="2"]');
  const overlay = page.locator('[data-sortable-item-overlay-count="2"]');
  await expect(placeholder).toBeVisible();
  await expect(overlay).toBeVisible();
  expect((await requiredBox(placeholder, "The multi-item placeholder")).height).toBeCloseTo(
    selectedHeight,
    0,
  );
  expect((await requiredBox(overlay, "The multi-item overlay")).height).toBeCloseTo(
    selectedHeight,
    0,
  );
  await page.mouse.up();
  await expect.poll(() => namedListOrder(tree, "required-fields")).toEqual(["preferences"]);
  await expect
    .poll(() => namedListOrder(tree, "optional-fields"))
    .toEqual(["notes", "name", "email"]);
  await expect(page.getByRole("application")).toHaveAttribute(
    "data-workspace-interaction-owner",
    "none",
  );

  await page.getByRole("button", { name: "Show workspace data" }).click();
  await page.getByRole("button", { name: "Reset example" }).click();
  await page
    .getByRole("group", { name: "Confirm reset" })
    .getByRole("button", { name: "Reset workspace" })
    .click();
  await setWorkspaceZoom(page, 2);
  fieldSection = page.getByRole("article", { name: "Profile fields" });
  await fieldSection.scrollIntoViewIfNeeded();
  tree = fieldSection.getByRole("group", { name: "Profile field lists" });
  await expect(tree.getByRole("button", { name: "Select Name" })).toBeVisible();
  await expect(tree.getByRole("button", { name: "Select Email" })).toBeVisible();
  await beginPointerDrag(
    page,
    tree.getByRole("button", { name: "Move Name" }),
    tree.locator('[data-sortable-item-id="email"] > .setta-workspace__sortable-item-row'),
    0.95,
  );
  const singlePlaceholder = tree.locator('[data-sortable-item-placeholder-count="1"]');
  await expect(singlePlaceholder).toBeVisible();
  const sourceHeight = (
    await requiredBox(tree.locator('[data-sortable-item-id="name"]'), "The zoomed item source")
  ).height;
  expect((await requiredBox(singlePlaceholder, "The zoomed item placeholder")).height).toBeCloseTo(
    sourceHeight,
    0,
  );
  await page.mouse.up();
  await expect
    .poll(() => namedListOrder(tree, "required-fields"))
    .toEqual(["email", "name", "preferences"]);
  await expect.poll(() => namedListOrder(tree, "optional-fields")).toEqual(["notes"]);
});

test("touch movement and host rejection preserve inputs and canonical item state", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1_000, width: 1_440 });
  let fieldSection = await resetFieldListExample(page);
  await hideDataAndFit(page);
  let tree = fieldSection.getByRole("group", { name: "Profile field lists" });
  const nameHandle = tree.getByRole("button", { name: "Move Name" });
  const preferencesRow = tree.locator(
    '[data-sortable-item-id="preferences"] > .setta-workspace__sortable-item-row',
  );
  const sourceBox = await requiredBox(nameHandle, "The touch item handle");
  const targetBox = await requiredBox(preferencesRow, "The touch group target");
  await dispatchTouchDrag({
    onActivated: async () => {
      await expect(page.getByRole("application")).toHaveAttribute(
        "data-workspace-interaction-owner",
        "item-tree",
      );
    },
    onBeforeEnd: async () => {
      await expect(
        tree.locator('[data-sortable-item-destination-parent="preferences"]'),
      ).toBeVisible();
    },
    page,
    source: { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 },
    target: { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 },
  });
  await expect.poll(() => itemTreeOrder(tree, "preferences")).toEqual(["theme", "name"]);

  await page.getByRole("button", { name: "Show workspace data" }).click();
  await page.getByRole("button", { name: "Reset example" }).click();
  await page
    .getByRole("group", { name: "Confirm reset" })
    .getByRole("button", { name: "Reset workspace" })
    .click();
  await hideDataAndFit(page);
  fieldSection = page.getByRole("article", { name: "Profile fields" });
  tree = fieldSection.getByRole("group", { name: "Profile field lists" });
  const notesInput = tree.getByRole("textbox", { name: "Notes" });
  await notesInput.fill("Editable during item DnD");
  await expect(notesInput).toHaveValue("Editable during item DnD");
  await beginPointerDrag(
    page,
    tree.getByRole("button", { name: "Move Notes" }),
    tree.locator('[data-sortable-item-id="preferences"] > .setta-workspace__sortable-item-row'),
    0.5,
  );
  await expect(tree.locator('[data-status="rejected"]')).toContainText(
    "The host rejected this item move.",
  );
  await expect(tree.getByText("Move unavailable")).toBeVisible();
  await page.mouse.up();
  expect(await namedListOrder(tree, "required-fields")).toEqual(["name", "email", "preferences"]);
  expect(await namedListOrder(tree, "optional-fields")).toEqual(["notes"]);
  const accessibility = await new AxeBuilder({ page })
    .include("[data-sortable-item-tree]")
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
