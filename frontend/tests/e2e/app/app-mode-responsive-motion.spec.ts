import { expect, test } from "@playwright/test";
import {
  createProjectConfig,
  createSingletonSections,
} from "utils/generatedTypes";

import { ensureAppReady } from "../helpers";

test("app mode supports responsive layout props and motion primitives", async ({
  page,
}) => {
  await page.setViewportSize({ width: 500, height: 720 });

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
      props: { gap: { base: 6, lg: 24 } },
      children: [
        {
          key: "motion",
          type: "Motion",
          props: { preset: "fadeIn", durationMs: 120 },
          children: [
            {
              key: "card",
              type: "Card",
              props: { title: "Motion Card" },
              children: [
                { key: "t1", type: "Text", props: { text: "Hello" } },
              ],
            },
          ],
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

  const appSessionResponse = {
    deploymentName: "app-test",
    deploymentVersion: "v1",
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

  const motionCard = page.getByText("Motion Card");
  await expect(motionCard).toBeVisible();

  const rootGapSmall = await page.evaluate(() => {
    const motion = document.querySelector(".setta-app-motion");
    if (!motion) {
      return null;
    }
    let current: Element | null = motion;
    while (current) {
      const style = getComputedStyle(current);
      if (style.display.includes("flex") && style.gap && style.gap !== "0px") {
        return style.gap;
      }
      current = current.parentElement;
    }
    return null;
  });
  expect(rootGapSmall).toBe("6px");

  const motionAnimationName = await page.evaluate(() => {
    const motion = document.querySelector(".setta-app-motion");
    if (!motion) {
      return null;
    }
    return getComputedStyle(motion).animationName;
  });
  expect(motionAnimationName).not.toBeNull();
  expect(motionAnimationName).not.toBe("none");

  await page.setViewportSize({ width: 1300, height: 720 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const motion = document.querySelector(".setta-app-motion");
        if (!motion) {
          return null;
        }
        let current: Element | null = motion;
        while (current) {
          const style = getComputedStyle(current);
          if (
            style.display.includes("flex") &&
            style.gap &&
            style.gap !== "0px"
          ) {
            return style.gap;
          }
          current = current.parentElement;
        }
        return null;
      }),
    )
    .toBe("24px");
});
