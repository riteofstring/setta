import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getViewportBoundsForPlacement,
  openIsolatedProject,
} from "../helpers";

test("dict kwargs render after clicking the add arg button", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const projectConfigId = projectContext.projectConfigId;
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }
  const sectionResponse = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType: "Dict",
    viewportBounds,
  });
  const sectionId = sectionResponse?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating dict section.");
  }

  try {
    const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
    await expect(sectionNode).toBeVisible();
    await sectionNode.getByRole("button", { name: "Add arg" }).click();

    const paramContainer = sectionNode.locator(
      `[id^="ParamContainer-${sectionId}-"]`,
    );
    const firstParam = paramContainer.first();
    await expect(firstParam).toBeVisible({ timeout: 20000 });
    await expect(firstParam).toContainText("Add Key");
    const box = await firstParam.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(10);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("dict kwargs can be added and deleted back to empty without crashing", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const projectConfigId = projectContext.projectConfigId;
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }
  const sectionResponse = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType: "Dict",
    viewportBounds,
  });
  const sectionId = sectionResponse?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating dict section.");
  }

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const onPageError = (error: Error) => {
    const message = error.stack || error.message || String(error);
    if (message) {
      pageErrors.push(message);
    }
  };
  const onConsole = (msg: import("@playwright/test").ConsoleMessage) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  try {
    const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
    await expect(sectionNode).toBeVisible();
    const addArgButton = sectionNode.getByRole("button", { name: "Add arg" });
    const removeArgButton = sectionNode.getByRole("button", {
      name: "Remove arg",
    });
    const paramContainer = sectionNode.locator(
      `[id^="ParamContainer-${sectionId}-"]`,
    );

    for (let index = 0; index < 6; index += 1) {
      await addArgButton.click();
    }
    await expect(paramContainer).toHaveCount(6);

    for (let index = 0; index < 6; index += 1) {
      await removeArgButton.click();
    }
    await expect(paramContainer).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await expect(page.getByText("Unhandled Thrown Error!")).toHaveCount(0);
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    await cleanupIsolatedProject(page, projectContext);
  }
});
