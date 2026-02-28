import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setChatSectionState,
  setOverviewTab,
  stopLatestProjectChat,
} from "../helpers";

test.describe.serial("chat branching", () => {
  test("project chat edit creates branch and switcher", async ({ page }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    const engineCleanup = await ensureManagedChatEngine(page);

    try {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      await overviewPane.getByRole("button", { name: "Thinking" }).click();

      const input = overviewPane.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();

      await input.fill("Original message");
      await input.press("Enter");

      const originalGroup = getMessageGroup(overviewPane, "Original message");
      await expect(originalGroup).toBeVisible();
      await expect(input).toHaveValue("", { timeout: 20000 });

      await stopLatestProjectChat(page, projectContext.projectConfigId);

      await page.reload();
      await page.waitForSelector(".react-flow__pane");
      const reloadedPane = page.locator("#OverviewPane");
      await expect(
        reloadedPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      await reloadedPane.getByRole("button", { name: "Thinking" }).click();

      await reloadedPane
        .getByRole("button", { name: "View History" })
        .click();

      const historyEntry = reloadedPane
        .locator("div.group\\/historyitem")
        .filter({ hasText: "Original message" })
        .first();
      await expect(historyEntry).toBeVisible();
      await historyEntry.click();

      const chatInput = reloadedPane.getByPlaceholder("Type a message...");
      await expect(chatInput).toBeEnabled({ timeout: 20000 });

      const originalMessageId = await getMessageGroupId(
        reloadedPane,
        "Original message",
      );
      const reloadedOriginalGroup = getMessageGroupById(
        reloadedPane,
        originalMessageId,
      );
      await expect(reloadedOriginalGroup).toBeVisible();

      await reloadedOriginalGroup.hover();
      const editButton = reloadedOriginalGroup.getByRole("button", {
        name: "Edit message",
      });
      await expect(editButton).toBeVisible();
      await expect(editButton).toBeEnabled({ timeout: 20000 });
      await editButton.click();

      const editor = reloadedOriginalGroup.getByLabel("Edit message");
      await expect(editor).toBeVisible();
      const editorLayout = await getEditLayout(
        editor,
        reloadedOriginalGroup.getByRole("button", {
          name: "Attachment options",
        }),
      );
      expect(editorLayout.paddingLeft).toBeGreaterThanOrEqual(36);
      expect(editorLayout.buttonRight).toBeLessThan(editorLayout.textStartX);
      await editor.fill("Edited message");
      await reloadedOriginalGroup
        .getByRole("button", { name: "Save" })
        .click();

      const editedGroup = getMessageGroup(reloadedPane, "Edited message");
      await expect(editedGroup).toBeVisible();
      await editedGroup.hover();
      await expect(editedGroup.getByText("2/2")).toBeVisible();

      await editedGroup
        .getByRole("button", { name: "Previous branch" })
        .click();

      const revertedGroup = getMessageGroup(reloadedPane, "Original message");
      await expect(revertedGroup).toBeVisible();
      await revertedGroup.hover();
      await expect(revertedGroup.getByText("1/2")).toBeVisible();
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("chat section edit creates branch and switcher", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_branch_section__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "msg-1",
              role: "user",
              content: [{ type: "text", text: "Original section" }],
              attachments: [],
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
        },
      });

      const originalMessageId = await getMessageGroupId(
        section,
        "Original section",
      );
      const originalGroup = getMessageGroupById(section, originalMessageId);
      await expect(originalGroup).toBeVisible();

      await originalGroup.hover();
      await originalGroup.getByRole("button", { name: "Edit message" }).click();

      const editor = originalGroup.getByLabel("Edit message");
      await expect(editor).toBeVisible();
      await editor.fill("Edited section");
      await originalGroup.getByRole("button", { name: "Save" }).click();

      const editedGroup = getMessageGroup(section, "Edited section");
      await expect(editedGroup).toBeVisible();
      await editedGroup.hover();
      await expect(editedGroup.getByText("2/2")).toBeVisible();

      await editedGroup
        .getByRole("button", { name: "Previous branch" })
        .click();

      const revertedGroup = getMessageGroup(section, "Original section");
      await expect(revertedGroup).toBeVisible();
      await revertedGroup.hover();
      await expect(revertedGroup.getByText("1/2")).toBeVisible();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

function getMessageGroup(container: Locator, text: string): Locator {
  return container.locator("div.group").filter({ hasText: text }).first();
}

function getMessageGroupById(container: Locator, messageId: string): Locator {
  return container
    .locator(`div.group[data-message-id="${messageId}"]`)
    .first();
}

async function getMessageGroupId(
  container: Locator,
  text: string,
): Promise<string> {
  const group = getMessageGroup(container, text);
  const messageId = await group.getAttribute("data-message-id");
  if (!messageId) {
    throw new Error(`Missing message id for text: ${text}`);
  }
  return messageId;
}

async function getEditLayout(
  editor: Locator,
  button: Locator,
): Promise<{
  paddingLeft: number;
  textStartX: number;
  buttonRight: number;
}> {
  const buttonHandle = await button.elementHandle();
  if (!buttonHandle) {
    throw new Error("Missing attachment options button.");
  }
  return editor.evaluate((element, buttonEl) => {
    const editorRect = element.getBoundingClientRect();
    const buttonRect = buttonEl.getBoundingClientRect();
    const paddingLeft = Number.parseFloat(
      window.getComputedStyle(element).paddingLeft,
    );
    return {
      paddingLeft,
      textStartX: editorRect.left + paddingLeft,
      buttonRight: buttonRect.right,
    };
  }, buttonHandle);
}

function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}
