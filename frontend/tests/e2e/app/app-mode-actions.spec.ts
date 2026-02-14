import { expect, test } from "@playwright/test";
import {
  createProjectConfig,
  createSingletonSections,
} from "utils/generatedTypes";

import { allowExpectedApiError, ensureAppReady } from "../helpers";

test("app mode ActionButton triggers json-render actions", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });

  const projectConfig = createProjectConfig({
    id: "config-1",
    name: "Config A",
  });
  const sharePolicy = {
    allowParamChanges: true,
    allowVariantChanges: false,
    allowLayoutChanges: false,
    allowRun: true,
    allowLLM: false,
    allowExternalLinks: false,
    allowFileDownloads: false,
    allowMultipleRuns: true,
    runSnapshotMode: "ephemeral",
  };
  const appSpec = {
    root: {
      key: "root",
      type: "Stack",
      props: { gap: 10 },
      children: [
        {
          key: "run",
          type: "ActionButton",
          props: {
            label: "Run It",
            action: "run",
            configId: projectConfig.id,
            sectionId: "section-1",
          },
        },
      ],
    },
    elements: {},
  };
  const appDefinition = {
    appSpecVersion: "v1",
    catalogId: "setta.app.default",
    appSpecPath: null,
    routes: [],
    dataBindings: {},
    actions: {},
    theme: {
      mode: "light",
      typography: { scale: { xs: "20px" } },
      components: { button: { bg: "#ff00ff" } },
    },
    assets: [],
  };

  const appSessionResponse = {
    deploymentName: "app-test",
    deploymentVersion: "v1",
    shareSessionId: "session-1",
    sessionRunCount: 0,
    defaultProjectConfigId: projectConfig.id,
    projectMetadata: [
      {
        id: projectConfig.id,
        name: projectConfig.name,
      },
    ],
    appPolicy: sharePolicy,
    manifest: null,
  };
  const appDeploymentStateResponse = {
    projectState: {
      projectConfig,
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      requiredDecodedImages: [],
      genCodeBinding: null,
    },
    appDefinition,
    appSpec,
    appPolicy: sharePolicy,
  };

  await ensureAppReady(page);
  await page.waitForLoadState("domcontentloaded");

  await page.route("**/loadSettings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    }),
  );
  await page.route("**/app/deployments/current/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(appSessionResponse),
    }),
  );
  await page.route("**/app/deployments/*/*/state*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(appDeploymentStateResponse),
    }),
  );
  await page.evaluate(async () => {
    const { useServerMode } = await import("/src/state/definitions.ts");
    useServerMode.setState({ mode: "app", modeResolved: true });
  });

  const mainBackground = await page.locator("main").evaluate((node) => ({
    backgroundColor: getComputedStyle(node).backgroundColor,
    backgroundImage: getComputedStyle(node).backgroundImage,
  }));
  expect(mainBackground.backgroundImage).not.toBe("none");

  await page.route("**/runCode", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    }),
  );

  const button = page.getByRole("button", { name: "Run It" });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();

  await expect(page.locator("header").getByText("App Mode")).toHaveCSS(
    "font-size",
    "20px",
  );
  await expect(button).toHaveCSS("background-color", "rgb(255, 0, 255)");

  const [runRequest] = await Promise.all([
    page.waitForRequest("**/runCode"),
    button.click(),
  ]);

  const payload = runRequest.postDataJSON() as Record<string, unknown>;
  expect(payload.projectConfigId).toBe(projectConfig.id);
  expect(payload.sectionId).toBe("section-1");
});

test("app mode Run button recovers after a run failure", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });

  const projectConfig = createProjectConfig({
    id: "config-1",
    name: "Config A",
  });
  const sharePolicy = {
    allowParamChanges: true,
    allowVariantChanges: false,
    allowLayoutChanges: false,
    allowRun: true,
    allowLLM: false,
    allowExternalLinks: false,
    allowFileDownloads: false,
    allowMultipleRuns: true,
    runSnapshotMode: "ephemeral",
  };
  const appSpec = {
    root: {
      key: "root",
      type: "Stack",
      props: { gap: 10 },
      children: [
        {
          key: "run",
          type: "ActionButton",
          props: {
            label: "Run It",
            action: "run",
            configId: projectConfig.id,
            sectionId: "section-1",
          },
        },
      ],
    },
    elements: {},
  };
  const appDefinition = {
    appSpecVersion: "v1",
    catalogId: "setta.app.default",
    appSpecPath: null,
    routes: [],
    dataBindings: {},
    actions: {},
    theme: { mode: "light" },
    assets: [],
  };

  const appSessionResponse = {
    deploymentName: "app-test",
    deploymentVersion: "v1",
    shareSessionId: "session-1",
    sessionRunCount: 0,
    defaultProjectConfigId: projectConfig.id,
    projectMetadata: [
      {
        id: projectConfig.id,
        name: projectConfig.name,
      },
    ],
    appPolicy: sharePolicy,
    manifest: null,
  };
  const appDeploymentStateResponse = {
    projectState: {
      projectConfig,
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      requiredDecodedImages: [],
      genCodeBinding: null,
    },
    appDefinition,
    appSpec,
    appPolicy: sharePolicy,
  };

  await ensureAppReady(page);
  await page.waitForLoadState("domcontentloaded");

  await page.route("**/loadSettings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    }),
  );
  await page.route("**/app/deployments/current/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(appSessionResponse),
    }),
  );
  await page.route("**/app/deployments/*/*/state*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(appDeploymentStateResponse),
    }),
  );
  await page.evaluate(async () => {
    const { useServerMode } = await import("/src/state/definitions.ts");
    useServerMode.setState({ mode: "app", modeResolved: true });
  });

  let runCalls = 0;
  await page.route("**/runCode", (route) => {
    runCalls += 1;
    route.fulfill({
      status: runCalls === 1 ? 500 : 200,
      contentType: "application/json",
      body: "null",
    });
  });
  allowExpectedApiError(page, {
    path: "/api/runCode",
    statuses: [500],
    count: 1,
  });

  const button = page.getByRole("button", { name: "Run It" });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();

  const [firstRequest] = await Promise.all([
    page.waitForRequest("**/runCode"),
    button.click(),
  ]);
  expect(firstRequest.postDataJSON()).toMatchObject({
    projectConfigId: projectConfig.id,
    sectionId: "section-1",
  });

  await expect(button).toBeEnabled();
  await expect(button).toHaveText("Run It");

  const [secondRequest] = await Promise.all([
    page.waitForRequest("**/runCode"),
    button.click(),
  ]);
  expect(secondRequest.postDataJSON()).toMatchObject({
    projectConfigId: projectConfig.id,
    sectionId: "section-1",
  });
});
