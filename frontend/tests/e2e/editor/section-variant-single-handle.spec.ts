import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  clearProjectChatWindows,
  createCallableSection,
  createTextBlockSection,
  ensureAppReady,
  loadProjectConfig,
  openIsolatedProject,
  seedLocalStorage,
  setCallableFromFrontend,
  setParamEnteredValueFromFrontend,
} from "../helpers";

async function createSectionVariantFromFrontend(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<string> {
  return await page.evaluate(
    async ({
      projectConfigId: targetProjectConfigId,
      sectionId: targetSectionId,
    }) => {
      const { createNewSectionVariant, getLatestProjectState } = await import(
        "/src/openapi/http"
      );
      const { callOpenAPI, res200 } = await import(
        "/tests/e2e/browserAppSubsystemSdk.ts"
      );
      const { processProjectStateUpdateFromBackend } = await import(
        "/src/state/actions/sectionInfos"
      );
      const createResponse = await callOpenAPI(
        createNewSectionVariant({
          body: {
            projectConfigId: targetProjectConfigId,
            sectionId: targetSectionId,
            frontendOpId: null,
          },
        } as Parameters<typeof createNewSectionVariant>[0]),
      );
      if (!res200(createResponse)) {
        throw new Error(
          `create_new_section_variant failed: ${createResponse.status}`,
        );
      }

      const latestResponse = await callOpenAPI(
        getLatestProjectState({
          body: {
            projectConfigId: targetProjectConfigId,
          },
        } as Parameters<typeof getLatestProjectState>[0]),
      );
      if (!res200(latestResponse)) {
        throw new Error(
          `get_latest_project_state failed: ${latestResponse.status}`,
        );
      }
      processProjectStateUpdateFromBackend(latestResponse.data);
      return createResponse.data.variantId;
    },
    {
      projectConfigId,
      sectionId,
    },
  );
}

async function setSectionVariantFromFrontend(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  variantId: string,
): Promise<void> {
  await page.evaluate(
    async ({
      projectConfigId: targetProjectConfigId,
      sectionId: targetSectionId,
      variantId: targetVariantId,
    }) => {
      const { getLatestProjectState, setSectionVariant } = await import(
        "/src/openapi/http"
      );
      const { callOpenAPI, res200 } = await import(
        "/tests/e2e/browserAppSubsystemSdk.ts"
      );
      const { processProjectStateUpdateFromBackend } = await import(
        "/src/state/actions/sectionInfos"
      );
      const setResponse = await callOpenAPI(
        setSectionVariant({
          body: {
            projectConfigId: targetProjectConfigId,
            sectionId: targetSectionId,
            variantId: targetVariantId,
            frontendOpId: null,
          },
        } as Parameters<typeof setSectionVariant>[0]),
      );
      if (!res200(setResponse)) {
        throw new Error(`set_section_variant failed: ${setResponse.status}`);
      }

      const latestResponse = await callOpenAPI(
        getLatestProjectState({
          body: {
            projectConfigId: targetProjectConfigId,
          },
        } as Parameters<typeof getLatestProjectState>[0]),
      );
      if (!res200(latestResponse)) {
        throw new Error(
          `get_latest_project_state failed: ${latestResponse.status}`,
        );
      }
      processProjectStateUpdateFromBackend(latestResponse.data);
    },
    {
      projectConfigId,
      sectionId,
      variantId,
    },
  );
}

async function getShownParamInfoIds(
  page: Page,
  sectionId: string,
): Promise<string[]> {
  return await page.evaluate(async (targetSectionId) => {
    const { getCurrShownParamIds } = await import(
      "/src/state/actions/sectionInfos"
    );
    const { useProjectState } = await import("/src/state/definitions");
    const shown = getCurrShownParamIds(
      useProjectState.getState(),
      targetSectionId,
      false,
      true,
    );
    return shown.topLevelParamIds;
  }, sectionId);
}

async function getFirstShownParamInfoId(
  page: Page,
  sectionId: string,
): Promise<string | null> {
  return (await getShownParamInfoIds(page, sectionId))[0] ?? null;
}

async function getParamValueFromFrontendState(
  page: Page,
  sectionId: string,
  paramInfoId: string,
): Promise<string | null> {
  return await page.evaluate(
    async ({ targetSectionId, targetParamInfoId }) => {
      const { getCurrEffectiveCodeObjImplWithTypeGuardIfPresent } =
        await import("/src/state/actions/sectionInfos");
      const { useProjectState } = await import("/src/state/definitions");
      const { isBaseChildlessCodeObjImpl } = await import(
        "/src/utils/generatedTypes"
      );
      const impl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
        useProjectState.getState(),
        targetSectionId,
        targetParamInfoId,
        isBaseChildlessCodeObjImpl,
        true,
      );
      return impl?.value ?? null;
    },
    {
      targetSectionId: sectionId,
      targetParamInfoId: paramInfoId,
    },
  );
}

