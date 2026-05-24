import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

test("frontend selection keeps the newer ui-only target after a stale durable ack", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);
  const initialSectionId = "section-initial";
  const targetSectionId = "section-target";

  try {
    const finalActiveIds = await page.evaluate(
      async ({ initialId, projectConfigId, targetId }) => {
        const [
          {
            getActiveSectionUISelectionGeneration,
            markPendingActiveSectionBackendSyncOp,
            useActiveSectionUI,
          },
          { setActiveSectionIds },
          { loadProjectState },
          { processProjectStateUpdateFromBackend },
          {
            createCodeSectionImpl,
            createCore,
            createProjectConfig,
            createProjectChatWindowingState,
            createSingletonSections,
            createUserDefaultCodeSectionImpl,
            createVariant,
          },
        ] = await Promise.all([
          import("/src/state/activeSectionUI.ts"),
          import("/src/state/actions/activeSections.ts"),
          import("/src/state/actions/project/loadProject.ts"),
          import("/src/state/actions/sectionInfos.ts"),
          import("/src/utils/generatedTypes.ts"),
        ]);
        const buildProjectState = (activeIds) => {
          const sectionVariantMap = {};
          const sections = {};
          const sectionImpls = {};
          const sectionVariants = {};
          for (const sectionId of [initialId, targetId]) {
            const variantId = `variant-${sectionId}`;
            const implId = `impl-${sectionId}`;
            sectionVariantMap[sectionId] = variantId;
            sections[sectionId] = createCore({ id: sectionId });
            sectionVariants[variantId] = createVariant({
              id: variantId,
              impl: implId,
              nonPresetImpls: [implId],
              name: `variant-${sectionId}`,
            });
            sectionImpls[implId] = createCodeSectionImpl(
              createUserDefaultCodeSectionImpl(),
              {
                id: implId,
              },
            );
          }
          return {
            projectConfig: createProjectConfig({
              id: projectConfigId,
              activeIds,
              sectionVariantMap,
            }),
            sections,
            sectionImpls,
            sectionVariants,
            codeObjs: {},
            codeObjImpls: {},
            codeObjVariants: {},
            artifactGroups: {},
            singletonSections: createSingletonSections(),
            parentSectionMap: {},
            shownParamIds: {},
            requiredDecodedImages: [],
            genCodeBinding: null,
            projectChatWindowing: createProjectChatWindowingState(),
          };
        };

        await loadProjectState(buildProjectState([]));
        setActiveSectionIds([initialId], { syncMode: "ui-only" });
        const staleOpId = "stale-selection-op";
        markPendingActiveSectionBackendSyncOp(
          staleOpId,
          getActiveSectionUISelectionGeneration(),
        );
        setActiveSectionIds([targetId], { syncMode: "ui-only" });
        processProjectStateUpdateFromBackend({
          projectState: buildProjectState([initialId]),
          completedOpIds: [staleOpId],
          pendingOpIds: [],
        });
        return [...useActiveSectionUI.getState().activeIds];
      },
      {
        initialId: initialSectionId,
        projectConfigId: projectContext.projectConfigId,
        targetId: targetSectionId,
      },
    );

    expect(finalActiveIds).toEqual([targetSectionId]);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("right-pane reveal rollback returns backend authority to later backend snapshots", async ({
  page,
}) => {
  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);

  try {
    const result = await page.evaluate(
      async ({ projectConfigId }) => {
        const [
          { useActiveSectionUI },
          { receiveUISettingReveal },
          { loadProjectState },
          { processProjectStateUpdateFromBackend },
          {
            createCodeSectionImpl,
            createCore,
            createProjectConfig,
            createProjectChatWindowingState,
            createSingletonSections,
            createUserDefaultCodeSectionImpl,
            createVariant,
          },
        ] = await Promise.all([
          import("/src/state/definitions.ts"),
          import("/src/state/actions/uiSettingReveal.ts"),
          import("/src/state/actions/project/loadProject.ts"),
          import("/src/state/actions/sectionInfos.ts"),
          import("/src/utils/generatedTypes.ts"),
        ]);

        const initialId = "section-initial";
        const targetId = "section-target";
        const backendId = "section-backend";

        const buildProjectState = (activeIds: string[]) => {
          const sectionVariantMap: Record<string, string> = {};
          const sections: Record<string, unknown> = {};
          const sectionImpls: Record<string, unknown> = {};
          const sectionVariants: Record<string, unknown> = {};

          for (const sectionId of [initialId, targetId, backendId]) {
            const variantId = `variant-${sectionId}`;
            const implId = `impl-${sectionId}`;
            sectionVariantMap[sectionId] = variantId;
            sections[sectionId] = createCore({ id: sectionId });
            sectionVariants[variantId] = createVariant({
              id: variantId,
              impl: implId,
              nonPresetImpls: [implId],
              name: `variant-${sectionId}`,
            });
            sectionImpls[implId] = createCodeSectionImpl(
              createUserDefaultCodeSectionImpl(),
              {
                id: implId,
              },
            );
          }

          return {
            projectConfig: createProjectConfig({
              id: projectConfigId,
              activeIds,
              sectionVariantMap,
            }),
            sections,
            sectionImpls,
            sectionVariants,
            codeObjs: {},
            codeObjImpls: {},
            codeObjVariants: {},
            artifactGroups: {},
            singletonSections: createSingletonSections(),
            parentSectionMap: {},
            shownParamIds: {},
            requiredDecodedImages: [],
            genCodeBinding: null,
            projectChatWindowing: createProjectChatWindowingState(),
          };
        };

        await loadProjectState(buildProjectState([initialId]));

        const originalQuerySelector = document.querySelector.bind(document);
        document.querySelector = ((selector: string) => {
          if (selector === '[data-testid="ui-editor-tab-content-shell"]') {
            return {
              querySelector: () => null,
            } as unknown as Element;
          }
          return originalQuerySelector(selector);
        }) as typeof document.querySelector;

        try {
          const statuses = await receiveUISettingReveal({
            projectConfigId,
            chatId: null,
            durationMs: 120,
            requestId: "pw-reveal-rollback-authority",
            activeSectionId: targetId,
            reveals: [
              {
                settingId: "core.code.section_variants",
                side: "right",
                overviewTabKey: null,
                uiEditorTabName: "SectionVariantsConfig",
                pluginId: null,
                paneId: null,
                strategy: "dom_anchor",
                anchorId: "core.code.section_variants",
                pluginRevealKey: null,
                revealActivationSteps: [],
              },
            ],
          });
          const afterRollback = [...useActiveSectionUI.getState().activeIds];
          const backendHydrationEnabled =
            useActiveSectionUI.getState().backendHydrationEnabled;

          processProjectStateUpdateFromBackend({
            projectState: buildProjectState([backendId]),
            completedOpIds: [],
            pendingOpIds: [],
          });

          return {
            afterBackend: [...useActiveSectionUI.getState().activeIds],
            afterRollback,
            backendHydrationEnabled,
            statuses,
          };
        } finally {
          document.querySelector = originalQuerySelector;
        }
      },
      { projectConfigId: projectContext.projectConfigId },
    );

    expect(result.statuses[0]?.status).toBe("failed");
    expect(result.statuses[0]?.errorMessage).toContain("Could not find anchor");
    expect(result.afterRollback).toEqual(["section-initial"]);
    expect(result.backendHydrationEnabled).toBe(true);
    expect(result.afterBackend).toEqual(["section-backend"]);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
