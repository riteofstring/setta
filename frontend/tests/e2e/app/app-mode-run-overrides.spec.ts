import { expect, test } from "@playwright/test";
import { createProjectConfig, createSingletonSections } from "utils/generatedTypes";

import { ensureAppReady } from "../helpers";

test("app mode run action sends overrides in a single runCode request", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 720 });

  const projectConfig = createProjectConfig({
    id: "config-1",
    name: "Config A",
  });
  const sectionId = "section-1";
  const sharePolicy = {
    allowParamChanges: true,
    allowVariantChanges: true,
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
            label: "Run With Overrides",
            action: "runCustom",
            configId: projectConfig.id,
            sectionId,
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
    actions: {
      runCustom: {
        type: "run",
        configId: projectConfig.id,
        sectionId,
        paramOverrides: {
          [`${sectionId}:param-1`]: "override",
        },
        sectionVariantOverrides: {
          [sectionId]: "variant-2",
        },
      },
    },
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

  let unexpectedOverrideCalls = 0;
  await page.route("**/setSectionVariant", (route) => {
    unexpectedOverrideCalls += 1;
    route.fulfill({ status: 500, contentType: "application/json", body: "null" });
  });
  await page.route("**/setParamEnteredValue", (route) => {
    unexpectedOverrideCalls += 1;
    route.fulfill({ status: 500, contentType: "application/json", body: "null" });
  });
  await page.route("**/runCode", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "null" }),
  );

  const button = page.getByRole("button", { name: "Run With Overrides" });
  await expect(button).toBeVisible();

  const [runRequest] = await Promise.all([
    page.waitForRequest("**/runCode"),
    button.click(),
  ]);

  expect(unexpectedOverrideCalls).toBe(0);

  const payload = runRequest.postDataJSON() as Record<string, unknown>;
  expect(payload.projectConfigId).toBe(projectConfig.id);
  expect(payload.sectionId).toBe(sectionId);
  expect(payload.sectionVariantOverrides).toEqual({ [sectionId]: "variant-2" });
  expect(payload.paramOverrides).toEqual({ [`${sectionId}:param-1`]: "override" });
});

