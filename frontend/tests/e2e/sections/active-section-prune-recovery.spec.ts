import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  loadProjectConfig,
  openIsolatedProject,
} from "../helpers";

test("late durable selection completion restores backend authority after an invalid-id prune", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const setActiveIdsRoute = "**/api/setActiveIds";

  await page.route(setActiveIdsRoute, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    });
  });

  try {
    const sectionId = await createCallableSection(
      page,
      projectContext.projectConfigId,
    );
    const initialProjectState = await loadProjectConfig(page);

    await expect(
      page.locator(`section[data-section-id="${sectionId}"]`).first(),
    ).toBeVisible();

    const result = await page.evaluate(
      async ({ projectState, sectionId }) => {
        const [
          { setActiveSectionIds },
          { processProjectStateUpdateFromBackend },
          { useActiveSectionUI },
        ] = await Promise.all([
          import("/src/state/actions/activeSections.ts"),
          import("/src/state/actions/sectionInfos.ts"),
          import("/src/state/activeSectionUI.ts"),
        ]);

        const cloneProjectState = () =>
          JSON.parse(JSON.stringify(projectState)) as Record<string, unknown>;

        const buildPrunedProjectState = () => {
          const nextProjectState = cloneProjectState();
          const projectConfig = nextProjectState.projectConfig as {
            activeIds: string[];
            sectionVariantMap: Record<string, string>;
          };
          const sectionVariants = nextProjectState.sectionVariants as Record<
            string,
            { impl?: string }
          >;
          const sectionImpls = nextProjectState.sectionImpls as Record<
            string,
            unknown
          >;
          const sections = nextProjectState.sections as Record<string, unknown>;
          const parentSectionMap = nextProjectState.parentSectionMap as
            | Record<string, string | null>
            | undefined;
          const shownParamIds = nextProjectState.shownParamIds as
            | Record<string, Array<string>>
            | undefined;

          const variantId = projectConfig.sectionVariantMap[sectionId];
          if (typeof variantId !== "string") {
            throw new Error(`Missing variant id for ${sectionId}.`);
          }
          const implId = sectionVariants[variantId]?.impl;
          if (typeof implId !== "string") {
            throw new Error(`Missing impl id for ${variantId}.`);
          }

          projectConfig.activeIds = [];
          delete projectConfig.sectionVariantMap[sectionId];
          delete sections[sectionId];
          delete sectionVariants[variantId];
          delete sectionImpls[implId];
          if (parentSectionMap) {
            delete parentSectionMap[sectionId];
          }
          if (shownParamIds) {
            delete shownParamIds[sectionId];
          }

          return nextProjectState;
        };

        const buildRestoredProjectState = () => {
          const nextProjectState = cloneProjectState();
          const projectConfig = nextProjectState.projectConfig as {
            activeIds: string[];
          };
          projectConfig.activeIds = [sectionId];
          return nextProjectState;
        };

        setActiveSectionIds([sectionId], { syncMode: "immediate" });

        const staleOpId =
          useActiveSectionUI.getState().pendingBackendSyncOpIds[0];
        if (typeof staleOpId !== "string") {
          throw new Error("Expected a pending active-section sync op.");
        }

        processProjectStateUpdateFromBackend({
          projectState: buildPrunedProjectState(),
          completedOpIds: [],
          pendingOpIds: [],
        });
        const afterPrune = {
          activeIds: [...useActiveSectionUI.getState().activeIds],
          backendHydrationEnabled:
            useActiveSectionUI.getState().backendHydrationEnabled,
        };

        processProjectStateUpdateFromBackend({
          projectState: buildPrunedProjectState(),
          completedOpIds: [staleOpId],
          pendingOpIds: [],
        });
        const afterCompletion = {
          activeIds: [...useActiveSectionUI.getState().activeIds],
          backendHydrationEnabled:
            useActiveSectionUI.getState().backendHydrationEnabled,
          pendingBackendSyncOpIds: [
            ...useActiveSectionUI.getState().pendingBackendSyncOpIds,
          ],
        };

        processProjectStateUpdateFromBackend({
          projectState: buildRestoredProjectState(),
          completedOpIds: [],
          pendingOpIds: [],
        });

        return {
          afterPrune,
          afterCompletion,
          finalActiveIds: [...useActiveSectionUI.getState().activeIds],
        };
      },
      { projectState: initialProjectState, sectionId },
    );

    expect(result.afterPrune.activeIds).toEqual([]);
    expect(result.afterPrune.backendHydrationEnabled).toBe(false);
    expect(result.afterCompletion.activeIds).toEqual([]);
    expect(result.afterCompletion.backendHydrationEnabled).toBe(true);
    expect(result.afterCompletion.pendingBackendSyncOpIds).toEqual([]);
    expect(result.finalActiveIds).toEqual([sectionId]);

    const sectionChrome = page
      .locator(`section[data-section-id="${sectionId}"]`)
      .first();
    await expect(sectionChrome).toHaveAttribute("data-section-active", "true");
    await expect(
      page.locator(`[data-minimap-node-id="${sectionId}"]`),
    ).toHaveClass(/selected/);
  } finally {
    await page.unroute(setActiveIdsRoute);
    await cleanupIsolatedProject(page, projectContext);
  }
});
