import { expect, test } from "@playwright/test";
import path from "path";
import {
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";

type CreateTopLevelSectionResponse = {
  sectionId: string;
};

test("plugins overview tab supports fixture plugin render and disabled fallback", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend",
  );
  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);
  await expect(page.getByText("Plugin Runtime")).toBeVisible();
  await expect(page.getByText("Install Plugin")).toBeVisible();
  await page
    .getByRole("button", { name: "Restart Setta", exact: true })
    .click();
  await expect(page.getByText("Manual restart required: setta")).toBeVisible();
  await expect(
    page.getByPlaceholder("github:owner/repo[#ref] or pypi:package[==version]"),
  ).toBeVisible();
  await expect(page.locator("select").first()).toHaveValue("workspace");
  await expect(page.locator("select option[value='workspace']")).toHaveText(
    "workspace",
  );
  await expect(page.locator("select option[value='environment']")).toHaveText(
    "environment",
  );
  await expect(page.locator("select option[value='global']")).toHaveText(
    "global",
  );

  await postBackend(page, "/plugins/link", {
    localPluginRoot: fixturePluginRoot,
    scope: "workspace",
    enable: true,
    force: true,
  });
  await postBackend(page, "/plugins/rescan", {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".react-flow__pane");
  await expect(page.getByText("setta-fixture-frontend@0.1.0")).toBeVisible();
  await expect(page.getByText(/scope=workspace source=local:/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Fixture Pane", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Fixture pane mounted.", { exact: true }),
  ).toBeVisible();
  const fixtureCommandButton = page.getByRole("button", {
    name: "Fixture Command",
    exact: true,
  });
  await expect(fixtureCommandButton).toBeVisible();
  await fixtureCommandButton.click();

  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error(
      "Unable to resolve viewport bounds for plugin section placement.",
    );
  }

  const created = await postBackend<CreateTopLevelSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId: projectContext.projectConfigId,
      implType: "Plugin",
      controlCodeObjType: null,
      implOverrides: {
        type: "Plugin",
        pluginId: "setta-fixture-frontend",
        kind: "fixture-card",
        data: {
          text: "hello plugin",
        },
      },
      position: {
        x: viewportBounds.x + viewportBounds.w * 0.45,
        y: viewportBounds.y + viewportBounds.h * 0.25,
      },
      topLevelSections: null,
      viewportBounds,
    },
  );
  expect(created?.sectionId).toBeTruthy();

  await expect(page.getByText("Fixture Plugin Card")).toBeVisible();
  await expect(page.getByText("fixture:hello plugin")).toBeVisible();

  await postBackend(page, "/plugins/disable", {
    pluginId: "setta-fixture-frontend",
  });
  await postBackend(page, "/plugins/rescan", {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".react-flow__pane");

  await expect(page.getByText("Plugin Section Unavailable")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy Section JSON", exact: true }),
  ).toBeVisible();
});
