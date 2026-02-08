import { expect, test } from "@playwright/test";
import {
  createCore,
  createProjectConfig,
  createSingletonSections,
  createTextBlockSectionImpl,
  createUserDefaultTextBlockSectionImpl,
  createVariant,
} from "utils/generatedTypes";

import { ensureAppReady } from "../helpers";

test("app mode TextOutput renders the effective (modifier) TextBlock text", async ({
  page,
}) => {
  const configId = "config-1";
  const sectionId = "section-1";
  const sectionVariantId = "section-variant-1";
  const sectionImplId = "section-impl-1";

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
    name: "app_output",
    variants: [sectionVariantId],
    defaultVariant: sectionVariantId,
    sharedModifier: {
      text: "From core modifier",
    },
  });

  const sectionVariant = createVariant({
    id: sectionVariantId,
    name: "Variant",
    impl: sectionImplId,
    nonPresetImpls: [],
  });

  const sectionImpl = createTextBlockSectionImpl(
    createUserDefaultTextBlockSectionImpl(),
    { id: sectionImplId, text: "From impl" },
  );

  const appSpec = {
    root: {
      key: "root",
      type: "Stack",
      children: [
        {
          key: "text-output",
          type: "TextOutput",
          props: {
            label: "Result",
            configId,
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
    actions: {},
    theme: null,
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
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
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
  await expect(page.getByText("From core modifier")).toBeVisible();
  await expect(page.getByText("From impl")).not.toBeVisible();
});
