import { expect, test } from "@playwright/test";
import {
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

type CreateTopLevelSectionResponse = {
  sectionId: string;
};

test("plugins overview tab renders runtime controls and plugin section fallback", async ({
  page,
}) => {
  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  await expect(page.getByText("Plugin Runtime")).toBeVisible();
  await expect(page.getByText("Install Plugin")).toBeVisible();
  await expect(
    page.getByPlaceholder("github:owner/repo[#ref] or pypi:package[==version]"),
  ).toBeVisible();

  const created = await postBackend<CreateTopLevelSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId: projectContext.projectConfigId,
      implType: "Plugin",
      controlCodeObjType: null,
      implOverrides: {
        type: "Plugin",
        pluginId: "missing.plugin",
        kind: "example-widget",
        data: {
          title: "hello",
        },
      },
      position: null,
      topLevelSections: null,
      viewportBounds: null,
    },
  );
  expect(created?.sectionId).toBeTruthy();

  await expect(page.getByText("Plugin Section Unavailable")).toBeVisible();
  await expect(page.getByText("missing.plugin")).toBeVisible();
  await expect(page.getByText("example-widget")).toBeVisible();
});
