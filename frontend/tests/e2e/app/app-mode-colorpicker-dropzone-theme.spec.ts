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

test("app mode param widgets use theme tokens (dropzone + color picker)", async ({
  page,
}) => {
  const configId = "config-1";
  const sectionId = "section-1";
  const sectionVariantId = "section-variant-1";
  const sectionImplId = "section-impl-1";

  const colorParamId = "param-color";
  const colorParamVariantId = "param-variant-color";
  const colorParamImplId = "param-impl-color";

  const dropzoneParamId = "param-dropzone";
  const dropzoneParamVariantId = "param-variant-dropzone";
  const dropzoneParamImplId = "param-impl-dropzone";

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
    name: "param_section",
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
      codeObjVariantMap: {
        [colorParamId]: colorParamVariantId,
        [dropzoneParamId]: dropzoneParamVariantId,
      },
      hideParams: false,
    },
  );

  const colorCore = createCore({
    id: colorParamId,
    name: "color",
    variants: [colorParamVariantId],
    defaultVariant: colorParamVariantId,
  });

  const colorVariant = createVariant({
    id: colorParamVariantId,
    name: "Variant",
    impl: colorParamImplId,
    nonPresetImpls: [],
  });

  const colorImpl = {
    type: "ColorPickerParam",
    id: colorParamImplId,
    name: "color",
    value: "#ff0000",
    defaultVal: "#ff0000",
    colorChoices: [
      { color: "#ff0000", description: "Red" },
      { color: "#00ff00", description: "Green" },
    ],
  };

  const dropzoneCore = createCore({
    id: dropzoneParamId,
    name: "attachments",
    variants: [dropzoneParamVariantId],
    defaultVariant: dropzoneParamVariantId,
  });

  const dropzoneVariant = createVariant({
    id: dropzoneParamVariantId,
    name: "Variant",
    impl: dropzoneParamImplId,
    nonPresetImpls: [],
  });

  const dropzoneImpl = {
    type: "DropzoneParam",
    id: dropzoneParamImplId,
    name: "attachments",
    value: "",
    defaultVal: "",
    mode: "STATELESS",
    maxAttachments: null,
    placeholder: "Drop a file here",
  };

  const appSpec = {
    root: {
      key: "root",
      type: "ConfigScope",
      props: { configId },
      children: [
        {
          key: "color",
          type: "ParamInput",
          props: { sectionId, paramId: colorParamId, label: "Color" },
        },
        {
          key: "dropzone",
          type: "ParamInput",
          props: {
            sectionId,
            paramId: dropzoneParamId,
            label: "Dropzone",
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
      mode: "dark",
      vars: {
        "--app-surface": "#0b1621",
        "--app-surface-alt": "#112233",
        "--app-border": "#445566",
        "--app-text": "#ddeeff",
        "--app-muted": "#778899",
        "--app-accent": "#ff3366",
        "--app-dropdown-bg": "#0a141e",
        "--app-dropdown-border": "#646e78",
        "--app-dropdown-text": "#c8d2dc",
        "--app-input-bg-hover": "#28323c",
      },
    },
    assets: [],
  };

  const deploymentName = "app-test";
  const deploymentVersion = "v1";

  const appSessionResponse = {
    deploymentName,
    deploymentVersion,
    shareSessionId: "session-1",
    defaultProjectConfigId: configId,
    projectMetadata: [{ id: configId, name: projectConfig.name }],
    appPolicy: sharePolicy,
    manifest: null,
  };

  const appDeploymentStateResponse = {
    projectState: {
      projectConfig,
      sections: { [sectionId]: sectionCore },
      sectionImpls: { [sectionImplId]: sectionImpl },
      sectionVariants: { [sectionVariantId]: sectionVariant },
      codeObjs: { [colorParamId]: colorCore, [dropzoneParamId]: dropzoneCore },
      codeObjImpls: { [colorParamImplId]: colorImpl, [dropzoneParamImplId]: dropzoneImpl },
      codeObjVariants: {
        [colorParamVariantId]: colorVariant,
        [dropzoneParamVariantId]: dropzoneVariant,
      },
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
  await expect(page.getByText("Color", { exact: true })).toBeVisible();
  await expect(page.getByText("Dropzone", { exact: true })).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(true);

  const dropzoneWrapper = page
    .getByText("Drop a file here")
    .locator("xpath=ancestor::*[contains(@class,'section-value')][1]");

  await expect
    .poll(() =>
      dropzoneWrapper.evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe("rgb(11, 22, 33)");
  await expect
    .poll(() =>
      dropzoneWrapper.evaluate((el) => getComputedStyle(el).borderTopColor),
    )
    .toBe("rgb(68, 85, 102)");

  const colorToggle = page
    .locator("button")
    .filter({ has: page.locator("i.gg-chevron-down") })
    .first();
  await colorToggle.click();

  const menu = page.getByRole("menu").first();
  await expect(menu).toBeVisible();

  await expect
    .poll(() => menu.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe("rgb(10, 20, 30)");
  await expect
    .poll(() => menu.evaluate((el) => getComputedStyle(el).borderTopColor))
    .toBe("rgb(100, 110, 120)");

  const redItem = menu.getByText("Red", { exact: true }).first();
  await expect
    .poll(() => redItem.evaluate((el) => getComputedStyle(el).color))
    .toBe("rgb(200, 210, 220)");
});
