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
              content: [{ type: "text", text: "Original section" }],
              attachments: [],
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
        },
      });

      const messageGroup = getMessageGroup(section, "Original section");
      await expect(messageGroup).toBeVisible();
      await messageGroup.hover();

      await messageGroup
        .getByRole("button", { name: "Edit message" })
        .click();

      const editor = messageGroup.getByLabel("Edit message");
      await expect(editor).toBeVisible();

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
});

function getMessageGroup(container: Locator, text: string): Locator {
  return container.locator("div.group").filter({ hasText: text }).first();
}

function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}
