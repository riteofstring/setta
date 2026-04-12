import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  getViewportBoundsForPlacement,
  loadProjectConfig,
  openIsolatedProject,
  postBackend,
} from "../helpers";

type CreateSectionResponse = { sectionId?: string };

async function createChatSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }
  const response = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Chat",
      viewportBounds,
    },
  );
  const sectionId = response?.sectionId ?? null;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating chat section.");
  }
  return sectionId;
}

async function setCallable(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  callableName: string,
): Promise<void> {
  await postBackend(page, "/setCallable", {
    projectConfigId,
    sectionId,
    callableName,
    refetchParams: true,
  });
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
      const chatSection = await createChatSection(page, projectConfigId);

      await setCallable(page, projectConfigId, sectionA, "sorted");
      await setCallable(page, projectConfigId, sectionB, "sorted");

      const [aParam] = await getParamIds(page, sectionA, 1);
      const [bParam] = await getParamIds(page, sectionB, 1);

      await postBackend(page, "/setSectionEdgeInputs", {
        projectConfigId,
        sectionId: sectionB,
        edgeInputParams: [bParam],
      });
      const aOutPortId = "pw-a-out";
      await postBackend(page, "/setSectionEdgeOutputs", {
        projectConfigId,
        sectionId: sectionA,
        edgeOutputPorts: [{ id: aOutPortId, accessor: "out" }],
      });

      const config = await loadProjectConfig(page);
      const aVariantId =
        config.projectConfig.sectionVariantMap[sectionA] ?? null;
      const bVariantId =
        config.projectConfig.sectionVariantMap[sectionB] ?? null;
      if (!aVariantId || !bVariantId) {
        throw new Error("Missing section variant ids for edge creation.");
      }

      await postBackend(page, "/createEdge", {
        projectConfigId,
        sourceSectionId: sectionA,
        sourceVariantId: aVariantId,
        sourcePortId: aOutPortId,
        targetSectionId: sectionB,
        targetVariantId: bVariantId,
        targetPortId: bParam,
        type: "default",
      });
      await postBackend(page, "/createAgenticEdge", {
        projectConfigId,
        sourceSectionId: chatSection,
        targetSectionId: sectionB,
        kind: "chat_section",
      });

      await page.getByRole("button", { name: "fit view" }).click();

      const reactFlowRoot = page.locator(".react-flow");
      await expect(reactFlowRoot).toHaveAttribute(
        "data-show-agentic-edges",
        "true",
      );
      await expect(reactFlowRoot).toHaveAttribute("data-show-arg-edges", "true");

      const argHandle = page.locator(
        `.react-flow__handle.arg-edge-handle[data-nodeid="${sectionB}"]`,
      );
      await expect(argHandle.first()).toBeVisible();

      const agenticHandle = page.locator(
        `.react-flow__handle.agentic-handle--connected[data-nodeid="${sectionB}"]`,
      );
      await expect(agenticHandle.first()).toBeVisible();

      const agenticEdges = page.locator("svg.react-flow__agentic-edges");
      const argEdges = page.locator("svg.react-flow__edges");
      await expect(agenticEdges).toBeVisible();
      await expect(argEdges).toBeVisible();

      await page.getByTestId("rf__toggle-agentic-edges").click();
      await expect(reactFlowRoot).toHaveAttribute(
        "data-show-agentic-edges",
        "false",
      );
      await expect(agenticEdges).toBeHidden();
      await expect(agenticHandle.first()).toBeHidden();

      await page.getByTestId("rf__toggle-agentic-edges").click();
      await expect(reactFlowRoot).toHaveAttribute(
        "data-show-agentic-edges",
        "true",
      );
      await expect(agenticEdges).toBeVisible();
      await expect(agenticHandle.first()).toBeVisible();

      await page.getByTestId("rf__toggle-arg-edges").click();
      await expect(reactFlowRoot).toHaveAttribute("data-show-arg-edges", "false");
      await expect(argEdges).toBeHidden();
      await expect(argHandle.first()).toBeHidden();

      await page.getByTestId("rf__toggle-arg-edges").click();
      await expect(reactFlowRoot).toHaveAttribute("data-show-arg-edges", "true");
      await expect(argEdges).toBeVisible();
      await expect(argHandle.first()).toBeVisible();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

