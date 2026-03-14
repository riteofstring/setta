import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  openIsolatedProject,
  setChatSectionState,
} from "../helpers";

test.describe.serial("chat editing", () => {
  test("cancel clears newly uploaded attachments", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const originalMessageText =
        "Original section text with enough words to establish a wider user bubble before editing.";
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_edit_section__",
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
              content: [{ type: "text", text: originalMessageText }],
              attachments: [],
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
        },
      });

      const messageGroup = getMessageGroup(section, originalMessageText);
      await expect(messageGroup).toBeVisible();
      await messageGroup.hover();

      const userBubbleBeforeEdit = messageGroup
        .locator('[data-chat-user-bubble="true"]')
        .first();
      const bubbleLayoutBeforeEdit = await userBubbleBeforeEdit.evaluate(
        (bubble) => {
          const rect = bubble.getBoundingClientRect();
          return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          };
        },
      );

      await messageGroup
        .getByRole("button", { name: "Edit message" })
        .click();

      const editor = messageGroup.getByLabel("Edit message");
      await expect(editor).toBeVisible();
      const editorClasses = await editor.getAttribute("class");
      expect(editorClasses).toContain("bg-transparent");
      expect(editorClasses).toContain("border-0");

      const userBubbleInEditMode = messageGroup
        .locator('[data-chat-user-bubble="true"]')
        .first();
      const bubbleLayoutInEditMode = await userBubbleInEditMode.evaluate(
        (bubble) => {
          const rect = bubble.getBoundingClientRect();
          return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          };
        },
      );
      expect(
        Math.abs(bubbleLayoutInEditMode.width - bubbleLayoutBeforeEdit.width),
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(bubbleLayoutInEditMode.left - bubbleLayoutBeforeEdit.left),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(bubbleLayoutInEditMode.height - bubbleLayoutBeforeEdit.height),
      ).toBeLessThanOrEqual(40);

      const editorAttachmentLayout = await messageGroup.evaluate((group) => {
        const bubble = group.querySelector('[data-chat-user-bubble="true"]');
        const attachmentButton = group.querySelector(
          'button[aria-label="Attachment options"]',
        );
        if (!bubble || !attachmentButton) {
          return null;
        }
        const bubbleRect = bubble.getBoundingClientRect();
        const buttonRect = attachmentButton.getBoundingClientRect();
        return {
          buttonLeftOffset: buttonRect.left - bubbleRect.left,
          buttonRightOffset: buttonRect.right - bubbleRect.left,
          buttonTopOffset: buttonRect.top - bubbleRect.top,
        };
      });
      expect(editorAttachmentLayout).not.toBeNull();
      if (!editorAttachmentLayout) {
        throw new Error("Missing editor attachment button.");
      }
      expect(editorAttachmentLayout.buttonLeftOffset).toBeGreaterThanOrEqual(
        4,
      );
      expect(editorAttachmentLayout.buttonLeftOffset).toBeLessThanOrEqual(
        24,
      );
      expect(editorAttachmentLayout.buttonRightOffset).toBeGreaterThanOrEqual(
        20,
      );
      expect(editorAttachmentLayout.buttonRightOffset).toBeLessThanOrEqual(
        40,
      );
      expect(editorAttachmentLayout.buttonTopOffset).toBeGreaterThanOrEqual(1);
      expect(editorAttachmentLayout.buttonTopOffset).toBeLessThanOrEqual(18);

      const sideRail = messageGroup.locator('[data-chat-editor-side-rail="true"]');
      await expect(sideRail).toBeVisible();

      const updateRequestPromise = page.waitForRequest((request) => {
        return (
          request.url().includes("/api/updateArtifacts") &&
          request.method() === "POST"
        );
      });

      const fileInput = messageGroup.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Hello from edit."),
      });

      const updateRequest = await updateRequestPromise;
      const updatePayload = JSON.parse(updateRequest.postData() ?? "{}");
      const artifactId = updatePayload?.artifacts?.[0]?.id;
      expect(artifactId).toBeTruthy();

      await expect(messageGroup.getByText("notes.txt")).toBeVisible();

      const deleteRequestPromise = page.waitForRequest((request) => {
        if (
          !request.url().includes("/api/deleteArtifacts") ||
          request.method() !== "POST"
        ) {
          return false;
        }
        const body = request.postData() ?? "";
        return artifactId ? body.includes(artifactId) : false;
      });

      await messageGroup.getByRole("button", { name: "Cancel" }).click();

      const deleteRequest = await deleteRequestPromise;
      const deletePayload = JSON.parse(deleteRequest.postData() ?? "{}");
      expect(
        deletePayload?.artifacts?.some(
          (artifact: { id?: string }) => artifact.id === artifactId,
        ),
      ).toBe(true);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("message actions are icon-only and anchored beside bubbles by role", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_edit_action_corner__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "msg-corner",
              role: "user",
              content: [{ type: "text", text: "Corner controls" }],
              attachments: [],
            },
            {
              id: "msg-assistant-corner",
              role: "assistant",
              content: [{ type: "text", text: "Assistant corner controls" }],
              attachments: [],
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
        },
      });

      const messageGroup = getMessageGroup(section, "Corner controls");
      await expect(messageGroup).toBeVisible();
      await messageGroup.hover();

      const userBubble = messageGroup
        .locator('[data-chat-user-bubble="true"]')
        .first();
      const copyButton = messageGroup.getByRole("button", {
        name: "Copy message",
      });
      const editButton = messageGroup.getByRole("button", {
        name: "Edit message",
      });
      await expect(userBubble).toBeVisible();
      await expect(copyButton).toBeVisible();
      await expect(editButton).toBeVisible();

      // Keep the lighter blue user bubble in light mode and dark palette in dark mode.
      const bubbleClasses = await userBubble.getAttribute("class");
      expect(bubbleClasses).toContain("bg-blue-200");
      expect(bubbleClasses).toContain("dark:bg-blue-950");
      expect(bubbleClasses).toContain("pt-1");

      const buttonText = await messageGroup.evaluate((group) => {
        const copy = group.querySelector('button[aria-label="Copy message"]');
        const edit = group.querySelector('button[aria-label="Edit message"]');
        if (!copy || !edit) {
          return null;
        }
        return {
          copyText: copy.textContent?.trim() ?? "",
          editText: edit.textContent?.trim() ?? "",
        };
      });
      expect(buttonText).not.toBeNull();
      if (!buttonText) {
        throw new Error("Missing copy/edit buttons.");
      }
      expect(buttonText.copyText).toBe("");
      expect(buttonText.editText).toBe("");

      // User actions stay just outside the bubble on the left and remain vertically centered.
      const actionLayout = await messageGroup.evaluate((group) => {
        const bubble = group.querySelector('[data-chat-user-bubble="true"]');
        const actions = group.querySelector('[data-chat-message-actions="true"]');
        const copy = group.querySelector('button[aria-label="Copy message"]');
        const edit = group.querySelector('button[aria-label="Edit message"]');
        if (!bubble || !actions || !copy || !edit) {
          return null;
        }
        const bubbleRect = bubble.getBoundingClientRect();
        const actionsRect = actions.getBoundingClientRect();
        const copyRect = copy.getBoundingClientRect();
        const editRect = edit.getBoundingClientRect();
        return {
          horizontalGap: bubbleRect.left - actionsRect.right,
          verticalCenterDelta:
            Math.abs(
              actionsRect.top +
                actionsRect.height / 2 -
                (bubbleRect.top + bubbleRect.height / 2),
            ),
          copyRightToBubbleLeft: bubbleRect.left - copyRect.right,
          editRightToBubbleLeft: bubbleRect.left - editRect.right,
        };
      });
      expect(actionLayout).not.toBeNull();
      if (!actionLayout) {
        throw new Error("Missing action layout metrics.");
      }

      expect(actionLayout.horizontalGap).toBeGreaterThanOrEqual(0);
      expect(actionLayout.horizontalGap).toBeLessThanOrEqual(16);
      expect(actionLayout.verticalCenterDelta).toBeLessThanOrEqual(8);
      expect(actionLayout.copyRightToBubbleLeft).toBeGreaterThanOrEqual(0);
      expect(actionLayout.editRightToBubbleLeft).toBeGreaterThanOrEqual(0);

      const assistantGroup = getMessageGroup(section, "Assistant corner controls");
      await expect(assistantGroup).toBeVisible();
      await assistantGroup.hover();

      const assistantBubble = assistantGroup
        .locator('[data-chat-assistant-bubble="true"]')
        .first();
      const assistantCopyButton = assistantGroup.getByRole("button", {
        name: "Copy message",
      });
      await expect(assistantBubble).toBeVisible();
      await expect(assistantCopyButton).toBeVisible();

      const assistantLayout = await assistantGroup.evaluate((group) => {
        const bubble = group.querySelector(
          '[data-chat-assistant-bubble="true"]',
        );
        const actions = group.querySelector('[data-chat-message-actions="true"]');
        const copy = group.querySelector('button[aria-label="Copy message"]');
        if (!bubble || !actions || !copy) {
          return null;
        }
        const bubbleRect = bubble.getBoundingClientRect();
        const messageContainerRect = group.getBoundingClientRect();
        const actionsRect = actions.getBoundingClientRect();
        const copyRect = copy.getBoundingClientRect();
        return {
          horizontalGap: actionsRect.left - messageContainerRect.right,
          verticalCenterDelta:
            Math.abs(
              actionsRect.top +
                actionsRect.height / 2 -
                (messageContainerRect.top + messageContainerRect.height / 2),
            ),
          copyLeftToBubbleRight: copyRect.left - bubbleRect.right,
        };
      });
      expect(assistantLayout).not.toBeNull();
      if (!assistantLayout) {
        throw new Error("Missing assistant action layout metrics.");
      }

      expect(assistantLayout.horizontalGap).toBeGreaterThanOrEqual(0);
      expect(assistantLayout.horizontalGap).toBeLessThanOrEqual(16);
      expect(assistantLayout.verticalCenterDelta).toBeLessThanOrEqual(8);
      expect(assistantLayout.copyLeftToBubbleRight).toBeGreaterThanOrEqual(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("message actions stay stacked in narrow chats", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_edit_action_stack__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "msg-stack-user",
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Please keep these controls stacked in a narrow chat.",
                },
              ],
              attachments: [],
            },
            {
              id: "msg-stack-assistant",
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Here is the current answer that exposes both copy and redo actions.",
                },
              ],
              attachments: [],
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
        },
      });

      const userGroup = getMessageGroup(
        section,
        "Please keep these controls stacked in a narrow chat.",
      );
      await expect(userGroup).toBeVisible();

      await section.evaluate((element) => {
        const sectionElement = element as HTMLElement;
        sectionElement.style.width = "560px";
        sectionElement.style.maxWidth = "560px";
      });
      await userGroup.hover();
      await expect(userGroup.getByRole("button", { name: "Copy message" })).toBeVisible();
      await expect(userGroup.getByRole("button", { name: "Edit message" })).toBeVisible();
      await expect
        .poll(() => getActionBarFlexDirection(userGroup))
        .toBe("column");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

function getMessageGroup(container: Locator, text: string): Locator {
  return container.locator("div.group").filter({ hasText: text }).first();
}

async function getActionBarFlexDirection(messageGroup: Locator): Promise<string> {
  return await messageGroup
    .locator('[data-chat-message-actions="true"]')
    .first()
    .evaluate((element) => window.getComputedStyle(element).flexDirection);
}

function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}
