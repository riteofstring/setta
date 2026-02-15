import { expect, test } from "@playwright/test";

import {
  ensureAppReady,
  getViewportBoundsForPlacement,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: Array<{ id: string; name: string }>;
};

test("app tabs scope outputs per config", async ({ page }) => {
  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  const initialMetadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!initialMetadata?.defaultProjectConfigId) {
    throw new Error("Missing default project config id.");
  }
  const defaultConfig = initialMetadata.projectMetadata.find(
    (config) => config.id === initialMetadata.defaultProjectConfigId,
  );
  if (!defaultConfig) {
    throw new Error("Unable to resolve default project config.");
  }

  const newConfigName = await postBackend<string>(page, "/createProjectConfig", {
    previewImgColor: "bg-blue-500/60",
  });
  if (!newConfigName) {
    throw new Error("Missing new project config name.");
  }

  const updatedMetadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!updatedMetadata) {
    throw new Error("Missing updated project metadata response.");
  }
  const newConfig = updatedMetadata.projectMetadata.find(
    (config) => config.name === newConfigName,
  );
  if (!newConfig) {
    throw new Error("Unable to resolve new project config.");
  }

  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Missing viewport bounds for section placement.");
  }

  const sectionA = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId: defaultConfig.id,
      implType: "TextBlock",
      viewportBounds,
    },
  );
  if (!sectionA?.sectionId) {
    throw new Error("Missing section id for config A.");
  }

  const sectionB = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId: newConfig.id,
      implType: "TextBlock",
      viewportBounds,
    },
  );
  if (!sectionB?.sectionId) {
    throw new Error("Missing section id for config B.");
  }

  await postBackend(page, "/setTextBlockText", {
    projectConfigId: defaultConfig.id,
    sectionId: sectionA.sectionId,
    text: "Alpha output",
  });
  await postBackend(page, "/setTextBlockText", {
    projectConfigId: newConfig.id,
    sectionId: sectionB.sectionId,
    text: "Beta output",
  });

  const appSpec = {
    root: {
      key: "app-root",
      type: "Tabs",
      children: [
        {
          key: "tab-a",
          type: "Tab",
          props: { title: defaultConfig.name },
          children: [
            {
              key: "scope-a",
              type: "ConfigScope",
              props: { configId: defaultConfig.id },
              children: [
                {
                  key: "output-a",
                  type: "TextOutput",
                  props: { sectionId: sectionA.sectionId, label: "Output A" },
                },
              ],
            },
          ],
        },
        {
          key: "tab-b",
          type: "Tab",
          props: { title: newConfig.name },
          children: [
            {
              key: "scope-b",
              type: "ConfigScope",
              props: { configId: newConfig.id },
              children: [
                {
                  key: "output-b",
                  type: "TextOutput",
                  props: { sectionId: sectionB.sectionId, label: "Output B" },
                },
              ],
            },
          ],
        },
      ],
    },
    elements: {},
  };

  await postBackend(page, "/setAppDefinition", {
    appSpec,
  });
  await page.evaluate(async () => {
    const { route_get_app_definition } = await import(
      "/src/utils/generatedEndpoints.ts"
    );
    const { res200 } = await import("/src/utils/endpointUtils.ts");
    const { useAppDefinition } = await import("/src/state/definitions.ts");
    const res = await route_get_app_definition({});
    if (res200(res)) {
      useAppDefinition.setState({
        appSpec: res.data.appSpec ?? null,
        appDefinition: res.data.appDefinition ?? null,
      });
    }
  });
  await page.evaluate(
    async ({
      defaultConfigName,
      newConfigName,
      sectionAId,
      sectionBId,
    }) => {
      const { route_load_project_config } = await import(
        "/src/utils/generatedEndpoints.ts"
      );
      const { res200 } = await import("/src/utils/endpointUtils.ts");
      const { useAppConfigs, useProjectState } = await import(
        "/src/state/definitions.ts"
      );

      function applyText(projectState, sectionId, text) {
        if (!projectState || !sectionId) {
          return projectState;
        }
        const variantId = projectState.projectConfig.sectionVariantMap[sectionId];
        if (!variantId) {
          return projectState;
        }
        const variant = projectState.sectionVariants[variantId];
        if (!variant) {
          return projectState;
        }
        const implId = variant.impl;
        const impl = projectState.sectionImpls[implId];
        if (!impl || impl.type !== "TextBlock") {
          return projectState;
        }
        return {
          ...projectState,
          sectionImpls: {
            ...projectState.sectionImpls,
            [implId]: { ...impl, text },
          },
        };
      }

      async function loadConfig(projectConfigName) {
        const res = await route_load_project_config({ projectConfigName });
        if (!res200(res)) {
          return null;
        }
        return res.data;
      }

      const defaultState = applyText(
        await loadConfig(defaultConfigName),
        sectionAId,
        "Alpha output",
      );
      if (defaultState) {
        const hydrated = {
          ...defaultState,
          previewSectionVariantMap: {},
          appSpec: null,
        };
        useProjectState.setState(hydrated);
        useAppConfigs.setState((state) => ({
          configs: {
            ...state.configs,
            [defaultState.projectConfig.id]: hydrated,
          },
        }));
      }

      const newState = applyText(
        await loadConfig(newConfigName),
        sectionBId,
        "Beta output",
      );
      if (newState) {
        const hydrated = {
          ...newState,
          previewSectionVariantMap: {},
          appSpec: null,
        };
        useAppConfigs.setState((state) => ({
          configs: {
            ...state.configs,
            [newState.projectConfig.id]: hydrated,
          },
        }));
      }
    },
    {
      defaultConfigName: defaultConfig.name,
      newConfigName: newConfig.name,
      sectionAId: sectionA.sectionId,
      sectionBId: sectionB.sectionId,
    },
  );

  await page.getByLabel("Preview config").selectOption(newConfig.id);

  const previewToggle = page.getByRole("button", {
    name: /Show Preview|Hide Preview/,
  });
  await expect(previewToggle).toBeVisible();
  if ((await previewToggle.textContent())?.includes("Show")) {
    await previewToggle.click();
  }

  await expect(page.getByText("App Preview")).toBeVisible();
  await expect(page.getByRole("button", { name: defaultConfig.name })).toBeVisible();
  await expect(page.getByRole("button", { name: newConfig.name })).toBeVisible();

  await expect(page.getByText("Alpha output")).toBeVisible();
  await page.getByRole("button", { name: newConfig.name }).click();
  await expect(page.getByText("Beta output")).toBeVisible();
});
