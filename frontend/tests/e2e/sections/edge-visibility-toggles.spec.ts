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

test.describe.serial("edge visibility toggles", () => {
  test("toggles agentic + arg connectors/wires from the controls rail", async ({
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
        "__pw_edge_visibility_chat__",
      );

      await setCallable(page, projectConfigId, sectionA, TARGET_CALLABLE);
      await setCallable(page, projectConfigId, sectionB, TARGET_CALLABLE);

      const [aParam] = await getParamIds(page, sectionA, 1);
      const [bParam] = await getParamIds(page, sectionB, 1);

      const aOutPortId = "pw-a-out";

      const config = await loadProjectConfig(page);
      const aVariantId =
        config.projectConfig.sectionVariantMap[sectionA] ?? null;
      const bVariantId =
        config.projectConfig.sectionVariantMap[sectionB] ?? null;
      if (!aVariantId || !bVariantId) {
        throw new Error("Missing section variant ids for edge creation.");
      }

      await applyProjectMutationsFromFrontend(page, {
        projectConfigId,
        operations: [
          {
            operationName: "setSectionEdgeInputs",
            body: {
              sectionId: sectionB,
              edgeInputParams: [bParam],
              frontendOpId: null,
            },
          },
          {
            operationName: "setSectionEdgeOutputs",
            body: {
              sectionId: sectionA,
              edgeOutputPorts: [{ id: aOutPortId, accessor: "out" }],
              frontendOpId: null,
            },
          },
          {
            operationName: "createEdge",
            body: {
              sourceSectionId: sectionA,
              sourceVariantId: aVariantId,
              sourcePortId: aOutPortId,
              targetSectionId: sectionB,
              targetVariantId: bVariantId,
              targetPortId: bParam,
              type: "default",
            },
          },
          {
            operationName: "createAgenticEdge",
            body: {
              sourceSectionId: chatSection,
              targetSectionId: sectionB,
              kind: "chat_section",
            },
          },
        ],
      });

      await page.getByRole("button", { name: "fit view" }).click();

      const gpuFlowRoot = page.locator(".setta-gpu-flow-root");
      await expect(gpuFlowRoot).toHaveAttribute(
        "data-show-agentic-edges",
        "true",
      );
      await expect(gpuFlowRoot).toHaveAttribute("data-show-arg-edges", "true");

      const argHandle = page.locator(
        `.setta-gpu-flow__handle.arg-edge-handle[data-nodeid="${sectionB}"]`,
      );
      await expect(argHandle.first()).toBeVisible();

      const agenticHandle = page.locator(
        `.setta-gpu-flow__handle.agentic-handle--connected[data-nodeid="${sectionB}"]`,
      );
      await expect(agenticHandle.first()).toBeVisible();

      const agenticEdges = page.locator("svg.setta-gpu-flow__agentic-edges");
      const argEdges = page.locator("svg.setta-gpu-flow__edges");
      await expect(agenticEdges).toBeVisible();
      await expect(argEdges).toBeVisible();

      await page.getByTestId("rf__toggle-agentic-edges").click();
      await expect(gpuFlowRoot).toHaveAttribute(
        "data-show-agentic-edges",
        "false",
      );
      await expect(agenticEdges).toBeHidden();
      await expect(agenticHandle.first()).toBeHidden();

      await page.getByTestId("rf__toggle-agentic-edges").click();
      await expect(gpuFlowRoot).toHaveAttribute(
        "data-show-agentic-edges",
        "true",
      );
      await expect(agenticEdges).toBeVisible();
      await expect(agenticHandle.first()).toBeVisible();

      await page.getByTestId("rf__toggle-arg-edges").click();
      await expect(gpuFlowRoot).toHaveAttribute("data-show-arg-edges", "false");
      await expect(argEdges).toBeHidden();
      await expect(argHandle.first()).toBeHidden();

      await page.getByTestId("rf__toggle-arg-edges").click();
      await expect(gpuFlowRoot).toHaveAttribute("data-show-arg-edges", "true");
      await expect(argEdges).toBeVisible();
      await expect(argHandle.first()).toBeVisible();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
