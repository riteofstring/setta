import { expect, test, type Locator, type Page } from "@playwright/test";
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
} from "../helpers";

const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

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
      const { res200 } = await import("/src/utils/endpointUtils");
      const { processProjectStateUpdateFromBackend } = await import(
        "/src/state/actions/sectionInfos"
      );
      const {
        route_create_new_section_variant,
        route_get_latest_project_state,
      } = await import("/src/utils/generatedEndpoints");

      const createResponse = await route_create_new_section_variant({
        projectConfigId: targetProjectConfigId,
        sectionId: targetSectionId,
        frontendOpId: null,
      });
      if (!res200(createResponse)) {
        throw new Error(
          `create_new_section_variant failed: ${createResponse.status}`,
        );
      }

      const latestResponse = await route_get_latest_project_state({
        projectConfigId: targetProjectConfigId,
      });
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
      const { res200 } = await import("/src/utils/endpointUtils");
      const { processProjectStateUpdateFromBackend } = await import(
        "/src/state/actions/sectionInfos"
      );
      const { route_get_latest_project_state, route_set_section_variant } =
        await import("/src/utils/generatedEndpoints");

      const setResponse = await route_set_section_variant({
        projectConfigId: targetProjectConfigId,
        sectionId: targetSectionId,
        variantId: targetVariantId,
        frontendOpId: null,
      });
      if (!res200(setResponse)) {
        throw new Error(`set_section_variant failed: ${setResponse.status}`);
      }

      const latestResponse = await route_get_latest_project_state({
        projectConfigId: targetProjectConfigId,
      });
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

async function getFirstParamInfoId(
  page: Page,
  sectionId: string,
): Promise<string> {
  const firstParam = page
    .locator(
      `.react-flow__node[data-id="${sectionId}"] [id^="ParamContainer-${sectionId}-"]`,
    )
    .first();
  await expect(firstParam).toBeVisible({ timeout: 20000 });
  const paramContainerId = await firstParam.getAttribute("id");
  const prefix = `ParamContainer-${sectionId}-`;
  if (!paramContainerId || !paramContainerId.startsWith(prefix)) {
    throw new Error(
      `Unexpected param container id for ${sectionId}: ${paramContainerId}`,
    );
  }
  return paramContainerId.slice(prefix.length);
}

async function readCodeMirrorValue(
  page: Page,
  id: string,
  fallbackId?: string,
): Promise<string> {
  const value = await page.evaluate(
    ({ targetId, fallbackTargetId }) => {
      const root =
        document.getElementById(targetId) ??
        (fallbackTargetId ? document.getElementById(fallbackTargetId) : null);
      if (!root) {
        return null;
      }
      const content =
        root.querySelector(".cm-content") ?? root.querySelector(".cm-line");
      return content?.textContent ?? root.textContent ?? "";
    },
    { targetId: id, fallbackTargetId: fallbackId },
  );
  return value ?? "";
}

