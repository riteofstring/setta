import { expect, test, type Page } from "@playwright/test";
import {
  applyProjectMutationsFromFrontend,
  cleanupIsolatedProject,
  createCallableSection,
  createChatSection,
  ensureAppReady,
  loadProjectConfig,
  openIsolatedProject,
  setCallableFromFrontend,
  toggleMinimizedFromFrontend,
} from "../helpers";

type SetCallableResponse = {
  callableId?: string | null;
  lspStatus?: string | null;
};
const TARGET_CALLABLE = "sorted";

async function setCallable(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  callableName: string,
): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = (await setCallableFromFrontend(page, {
      projectConfigId,
      sectionId,
      callableName,
      refetchParams: true,
    })) as SetCallableResponse | null;
    if (response?.lspStatus === "matched" && response.callableId) {
      return;
    }
    if (attempt < 7) {
      await page.waitForTimeout(500);
    }
  }
  throw new Error(
    `setCallable did not resolve ${callableName} for ${sectionId} in ${projectConfigId}.`,
  );
}

async function getParamIds(
  page: Page,
  sectionId: string,
  minCount: number,
): Promise<string[]> {
  const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
  const idPrefix = `ParamContainer-${sectionId}-`;
  await expect(sectionNode).toBeVisible();
  await expect(sectionNode.locator(`[id^="${idPrefix}"]`).first()).toBeVisible({
    timeout: 20000,
  });
  const ids = await sectionNode.locator(`[id^="${idPrefix}"]`).evaluateAll(
    (nodes, prefix) =>
      nodes
        .map((node) => node.id)
        .filter((id) => id.startsWith(prefix))
        .map((id) => id.slice(prefix.length)),
    idPrefix,
  );
  if (ids.length < minCount) {
    throw new Error(
      `Expected at least ${minCount} params in section ${sectionId}. Found ${ids.length}.`,
    );
  }
  return ids;
}

