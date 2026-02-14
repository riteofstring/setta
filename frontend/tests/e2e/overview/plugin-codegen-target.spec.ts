import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  setOverviewTab,
} from "../helpers";

test("plugin codegen targets are visible in run instructions and can be enabled", async ({
  page,
}) => {
  const targetId = "setta-fixture-backend-codegen:typescript";
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
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(page.getByText("TypeScript (typescript)")).toBeVisible();
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
    await cleanupIsolatedProject(page, projectContext);
  }
});
