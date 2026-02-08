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
              children: [{ key: "t1", type: "Text", props: { text: "Hello" } }],
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

test("app mode can theme motion defaults", async ({ page }) => {
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
      type: "Motion",
      props: { preset: "fadeIn" },
      children: [{ key: "t1", type: "Text", props: { text: "Theme Motion" } }],
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
      motion: {
        durationMs: 640,
        easing: "linear",
      },
    },
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

  await expect(page.getByText("Theme Motion")).toBeVisible();

  const motionComputed = await page.evaluate(() => {
    const motion = document.querySelector(".setta-app-motion");
    if (!motion) {
      return null;
    }
    const style = getComputedStyle(motion);
    return {
      duration: style.animationDuration,
      timing: style.animationTimingFunction,
      name: style.animationName,
    };
  });

  expect(motionComputed).not.toBeNull();
  if (!motionComputed) {
    return;
  }

  const durationRaw = motionComputed.duration.split(",")[0]?.trim() ?? "";
  const parseMs = (value: string): number => {
    const trimmed = value.trim();
    if (trimmed.endsWith("ms")) {
      return Number.parseFloat(trimmed.slice(0, -2));
    }
    if (trimmed.endsWith("s")) {
      return Number.parseFloat(trimmed.slice(0, -1)) * 1000;
    }
    return Number.NaN;
  };
  const durationMs = parseMs(durationRaw);
  expect(durationMs).toBeGreaterThan(600);
  expect(durationMs).toBeLessThan(680);
  expect(motionComputed.timing).toBe("linear");
  expect(motionComputed.name).not.toBe("none");
});

test("app mode can theme typography tokens", async ({ page }) => {
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
          key: "h",
          type: "Heading",
          props: { text: "Theme Typography", level: 2 },
        },
        {
          key: "t",
          type: "Text",
          props: { text: "Body copy" },
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
      typography: {
        bodySize: 18,
        headingSizes: { h2: 40 },
      },
    },
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

  const heading = page.getByRole("heading", {
    name: "Theme Typography",
    level: 2,
  });
  await expect(heading).toBeVisible();

  const headingFontSize = await heading.evaluate(
    (node) => getComputedStyle(node).fontSize,
  );
  expect(headingFontSize).toBe("40px");

  const body = page.getByText("Body copy");
  await expect(body).toBeVisible();
  const bodyFontSize = await body.evaluate(
    (node) => getComputedStyle(node).fontSize,
  );
  expect(bodyFontSize).toBe("18px");
});

test("app mode can theme shadow tokens", async ({ page }) => {
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
      type: "Card",
      props: { title: "Shadow Card" },
      children: [{ key: "t", type: "Text", props: { text: "Body copy" } }],
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
      shadows: {
        sm: "0 0 0 10px rgba(255, 0, 255, 0.9)",
      },
    },
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

  const title = page.getByText("Shadow Card");
  await expect(title).toBeVisible();
  const boxShadow = await title.evaluate((node) => {
    const container = node.closest("section");
    if (!container) {
      return null;
    }
    return getComputedStyle(container).boxShadow;
  });

  expect(boxShadow).not.toBeNull();
  if (!boxShadow) {
    return;
  }

  expect(boxShadow).toContain("10px");
  expect(boxShadow).toMatch(/255\D+0\D+255/);
});
