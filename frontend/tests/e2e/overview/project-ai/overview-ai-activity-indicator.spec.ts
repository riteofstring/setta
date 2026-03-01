import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  getCurrentProjectConfigId,
  openIsolatedProject,
  setChatSectionState,
  setOverviewTab,
} from "../../helpers";

async function reloadCurrentProject(
  page: Page,
  expectedProjectConfigId: string,
): Promise<void> {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".react-flow__pane");
  await expect
    .poll(() => getCurrentProjectConfigId(page), { timeout: 20000 })
    .toBe(expectedProjectConfigId);
}

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
      await reloadCurrentProject(page, projectContext.projectConfigId);

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
      await reloadCurrentProject(page, projectContext.projectConfigId);

      await expect(
        page.getByTestId(`overview-ai-working-${sectionId}`),
      ).toHaveCount(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