async function fillCodeMirrorValue(
  page: Page,
  activationRoot: Locator,
  codeMirrorId: string,
  fallbackId: string,
  value: string,
): Promise<void> {
  await expect(activationRoot).toBeVisible();

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await activationRoot.focus();
    await page.waitForTimeout(50);
    const codeMirrorRoot = page.locator(`[id="${codeMirrorId}"]`);
    if (!(await codeMirrorRoot.isVisible())) {
      await activationRoot.click({ force: true });
    }
    await expect(codeMirrorRoot).toBeVisible();
    const cmContent = codeMirrorRoot.locator(".cm-content, .cm-line").first();
    await expect(cmContent).toBeVisible();
    await cmContent.click({ force: true });
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(value);

    const startedAt = Date.now();
    while (Date.now() - startedAt < 2000) {
      if (
        (await readCodeMirrorValue(page, codeMirrorId, fallbackId)) === value
      ) {
        return;
      }
      await page.waitForTimeout(50);
    }
  }

  throw new Error(
    `CodeMirror ${codeMirrorId} did not update to ${JSON.stringify(value)}.`,
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

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

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

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();
      await uiEditorPane
        .locator('[data-testid="ui-editor-tab-section-variants-config"]')
        .click();
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

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const blankVariantId = await page.evaluate(
        async ({ projectConfigId, sectionId }) => {
          const { res200 } = await import("/src/utils/endpointUtils");
          const { processProjectStateUpdateFromBackend } = await import(
            "/src/state/actions/sectionInfos"
          );
          const {
            route_create_new_section_variant,
            route_get_latest_project_state,
          } = await import("/src/utils/generatedEndpoints");

          const createResponse = await route_create_new_section_variant({
            projectConfigId,
            sectionId,
            frontendOpId: null,
          });
          if (!res200(createResponse)) {
            throw new Error(
              `create_new_section_variant failed: ${createResponse.status}`,
            );
          }

          const latestResponse = await route_get_latest_project_state({
            projectConfigId,
          });
          if (!res200(latestResponse)) {
            throw new Error(
              `get_latest_project_state failed: ${latestResponse.status}`,
            );
          }
          processProjectStateUpdateFromBackend(latestResponse.data);
          return createResponse.data.variantId;
        },
        {
          projectConfigId: projectContext.projectConfigId,
          sectionId,
        },
      );

      await setCallableFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        callableName: "sorted",
        refetchParams: true,
      });

      await expect(node).toContainText("sorted");
      await page.evaluate(
        async ({ projectConfigId, sectionId, variantId }) => {
          const { res200 } = await import("/src/utils/endpointUtils");
          const { processProjectStateUpdateFromBackend } = await import(
            "/src/state/actions/sectionInfos"
          );
          const { route_get_latest_project_state, route_set_section_variant } =
            await import("/src/utils/generatedEndpoints");

          const setResponse = await route_set_section_variant({
            projectConfigId,
            sectionId,
            variantId,
            frontendOpId: null,
          });
          if (!res200(setResponse)) {
            throw new Error(
              `set_section_variant failed: ${setResponse.status}`,
            );
          }

          const latestResponse = await route_get_latest_project_state({
            projectConfigId,
          });
          if (!res200(latestResponse)) {
            throw new Error(
              `get_latest_project_state failed: ${latestResponse.status}`,
            );
          }
          processProjectStateUpdateFromBackend(latestResponse.data);
        },
        {
          projectConfigId: projectContext.projectConfigId,
          sectionId,
          variantId: blankVariantId,
        },
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

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const projectState = await loadProjectConfig(page);
      const originalVariantId =
        projectState.projectConfig.sectionVariantMap[sectionId] ?? null;
      if (!originalVariantId) {
        throw new Error("Missing original variant id for callable section.");
      }

      const { blankVariantIds } = await page.evaluate(
        async ({ projectConfigId, sectionId }) => {
          const { res200 } = await import("/src/utils/endpointUtils");
          const { processProjectStateUpdateFromBackend } = await import(
            "/src/state/actions/sectionInfos"
          );
          const {
            route_create_new_section_variant,
            route_get_latest_project_state,
          } = await import("/src/utils/generatedEndpoints");

          const createdVariantIds: string[] = [];
          for (let i = 0; i < 3; i += 1) {
            const createResponse = await route_create_new_section_variant({
              projectConfigId,
              sectionId,
              frontendOpId: null,
            });
            if (!res200(createResponse)) {
              throw new Error(
                `create_new_section_variant failed: ${createResponse.status}`,
              );
            }
            createdVariantIds.push(createResponse.data.variantId);
          }

          const latestResponse = await route_get_latest_project_state({
            projectConfigId,
          });
          if (!res200(latestResponse)) {
            throw new Error(
              `get_latest_project_state failed: ${latestResponse.status}`,
            );
          }
          processProjectStateUpdateFromBackend(latestResponse.data);

          return {
            blankVariantIds: createdVariantIds,
          };
        },
        {
          projectConfigId: projectContext.projectConfigId,
          sectionId,
        },
      );

      await setCallableFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        callableName: "sorted",
        refetchParams: true,
      });

      await expect(node).toContainText("sorted");
      await expect(node).toContainText("iterable");

      for (const variantId of [...blankVariantIds, originalVariantId]) {
        await page.evaluate(
          async ({ projectConfigId, sectionId, variantId }) => {
            const { res200 } = await import("/src/utils/endpointUtils");
            const { processProjectStateUpdateFromBackend } = await import(
              "/src/state/actions/sectionInfos"
            );
            const {
              route_get_latest_project_state,
              route_set_section_variant,
            } = await import("/src/utils/generatedEndpoints");

            const setResponse = await route_set_section_variant({
              projectConfigId,
              sectionId,
              variantId,
              frontendOpId: null,
            });
            if (!res200(setResponse)) {
              throw new Error(
                `set_section_variant failed: ${setResponse.status}`,
              );
            }

            const latestResponse = await route_get_latest_project_state({
              projectConfigId,
            });
            if (!res200(latestResponse)) {
              throw new Error(
                `get_latest_project_state failed: ${latestResponse.status}`,
              );
            }
            processProjectStateUpdateFromBackend(latestResponse.data);
          },
          {
            projectConfigId: projectContext.projectConfigId,
            sectionId,
            variantId,
          },
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
      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      await setCallableFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        callableName: "sorted",
        refetchParams: true,
      });

      const paramInfoId = await getFirstParamInfoId(page, sectionId);
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

      const paramInputId = `${sectionId}-${paramInfoId}-ParamInput`;
      const paramEditorId = `CodeMirror-${sectionId}-${paramInfoId}`;
      const paramInputRoot = page.locator(`[id="${paramInputId}"]`);
      await expect(paramInputRoot).toBeVisible();

      await fillCodeMirrorValue(
        page,
        paramInputRoot,
        paramEditorId,
        paramInputId,
        "2",
      );
      await expect
        .poll(() => readCodeMirrorValue(page, paramEditorId, paramInputId))
        .toBe("2");

      await setSectionVariantFromFrontend(
        page,
        projectContext.projectConfigId,
        sectionId,
        secondVariantId,
      );
      await expect
        .poll(() => readCodeMirrorValue(page, paramEditorId, paramInputId))
        .toBe("");

      await fillCodeMirrorValue(
        page,
        paramInputRoot,
        paramEditorId,
        paramInputId,
        "3",
      );
      await expect
        .poll(() => readCodeMirrorValue(page, paramEditorId, paramInputId))
        .toBe("3");

      await setSectionVariantFromFrontend(
        page,
        projectContext.projectConfigId,
        sectionId,
        originalVariantId,
      );
      await expect
        .poll(() => readCodeMirrorValue(page, paramEditorId, paramInputId))
        .toBe("2");

      await setSectionVariantFromFrontend(
        page,
        projectContext.projectConfigId,
        sectionId,
        secondVariantId,
      );
      await expect
        .poll(() => readCodeMirrorValue(page, paramEditorId, paramInputId))
        .toBe("3");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
