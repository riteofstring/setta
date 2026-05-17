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
type GpuFlowFrameProbeWindow = Window & {
  __settaGpuFlowFrameProbeRecords?: Array<{
    drawnEdgeCount: number;
    frame: number;
  }>;
  __settaGpuFlowPerformanceProbe?: {
    recordNodeLayerFrame?: (event: unknown) => void;
  };
};

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
  await expect(sectionNode).toBeVisible();
  const readParamIds = async () => {
    return page.evaluate((sectionId) => {
      return import("/src/state/definitions.ts").then(({ useProjectState }) => {
        const state = useProjectState.getState();
        const variantId = state.projectConfig.sectionVariantMap[sectionId];
        const shown = variantId ? state.shownParamIds[variantId] : undefined;
        const shownParamIds = [
          ...(shown?.unpinned?.topLevelParamIds ?? []),
          ...(shown?.pinned?.topLevelParamIds ?? []),
        ];
        if (shownParamIds.length > 0) {
          return shownParamIds;
        }
        const implId = variantId
          ? state.sectionVariants[variantId]?.impl
          : undefined;
        const impl = implId ? state.sectionImpls[implId] : undefined;
        return Object.keys(impl?.codeObjVariantMap ?? {});
      });
    }, sectionId);
  };
  await expect
    .poll(async () => (await readParamIds()).length, { timeout: 20000 })
    .toBeGreaterThanOrEqual(minCount);
  return await readParamIds();
}

async function installGpuFlowFrameProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const view = window as GpuFlowFrameProbeWindow;
    view.__settaGpuFlowFrameProbeRecords = [];
    view.__settaGpuFlowPerformanceProbe = {
      recordNodeLayerFrame(event: unknown) {
        if (
          !event ||
          typeof event !== "object" ||
          typeof (event as { drawnEdgeCount?: unknown }).drawnEdgeCount !==
            "number" ||
          typeof (event as { frame?: unknown }).frame !== "number"
        ) {
          return;
        }
        const records = view.__settaGpuFlowFrameProbeRecords ?? [];
        records.push({
          drawnEdgeCount: (event as { drawnEdgeCount: number }).drawnEdgeCount,
          frame: (event as { frame: number }).frame,
        });
        if (records.length > 120) {
          records.splice(0, records.length - 120);
        }
        view.__settaGpuFlowFrameProbeRecords = records;
      },
    };
  });
}

async function waitForDrawnEdgeCount(
  page: Page,
  expected: number,
): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const records = (window as GpuFlowFrameProbeWindow)
            .__settaGpuFlowFrameProbeRecords;
          return records?.at(-1)?.drawnEdgeCount ?? -1;
        }),
      { timeout: 15000 },
    )
    .toBe(expected);
}

test.describe.serial("edge visibility toggles", () => {
  test("toggles agentic + arg connectors/wires from the controls rail", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    await installGpuFlowFrameProbe(page);

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

      await page
        .getByRole("button", { name: "fit view" })
        .click({ force: true });

      const gpuFlowRoot = page.locator(".setta-gpu-flow-root");
      await expect(gpuFlowRoot).toHaveAttribute(
        "data-show-agentic-edges",
        "true",
      );
      await expect(gpuFlowRoot).toHaveAttribute("data-show-arg-edges", "true");

      const agenticHandle = page.locator(
        `.setta-gpu-flow__handle.agentic-handle--connected[data-nodeid="${sectionB}"]`,
      );
      await expect(agenticHandle.first()).toBeVisible();

      await waitForDrawnEdgeCount(page, 2);

      await page.getByTestId("rf__toggle-agentic-edges").click();
      await expect(gpuFlowRoot).toHaveAttribute(
        "data-show-agentic-edges",
        "false",
      );
      await expect(agenticHandle.first()).toBeHidden();
      await waitForDrawnEdgeCount(page, 1);

      await page.getByTestId("rf__toggle-agentic-edges").click();
      await expect(gpuFlowRoot).toHaveAttribute(
        "data-show-agentic-edges",
        "true",
      );
      await expect(agenticHandle.first()).toBeVisible();
      await waitForDrawnEdgeCount(page, 2);

      await page.getByTestId("rf__toggle-arg-edges").click();
      await expect(gpuFlowRoot).toHaveAttribute("data-show-arg-edges", "false");
      await waitForDrawnEdgeCount(page, 1);

      await page.getByTestId("rf__toggle-arg-edges").click();
      await expect(gpuFlowRoot).toHaveAttribute("data-show-arg-edges", "true");
      await waitForDrawnEdgeCount(page, 2);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
