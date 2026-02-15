import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  openIsolatedProject,
  setChatSectionState,
  setOverviewTab,
} from "../helpers";

test.describe.serial("overview AI activity indicator", () => {
  test("shows and clears section activity badges as chat work starts and stops", async ({
    page,
  }) => {
    await setOverviewTab(page, "Overview");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_overview_activity__",
      );

      await expect(
        page.locator(`[id="${sectionId}-OverviewListItem"]`),
      ).toBeVisible();
      await expect(
        page.getByTestId(`overview-ai-working-${sectionId}`),
      ).toHaveCount(0);

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "msg-running",
              role: "assistant",
              content: [{ type: "text", text: "Working..." }],
              attachments: [],
            },
          ],
          inputText: "",
          waitingForResponse: true,
          toolCallArguments: {},
          activeBranchId: null,
          branches: {},
        },
      });

      await expect(
        page.getByTestId(`overview-ai-working-${sectionId}`),
      ).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "msg-running",
              role: "assistant",
              content: [{ type: "text", text: "Working..." }],
              attachments: [],
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
          activeBranchId: null,
          branches: {},
        },
      });

      await expect(
        page.getByTestId(`overview-ai-working-${sectionId}`),
      ).toHaveCount(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