test.describe.serial("section variants single-item handle", () => {
  test("keeps the drag handle visible when exactly one variant exists", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { TextBlock: "SectionVariantsConfig" },
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await clearProjectChatWindows(page);
      const { sectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_single_variant_handle__",
      );

      const node = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      );
      await expect(node).toBeVisible();
      await activateSectionForEditor(page, sectionId);
      await showSectionVariantsTab(page, "TextBlock");

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();
      await expect(
        uiEditorPane.getByRole("heading", { name: "Variants" }),
      ).toBeVisible();

      await expect(
        uiEditorPane.locator('[data-testid="section-variant-row"]'),
      ).toHaveCount(1);

      const handle = uiEditorPane
        .locator('[data-testid="section-variant-drag-handle"]')
        .first();
      await expect(handle).toBeVisible();

      // Single-variant rows are not sortable, but the handle glyph must stay visible.
      const handleClass = (await handle.getAttribute("class")) ?? "";
      expect(handleClass).toContain("w-4");
      expect(handleClass).toContain("opacity-60");
      expect(handleClass).not.toContain("text-transparent");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("shows named variants and refreshes after adding a variant", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { TextBlock: "SectionVariantsConfig" },
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await clearProjectChatWindows(page);
      const { sectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_named_variant__",
      );

      const node = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      );
      await expect(node).toBeVisible();
      await activateSectionForEditor(page, sectionId);
      await showSectionVariantsTab(page, "TextBlock");

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();
      await expect(
        uiEditorPane.getByRole("heading", { name: "Variants" }),
      ).toBeVisible();

      const rows = uiEditorPane.locator('[data-testid="section-variant-row"]');
      await expect(rows).toHaveCount(1);

      const firstLabel = rows.first().locator("p.section-key");
      await expect(firstLabel).toHaveText(/\S/);
      const initialName = await firstLabel.textContent();

      await uiEditorPane.getByRole("button", { name: "Add Variant" }).click();
      await expect(rows).toHaveCount(2);

      const secondLabel = rows.nth(1).locator("p.section-key");
      await expect(secondLabel).toHaveText(/\S/);
      const secondName = await secondLabel.textContent();
      expect(secondName).not.toBe(initialName);
      expect(secondName).not.toBe(`${initialName}_2`);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("switching to a blank variant does not crash after params were added to another variant", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { Callable: "SectionVariantsConfig" },
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await clearProjectChatWindows(page);
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );

      const node = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      );
      await expect(node).toBeVisible();
      await activateSectionForEditor(page, sectionId);
      await showSectionVariantsTab(page, "Callable");

      const blankVariantId = await createSectionVariantFromFrontend(
        page,
        projectContext.projectConfigId,
        sectionId,
      );

      await setCallableFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        callableName: "sorted",
        refetchParams: true,
      });

      await expect(node).toContainText("sorted");
      await setSectionVariantFromFrontend(
        page,
        projectContext.projectConfigId,
        sectionId,
        blankVariantId,
      );

      await expect(page.locator("#root")).not.toContainText(
        "Unhandled Thrown Error!",
      );
      await expect(node).toBeVisible();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("switching between multiple callable variants with param-bearing state does not crash", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { Callable: "SectionVariantsConfig" },
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await clearProjectChatWindows(page);
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );

      const node = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      );
      await expect(node).toBeVisible();
      await activateSectionForEditor(page, sectionId);
      await showSectionVariantsTab(page, "Callable");

      const projectState = await loadProjectConfig(page);
      const originalVariantId =
        projectState.projectConfig.sectionVariantMap[sectionId] ?? null;
      if (!originalVariantId) {
        throw new Error("Missing original variant id for callable section.");
      }

      const blankVariantIds: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        blankVariantIds.push(
          await createSectionVariantFromFrontend(
            page,
            projectContext.projectConfigId,
            sectionId,
          ),
        );
      }

      await setCallableFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        callableName: "sorted",
        refetchParams: true,
      });

      await expect(node).toContainText("sorted");
      await expect
        .poll(() => getShownParamInfoIds(page, sectionId).then((ids) => ids.length))
        .toBeGreaterThan(0);

      for (const variantId of [...blankVariantIds, originalVariantId]) {
        await setSectionVariantFromFrontend(
          page,
          projectContext.projectConfigId,
          sectionId,
          variantId,
        );
        await expect(page.locator("#root")).not.toContainText(
          "Unhandled Thrown Error!",
        );
        await expect(node).toBeVisible();
      }
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("param values stay scoped to the variant where they were entered", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { Callable: "SectionVariantsConfig" },
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await clearProjectChatWindows(page);
      const sectionId = await createCallableSection(
        page,
        projectContext.projectConfigId,
      );
      const node = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      );
      await expect(node).toBeVisible();
      await activateSectionForEditor(page, sectionId);
      await showSectionVariantsTab(page, "Callable");

      await setCallableFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        callableName: "sorted",
        refetchParams: true,
      });

      await expect
        .poll(() => getShownParamInfoIds(page, sectionId).then((ids) => ids.length))
        .toBeGreaterThan(0);
      const paramInfoId = await getFirstShownParamInfoId(page, sectionId);
      if (!paramInfoId) {
        throw new Error(`Callable section ${sectionId} did not expose params.`);
      }
      const originalVariantId =
        (await loadProjectConfig(page)).projectConfig.sectionVariantMap[
          sectionId
        ] ?? null;
      if (!originalVariantId) {
        throw new Error("Missing original section variant.");
      }
      const secondVariantId = await createSectionVariantFromFrontend(
        page,
        projectContext.projectConfigId,
        sectionId,
      );
      await setSectionVariantFromFrontend(
        page,
        projectContext.projectConfigId,
        sectionId,
        originalVariantId,
      );

      await expect
        .poll(() => getParamValueFromFrontendState(page, sectionId, paramInfoId))
        .toBe("");
      await setParamEnteredValueFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        paramInfoId,
        value: "2",
      });
      await expect
        .poll(() => getParamValueFromFrontendState(page, sectionId, paramInfoId))
        .toBe("2");

      await setSectionVariantFromFrontend(
        page,
        projectContext.projectConfigId,
        sectionId,
        secondVariantId,
      );
      await expect
        .poll(() => getParamValueFromFrontendState(page, sectionId, paramInfoId))
        .toBe("");

      await setParamEnteredValueFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        paramInfoId,
        value: "3",
      });
      await expect
        .poll(() => getParamValueFromFrontendState(page, sectionId, paramInfoId))
        .toBe("3");

      await setSectionVariantFromFrontend(
        page,
        projectContext.projectConfigId,
        sectionId,
        originalVariantId,
      );
      await expect
        .poll(() => getParamValueFromFrontendState(page, sectionId, paramInfoId))
        .toBe("2");

      await setSectionVariantFromFrontend(
        page,
        projectContext.projectConfigId,
        sectionId,
        secondVariantId,
      );
      await expect
        .poll(() => getParamValueFromFrontendState(page, sectionId, paramInfoId))
        .toBe("3");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

async function activateSectionForEditor(
  page: Page,
  sectionId: string,
): Promise<void> {
  await page.evaluate(async (id) => {
    const { setActiveSectionIds } = await import(
      "/src/state/actions/activeSections"
    );
    setActiveSectionIds([id], { syncMode: "ui-only" });
  }, sectionId);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { getActiveSectionUIIds } = await import(
          "/src/state/activeSectionUI"
        );
        return getActiveSectionUIIds();
      }),
    )
    .toEqual([sectionId]);
}

async function showSectionVariantsTab(
  page: Page,
  sectionType: "Callable" | "TextBlock",
): Promise<void> {
  await page.evaluate(async (type) => {
    const { useLocalStorage } = await import("/src/state/definitions");
    useLocalStorage.setState((state) => ({
      uiEditorTab: {
        ...state.uiEditorTab,
        [type]: "SectionVariantsConfig",
      },
    }));
  }, sectionType);
}