test.describe.serial("minimized callable edge handles", () => {
  test("keeps data + agentic edges connected to the callable while collapsing ports to single dots", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const projectConfigId = projectContext.projectConfigId;
      const sectionA = await createCallableSection(page, projectConfigId);
      const sectionB = await createCallableSection(page, projectConfigId);
      const { sectionId: chatSection } = await createChatSection(
        page,
        projectConfigId,
        "__pw_minimized_callable_chat__",
      );

      await setCallable(page, projectConfigId, sectionA, TARGET_CALLABLE);
      await setCallable(page, projectConfigId, sectionB, TARGET_CALLABLE);

      const [aParam] = await getParamIds(page, sectionA, 1);
      const [bParam1, bParam2] = await getParamIds(page, sectionB, 2);

      const aOutPortId = "pw-a-out";
      const bOutPortId1 = "pw-b-out-1";
      const bOutPortId2 = "pw-b-out-2";

      const config = await loadProjectConfig(page);
      const aVariantId =
        config.projectConfig.sectionVariantMap[sectionA] ?? null;
      const bVariantId =
        config.projectConfig.sectionVariantMap[sectionB] ?? null;
      const chatVariantId =
        config.projectConfig.sectionVariantMap[chatSection] ?? null;
      if (!aVariantId || !bVariantId || !chatVariantId) {
        throw new Error("Missing section variant ids for edge creation.");
      }

      // Create multiple incoming/outgoing data edges for sectionB so we can assert
      // that minimizing collapses them to a single dot per side.
      await applyProjectMutationsFromFrontend(page, {
        projectConfigId,
        operations: [
          {
            routeName: "route_set_section_edge_inputs",
            payload: {
              sectionId: sectionA,
              edgeInputParams: [aParam],
              frontendOpId: null,
            },
          },
          {
            routeName: "route_set_section_edge_inputs",
            payload: {
              sectionId: sectionB,
              edgeInputParams: [bParam1, bParam2],
              frontendOpId: null,
            },
          },
          {
            routeName: "route_set_section_edge_outputs",
            payload: {
              sectionId: sectionA,
              edgeOutputPorts: [{ id: aOutPortId, accessor: "out" }],
              frontendOpId: null,
            },
          },
          {
            routeName: "route_set_section_edge_outputs",
            payload: {
              sectionId: sectionB,
              edgeOutputPorts: [
                { id: bOutPortId1, accessor: "out_1" },
                { id: bOutPortId2, accessor: "out_2" },
              ],
              frontendOpId: null,
            },
          },
          {
            routeName: "route_create_edge",
            payload: {
              sourceSectionId: sectionA,
              sourceVariantId: aVariantId,
              sourcePortId: aOutPortId,
              targetSectionId: sectionB,
              targetVariantId: bVariantId,
              targetPortId: bParam1,
              type: "default",
            },
          },
          {
            routeName: "route_create_edge",
            payload: {
              sourceSectionId: sectionA,
              sourceVariantId: aVariantId,
              sourcePortId: aOutPortId,
              targetSectionId: sectionB,
              targetVariantId: bVariantId,
              targetPortId: bParam2,
              type: "default",
            },
          },
          {
            routeName: "route_create_edge",
            payload: {
              sourceSectionId: sectionB,
              sourceVariantId: bVariantId,
              sourcePortId: bOutPortId1,
              targetSectionId: sectionA,
              targetVariantId: aVariantId,
              targetPortId: aParam,
              type: "default",
            },
          },
          {
            routeName: "route_create_edge",
            payload: {
              sourceSectionId: sectionB,
              sourceVariantId: bVariantId,
              sourcePortId: bOutPortId2,
              targetSectionId: sectionA,
              targetVariantId: aVariantId,
              targetPortId: aParam,
              type: "default",
            },
          },
          {
            routeName: "route_create_agentic_edge",
            payload: {
              sourceSectionId: chatSection,
              targetSectionId: sectionB,
              kind: "chat_section",
            },
          },
          {
            routeName: "route_create_agentic_edge",
            payload: {
              sourceSectionId: sectionB,
              targetSectionId: chatSection,
              kind: "section_chat",
            },
          },
        ],
      });

      await expect
        .poll(
          async () =>
            page.locator("svg.react-flow__edges .react-flow__edge").count(),
          { timeout: 15000 },
        )
        .toBe(4);
      await expect
        .poll(
          async () =>
            page
              .locator(
                "svg.react-flow__agentic-edges .react-flow__agentic-edge-path",
              )
              .count(),
          { timeout: 15000 },
        )
        .toBe(2);

      const sectionBNode = page.getByTestId(`rf__node-${sectionB}`);
      await expect(sectionBNode).toBeVisible();

      const expandedInputHandles = sectionBNode.locator(
        ".react-flow__handle.arg-edge-handle.react-flow__handle-left",
      );
      const expandedOutputHandles = sectionBNode.locator(
        ".react-flow__handle.arg-edge-handle.react-flow__handle-right",
      );

      await expect(expandedInputHandles).toHaveCount(2);
      await expect(expandedOutputHandles).toHaveCount(2);

      await toggleMinimizedFromFrontend(page, {
        projectConfigId,
        sectionId: sectionB,
      });

      const search = sectionBNode.locator("search.section-search");
      await expect(search).toHaveCount(0);

      // Minimized view should hide the individual port handles, but keep edges
      // connected by routing all ports to one dot on each side.
      await expect(
        sectionBNode.locator(
          `.react-flow__handle.arg-edge-handle[data-handleid="${bParam1}"]`,
        ),
      ).toHaveCount(0);
      await expect(
        sectionBNode.locator(
          `.react-flow__handle.arg-edge-handle[data-handleid="${bParam2}"]`,
        ),
      ).toHaveCount(0);
      await expect(
        sectionBNode.locator(
          `.react-flow__handle.arg-edge-handle[data-handleid="${bOutPortId1}"]`,
        ),
      ).toHaveCount(0);
      await expect(
        sectionBNode.locator(
          `.react-flow__handle.arg-edge-handle[data-handleid="${bOutPortId2}"]`,
        ),
      ).toHaveCount(0);

      const minimizedDots = sectionBNode.locator(
        ".react-flow__handle.arg-edge-handle--minimized",
      );
      await expect(minimizedDots).toHaveCount(2);
      await expect
        .poll(
          async () =>
            page.locator("svg.react-flow__edges .react-flow__edge").count(),
          { timeout: 15000 },
        )
        .toBe(4);

      const minimizedLeftDot = sectionBNode.locator(
        ".react-flow__handle.arg-edge-handle--minimized.react-flow__handle-left",
      );
      const minimizedRightDot = sectionBNode.locator(
        ".react-flow__handle.arg-edge-handle--minimized.react-flow__handle-right",
      );
      await expect(minimizedLeftDot).toBeVisible();
      await expect(minimizedRightDot).toBeVisible();

      const agenticTarget = sectionBNode.locator(
        `.react-flow__handle[data-nodeid="${sectionB}"][data-handleid="agentic-edge-target"]`,
      );
      const agenticSource = sectionBNode.locator(
        `.react-flow__handle[data-nodeid="${sectionB}"][data-handleid="agentic-edge-source"]`,
      );
      await expect(agenticTarget).toBeVisible();
      await expect(agenticSource).toBeVisible();

      // All collapsed connection points should share a common vertical center.
      await expect
        .poll(
          async () => {
            const [leftBox, rightBox, agenticLeft, agenticRight] =
              await Promise.all([
                minimizedLeftDot.boundingBox(),
                minimizedRightDot.boundingBox(),
                agenticTarget.boundingBox(),
                agenticSource.boundingBox(),
              ]);
            if (!leftBox || !rightBox || !agenticLeft || !agenticRight) {
              return 999;
            }
            const searchCenterY = leftBox.y + leftBox.height / 2;
            const centers = [
              rightBox.y + rightBox.height / 2,
              agenticLeft.y + agenticLeft.height / 2,
              agenticRight.y + agenticRight.height / 2,
            ];
            return Math.max(...centers.map((y) => Math.abs(y - searchCenterY)));
          },
          { timeout: 3000 },
        )
        .toBeLessThanOrEqual(3);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
