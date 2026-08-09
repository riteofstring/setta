import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  loadProjectConfig,
  openIsolatedProject,
} from "../helpers";

test("stale same-generation selection acknowledgements do not clobber the UI-owned selection", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const setActiveIdsRoute = "**/api/setActiveIds";
  let releaseSetActiveIdsRoute: (() => void) | null = null;
  let setActiveIdsRequestCount = 0;
  const setActiveIdsGate = new Promise<void>((resolve) => {
    releaseSetActiveIdsRoute = resolve;
  });

  await page.route(setActiveIdsRoute, async (route) => {
    setActiveIdsRequestCount += 1;
    await setActiveIdsGate;
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "null",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Route is already handled")) {
        return;
      }
      throw error;
    }
  });

  try {
    const sectionId = await createCallableSection(
      page,
      projectContext.projectConfigId,
    );
    const initialProjectState = await loadProjectConfig(page);
    const sectionChrome = page
      .locator(`section[data-section-id="${sectionId}"]`)
      .first();
    const minimapNode = page.locator(`[data-minimap-node-id="${sectionId}"]`);

    await expect(sectionChrome).toBeVisible();
    await expect(minimapNode).toBeVisible();

    await page.evaluate(async () => {
      const { setActiveSectionIds } = await import(
        "/src/state/actions/activeSections.ts"
      );

      // Start from a known empty selection so the next immediate publish owns a
      // fresh generation and the second publish shares it.
      setActiveSectionIds([], { syncMode: "ui-only" });
    });

    await expect
      .poll(async () => await readFrontendActiveIds(page))
      .toEqual([]);

    const startedSelectionSync = await page.evaluate(
      async (selectedSectionId) => {
        const [{ setActiveSectionIds }, { useActiveSectionUI }] =
          await Promise.all([
            import("/src/state/actions/activeSections.ts"),
            import("/src/state/activeSectionUI.ts"),
          ]);

        setActiveSectionIds([selectedSectionId], { syncMode: "immediate" });
        setActiveSectionIds([selectedSectionId], {
          syncMode: "immediate",
          forceDurableSync: true,
        });

        return {
          activeIds: [...useActiveSectionUI.getState().activeIds],
          pendingBackendSyncOpIds: [
            ...useActiveSectionUI.getState().pendingBackendSyncOpIds,
          ],
        };
      },
      sectionId,
    );

    expect(startedSelectionSync.activeIds).toEqual([sectionId]);
    expect(startedSelectionSync.pendingBackendSyncOpIds).toHaveLength(2);
    await expect.poll(() => setActiveIdsRequestCount).toBe(2);

    const [firstOpId, secondOpId] =
      startedSelectionSync.pendingBackendSyncOpIds;
    if (typeof firstOpId !== "string" || typeof secondOpId !== "string") {
      throw new Error("Expected two pending active-section sync op ids.");
    }

    const afterFirstCompletion = await page.evaluate(
      async ({ projectState, completedOpId }) => {
        const [
          { processProjectStateUpdateFromBackend },
          { useActiveSectionUI },
        ] = await Promise.all([
          import("/src/state/actions/sectionInfos.ts"),
          import("/src/state/activeSectionUI.ts"),
        ]);

        const nextProjectState = JSON.parse(
          JSON.stringify(projectState),
        ) as Record<string, unknown>;
        const projectConfig = nextProjectState.projectConfig as {
          activeIds: string[];
        };
        projectConfig.activeIds = [];

        processProjectStateUpdateFromBackend({
          projectState: nextProjectState,
          completedOpIds: [completedOpId],
          pendingOpIds: [],
        });

        return {
          activeIds: [...useActiveSectionUI.getState().activeIds],
          backendHydrationEnabled:
            useActiveSectionUI.getState().backendHydrationEnabled,
          pendingBackendSyncOpIds: [
            ...useActiveSectionUI.getState().pendingBackendSyncOpIds,
          ],
        };
      },
      {
        projectState: initialProjectState,
        completedOpId: firstOpId,
      },
    );

    expect(afterFirstCompletion.activeIds).toEqual([sectionId]);
    expect(afterFirstCompletion.backendHydrationEnabled).toBe(false);
    expect(afterFirstCompletion.pendingBackendSyncOpIds).toEqual([secondOpId]);
    await expect
      .poll(async () => await readFrontendActiveIds(page))
      .toEqual([sectionId]);
    await expect(sectionChrome).toHaveAttribute("data-section-active", "true");
    await expect(minimapNode).toHaveClass(/selected/);

    const afterSecondCompletion = await page.evaluate(
      async ({ projectState, completedOpId }) => {
        const [
          { processProjectStateUpdateFromBackend },
          { useActiveSectionUI },
        ] = await Promise.all([
          import("/src/state/actions/sectionInfos.ts"),
          import("/src/state/activeSectionUI.ts"),
        ]);

        const nextProjectState = JSON.parse(
          JSON.stringify(projectState),
        ) as Record<string, unknown>;
        const projectConfig = nextProjectState.projectConfig as {
          activeIds: string[];
        };
        projectConfig.activeIds = [];

        processProjectStateUpdateFromBackend({
          projectState: nextProjectState,
          completedOpIds: [completedOpId],
          pendingOpIds: [],
        });

        return {
          activeIds: [...useActiveSectionUI.getState().activeIds],
          backendHydrationEnabled:
            useActiveSectionUI.getState().backendHydrationEnabled,
          pendingBackendSyncOpIds: [
            ...useActiveSectionUI.getState().pendingBackendSyncOpIds,
          ],
        };
      },
      {
        projectState: initialProjectState,
        completedOpId: secondOpId,
      },
    );

    expect(afterSecondCompletion.activeIds).toEqual([]);
    expect(afterSecondCompletion.backendHydrationEnabled).toBe(true);
    expect(afterSecondCompletion.pendingBackendSyncOpIds).toEqual([]);
    await expect
      .poll(async () => await readFrontendActiveIds(page))
      .toEqual([]);
    await expect(sectionChrome).toHaveAttribute("data-section-active", "false");
    await expect(minimapNode).not.toHaveClass(/selected/);
  } finally {
    releaseSetActiveIdsRoute?.();
    await page.unroute(setActiveIdsRoute);
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function readFrontendActiveIds(page: Page) {
  return await page.evaluate(async () => {
    const { useActiveSectionUI } = await import(
      "/src/state/activeSectionUI.ts"
    );
    return [...useActiveSectionUI.getState().activeIds];
  });
}
