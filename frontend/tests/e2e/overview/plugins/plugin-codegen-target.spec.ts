import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "path";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../../helpers";

async function expandCodegenTargets(page: Page): Promise<void> {
  const toggle = page.getByRole("button", { name: "Codegen Targets" });
  await expect(toggle).toBeVisible();
  const expanded = await toggle.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

test("plugin codegen targets are visible in run instructions and can be enabled", async ({
  page,
}) => {
  const targetId = "setta-fixture-backend-codegen:typescript";
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/backend-codegen",
  );
  const codegenRequests: Array<Record<string, unknown>> = [];

  await page.route("**/api/setProjectConfigCodegenTargets", async (route) => {
    const requestPayload = route.request().postDataJSON() as Record<
      string,
      unknown
    >;
    codegenRequests.push(requestPayload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await setOverviewTab(page, "RunInstructions");
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
    await expandCodegenTargets(page);

    const pluginTargetIdLabel = page.getByText(targetId).first();
    await expect(pluginTargetIdLabel).toBeVisible();
    const pluginTargetRow = pluginTargetIdLabel.locator(
      "xpath=ancestor::div[contains(@class,'rounded')][1]",
    );
    await pluginTargetRow.getByRole("switch").click();

    await expect
      .poll(() => codegenRequests.length, { timeout: 5000 })
      .toBeGreaterThan(0);
    const latestRequest = codegenRequests[codegenRequests.length - 1];
    const codegenTargets = latestRequest.codegenTargets as Array<{
      language: string;
      options?: Record<string, unknown>;
    }>;
    expect(
      codegenTargets.some((target) => target.language === targetId),
    ).toBeTruthy();
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-backend-codegen",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("plugin codegen target selection persists across reload using real backend endpoint", async ({
  page,
}) => {
  const targetId = "setta-fixture-backend-codegen:typescript";
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/backend-codegen",
  );

  await setOverviewTab(page, "RunInstructions");
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
    await expandCodegenTargets(page);

    const targetIdLabel = page.getByText(targetId).first();
    await expect(targetIdLabel).toBeVisible();
    const targetRow = targetIdLabel.locator(
      "xpath=ancestor::div[contains(@class,'rounded')][1]",
    );
    const targetSwitch = targetRow.getByRole("switch").first();
    await expect(targetSwitch).toBeVisible();

    const initiallyChecked =
      (await targetSwitch.getAttribute("aria-checked")) === "true";
    const toggledValue = !initiallyChecked;
    await targetSwitch.click();
    await expect(targetSwitch).toHaveAttribute(
      "aria-checked",
      toggledValue ? "true" : "false",
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    await expandCodegenTargets(page);

    const reloadedTargetSwitch = page
      .getByText(targetId)
      .first()
      .locator("xpath=ancestor::div[contains(@class,'rounded')][1]")
      .getByRole("switch")
      .first();
    await expect(reloadedTargetSwitch).toHaveAttribute(
      "aria-checked",
      toggledValue ? "true" : "false",
    );
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-backend-codegen",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("run instructions shows and removes orphaned plugin codegen targets after plugin removal", async ({
  page,
}) => {
  const targetId = "setta-fixture-backend-codegen:typescript";
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/backend-codegen",
  );

  await setOverviewTab(page, "RunInstructions");
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
    await expandCodegenTargets(page);

    const targetIdLabel = page.getByText(targetId).first();
    await expect(targetIdLabel).toBeVisible();
    const targetRow = targetIdLabel.locator(
      "xpath=ancestor::div[contains(@class,'rounded')][1]",
    );
    const targetSwitch = targetRow.getByRole("switch").first();
    const isChecked = (await targetSwitch.getAttribute("aria-checked")) === "true";
    if (!isChecked) {
      await targetSwitch.click();
      await expect(targetSwitch).toHaveAttribute("aria-checked", "true");
    }

    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-backend-codegen",
      scope: "workspace",
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.route("**/api/plugins/runtime", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      if (Array.isArray(payload?.status?.plugins)) {
        payload.status.plugins = payload.status.plugins.map(
          (plugin: Record<string, unknown>) => ({
            ...plugin,
            registeredCodegenTargets: [],
          }),
        );
      }
      await route.fulfill({ response, json: payload });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    await expandCodegenTargets(page);

    await expect(page.getByText("Orphaned configured targets")).toBeVisible();
    const orphanedTargetRow = page.getByTestId(
      `orphaned-codegen-target-${targetId}`,
    );
    await expect(orphanedTargetRow).toBeVisible();
    await page
      .getByTestId(`remove-orphaned-codegen-target-${targetId}`)
      .click();
    await expect(orphanedTargetRow).toHaveCount(0);
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: "setta-fixture-backend-codegen",
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
