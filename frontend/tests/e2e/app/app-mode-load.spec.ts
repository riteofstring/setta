import { expect, test } from "@playwright/test";
import {
  createProjectConfig,
  createSingletonSections,
} from "utils/generatedTypes";

import { ensureAppReady } from "../helpers";

test("app deployment loads with run gating", async ({ page }) => {
  let sessionCalls = 0;
  let stateCalls = 0;
  const sharePolicy = {
    allowParamChanges: true,
    allowVariantChanges: false,
    allowLayoutChanges: false,
    allowRun: false,
    allowLLM: false,
    allowExternalLinks: false,
    allowFileDownloads: false,
    allowMultipleRuns: false,
    runSnapshotMode: "ephemeral",
  };
  const projectConfig = createProjectConfig({
    id: "config-1",
    name: "Config A",
  });
  const appSpec = {
    root: {
      key: "root",
      type: "Stack",
      children: [
        {
          key: "run-action",
          type: "ActionButton",
          props: { label: "Run App", action: "run", configId: "config-1" },
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
      run: { type: "run" },
    },
    theme: null,
    assets: [],
  };
  const deploymentName = "app-test";
  const deploymentVersion = "v1";
  const appSessionResponse = {
    deploymentName,
    deploymentVersion,
    shareSessionId: "session-1",
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
    }).finally(() => {
      sessionCalls += 1;
    }),
  );
  await page.route("**/app/deployments/*/*/state", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(appDeploymentStateResponse),
    }).finally(() => {
      stateCalls += 1;
    }),
  );
  await page.evaluate(async () => {
    const { useServerMode } = await import("/src/state/definitions.ts");
    useServerMode.setState({ mode: "app", modeResolved: true });
  });

  await expect(page.getByText("App Mode")).toBeVisible();
  await expect.poll(() => sessionCalls).toBeGreaterThan(0);
  await expect.poll(() => stateCalls).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useAppConfigs } = await import("/src/state/definitions.ts");
        return Object.keys(useAppConfigs.getState().configs).length;
      }),
    )
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useShareSession } = await import("/src/state/definitions.ts");
        return useShareSession.getState().sharePolicy?.allowMultipleRuns ?? null;
      }),
    )
    .toBe(false);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useAllProjectMetadata } = await import(
          "/src/state/definitions.ts"
        );
        return useAllProjectMetadata.getState().defaultProjectConfigId;
      }),
    )
    .toBe("config-1");
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useShareSession } = await import("/src/state/definitions.ts");
        return useShareSession.getState().shareSessionId;
      }),
    )
    .toBe("session-1");
  const runButton = page.getByRole("button", { name: "Run App" });
  await expect(runButton).toBeDisabled();
  await expect(runButton).toHaveAttribute(
    "title",
    "Runs are disabled by policy.",
  );
});
