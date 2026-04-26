import { expect, test } from "@playwright/test";
import {
  createCallableSectionImpl,
  createCore,
  createProjectConfig,
  createSingletonSections,
  createUserDefaultCallableSectionImpl,
  createVariant,
} from "utils/generatedTypes";

import { ensureAppReady } from "../helpers";

test("app mode dropdown portal inherits dark mode + theme vars", async ({
  page,
}) => {
  const configId = "config-1";
  const sectionId = "section-1";
  const sectionVariantId = "section-variant-1";
  const sectionImplId = "section-impl-1";

  const paramId = "param-1";
  const paramVariantId = "param-variant-1";
  const paramImplId = "param-impl-1";

  const sharePolicy = {
    allowParamChanges: true,
    allowVariantChanges: false,
    allowLayoutChanges: false,
    allowRun: false,
    allowLLM: false,
    allowExternalLinks: false,
    allowFileDownloads: false,
    allowMultipleRuns: true,
    runSnapshotMode: "ephemeral",
  };

  const projectConfig = createProjectConfig({
    id: configId,
    name: "Config A",
    sectionVariantMap: { [sectionId]: sectionVariantId },
  });

  const sectionCore = createCore({
    id: sectionId,
    name: "dropdown_section",
    variants: [sectionVariantId],
    defaultVariant: sectionVariantId,
  });

  const sectionVariant = createVariant({
    id: sectionVariantId,
    name: "Variant",
    impl: sectionImplId,
    nonPresetImpls: [],
  });

  const sectionImpl = createCallableSectionImpl(
    createUserDefaultCallableSectionImpl(),
    {
      id: sectionImplId,
      codeObjVariantMap: { [paramId]: paramVariantId },
      hideParams: false,
    },
  );

  const paramCore = createCore({
    id: paramId,
    name: "choice",
    variants: [paramVariantId],
    defaultVariant: paramVariantId,
  });

  const paramVariant = createVariant({
    id: paramVariantId,
    name: "Variant",
    impl: paramImplId,
    nonPresetImpls: [],
  });

  const paramImpl = {
    type: "DropdownParam",
    id: paramImplId,
    name: "choice",
    value: "A",
    defaultVal: "A",
    choices: ["A", "B"],
  };

  const appSpec = {
    root: {
      key: "root",
      type: "ConfigScope",
      props: { configId },
      children: [
        {
          key: "param",
          type: "ParamInput",
          props: {
            sectionId,
            paramId,
            label: "Choice",
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
    theme: { mode: "dark", className: "app-test-theme" },
    assets: [],
  };

  const deploymentName = "app-test";
  const deploymentVersion = "v1";

  const appSessionResponse = {
    deploymentName,
    deploymentVersion,
    shareSessionId: "session-1",
    sessionRunCount: 0,
    defaultProjectConfigId: configId,
    projectMetadata: [
      {
        id: configId,
        name: projectConfig.name,
      },
    ],
    appPolicy: sharePolicy,
    manifest: null,
  };

  const appDeploymentStateResponse = {
    projectState: {
      projectConfig,
      sections: { [sectionId]: sectionCore },
      sectionImpls: { [sectionImplId]: sectionImpl },
      sectionVariants: { [sectionVariantId]: sectionVariant },
      codeObjs: { [paramId]: paramCore },
      codeObjImpls: { [paramImplId]: paramImpl },
      codeObjVariants: { [paramVariantId]: paramVariant },
      singletonSections: createSingletonSections(),
      parentSectionMap: { [sectionId]: null },
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

  await page.route("**/app/deployments/*/*/state", (route) =>
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

  await expect(page.getByText("App Mode")).toBeVisible();
  await expect(page.getByText("Choice", { exact: true })).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(true);

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          getComputedStyle(document.documentElement)
            .getPropertyValue("--app-surface")
            .trim().length,
      ),
    )
    .toBeGreaterThan(0);

  const toggle = page
    .locator(".section-value")
    .filter({ has: page.locator("input") })
    .first()
    .locator("button")
    .first();
  await expect(toggle).toBeVisible();
  await toggle.click();

  const list = page
    .locator("div.nowheel.nodrag")
    .filter({ hasText: "Choices" })
    .first();
  await expect(list).toBeVisible();

  const bg = await list.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(bg).not.toBe("rgb(255, 255, 255)");
});
