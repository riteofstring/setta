import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

type CreateTopLevelSectionResponse = {
  sectionId?: string;
};

test("plugin-not-installed fallback uses canonical scope wording", async ({
  page,
}) => {
  const projectContext = await openIsolatedProject(page);
  try {
    await page.waitForSelector(".react-flow__pane");
    const viewportBounds = await getViewportBoundsForPlacement(page);
    if (!viewportBounds) {
      throw new Error("Unable to resolve viewport bounds for plugin section.");
    }

    const created = await postBackend<CreateTopLevelSectionResponse>(
      page,
      "/createTopLevelSection",
      {
        projectConfigId: projectContext.projectConfigId,
        implType: "Plugin",
        implOverrides: {
          type: "Plugin",
          pluginId: "missing.plugin",
          kind: "missing-kind",
          data: {
            text: "fallback wording",
          },
        },
        viewportBounds,
      },
    );
    expect(created?.sectionId).toBeTruthy();

    await expect(page.getByText("Plugin Section Unavailable")).toBeVisible();
    await expect(
      page.getByText(
        "Plugin is not installed in this workspace or setta_files scope.",
      ),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
