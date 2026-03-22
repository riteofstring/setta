import { expect, test } from "@playwright/test";
import path from "path";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  refreshProjectStateFromBackend,
  setOverviewTab,
} from "../../helpers";

type CreateTopLevelSectionResponse = {
  sectionId?: string;
};

test("frontend react fixture registers a React-rendered section kind", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend-react",
  );

  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);

  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: fixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

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
          pluginId: "setta-fixture-frontend-react",
          kind: "fixture-react-card",
          data: {
            title: "React Fixture",
            details: "React section fixture active.",
            tags: ["react", "plugin"],
            pinned: false,
            pulses: 0,
          },
        },
        position: {
          x: viewportBounds.x + viewportBounds.w * 0.48,
          y: viewportBounds.y + viewportBounds.h * 0.28,
        },
        topLevelSections: null,
        viewportBounds,
      },
    );

    expect(created?.sectionId).toBeTruthy();
    await refreshProjectStateFromBackend(page, projectContext.projectConfigId);

    const reactCard = page.getByTestId("fixture-react-card").first();
    await expect(reactCard).toBeVisible();
    await expect(
      reactCard.getByText("React Fixture Card", { exact: true }),
    ).toBeVisible();
    await expect(reactCard.getByTestId("fixture-react-mode")).toContainText(
      "mode:ide",
    );

    const localClicks = reactCard.getByTestId("fixture-react-local-clicks");
    const savedPulses = reactCard.getByTestId("fixture-react-saved-pulses");
    const pinnedState = reactCard.getByTestId("fixture-react-pinned-state");

    await expect(localClicks).toHaveText("0");
    await expect(savedPulses).toHaveText("0");
    await expect(pinnedState).toHaveText("Unpinned");

    await reactCard.getByTestId("fixture-react-local-click").click();
    await expect(localClicks).toHaveText("1");

    await reactCard.getByTestId("fixture-react-save-pulse").click();
    await expect(savedPulses).toHaveText("1");

    await reactCard.getByTestId("fixture-react-toggle-pin").click();
    await expect(pinnedState).toHaveText("Pinned");
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend-react",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugin runtime failures replace stale section renderer output with runtime error card", async ({
  page,
}) => {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/frontend-react",
  );

  await setOverviewTab(page, "Plugins");
  const projectContext = await openIsolatedProject(page);

  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: fixturePluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

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
          pluginId: "setta-fixture-frontend-react",
          kind: "fixture-react-card",
          data: {
            title: "React Fixture",
            details: "React section fixture active.",
            tags: ["react", "plugin"],
            pinned: false,
            pulses: 0,
          },
        },
        position: {
          x: viewportBounds.x + viewportBounds.w * 0.35,
          y: viewportBounds.y + viewportBounds.h * 0.2,
        },
        topLevelSections: null,
        viewportBounds,
      },
    );

    expect(created?.sectionId).toBeTruthy();
    await refreshProjectStateFromBackend(page, projectContext.projectConfigId);
    await expect(page.getByTestId("fixture-react-card").first()).toBeVisible();

    allowExpectedApiError(page, {
      path: "/api/plugins/runtime",
      statuses: [500],
      count: 20,
      ttlMs: 60000,
    });
    await page.route("**/api/plugins/runtime", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "forced runtime error" }),
      });
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(page.getByText("Plugin Runtime Error", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Failed to fetch plugins runtime: status 500.").first(),
    ).toBeVisible();
    await expect(page.getByTestId("fixture-react-card")).toHaveCount(0);
    await page.unroute("**/api/plugins/runtime");
  } finally {
    await page.unroute("**/api/plugins/runtime").catch(() => null);
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-frontend-react",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
