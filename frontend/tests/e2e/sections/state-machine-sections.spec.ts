import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  openOverviewMoreDestination,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type CreateSectionResponse = {
  sectionId?: string;
};

type EngineConfigSummary = {
  id: string;
  engineType?: string;
};

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      stateMachineEdges?: Array<{
        id?: string;
        machineGroupId?: string;
        sourceSectionId?: string;
        sourcePortId?: string;
        targetSectionId?: string;
        targetPortId?: string;
        sourceFilter?: {
          type?: string | null;
          signalName?: string | null;
          payloadField?: string | null;
          equals?: string | null;
        } | null;
        targetAction?: {
          type?: string | null;
          promptTemplateId?: string | null;
          inlinePrompt?: string | null;
          threadStrategy?: string | null;
        } | null;
        style?: Record<string, string | number> | null;
        hidden?: boolean;
        zIndex?: number;
        selected?: boolean;
      }>;
      sectionVariantMap?: Record<string, string>;
    };
    sections?: Record<
      string,
      {
        sharedModifier?: {
          machineGroupId?: string;
          label?: string;
          maxIterations?: number | null;
          engineConfigId?: string | null;
        };
      }
    >;
    sectionVariants?: Record<
      string,
      {
        impl?: string;
        modifier?: {
          machineGroupId?: string;
          label?: string;
          maxIterations?: number | null;
          engineConfigId?: string | null;
        };
      }
    >;
    sectionImpls?: Record<
      string,
      {
        type?: string;
        machineGroupId?: string;
        label?: string;
        maxIterations?: number | null;
        engineConfigId?: string | null;
      }
    >;
  };
};

test.describe.serial("state machine sections", () => {
  test("creates workflow sections, connects workflow edges, edits workflow settings, and controls workflow runs", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: {
        StateMachineStart: "SectionConfig",
        StateMachineGate: "SectionConfig",
        StateMachineEnd: "SectionConfig",
      },
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);

    try {
      const backendOrigin =
        process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
      const startSectionId = await createSectionViaCommandPalette(
        page,
        projectContext.projectConfigId,
        "State Machine Start",
      );
      const gateSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineGate",
        { x: 520, y: 80 },
      );
      const endSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineEnd",
        { x: 1040, y: 80 },
      );
      const chatSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Chat",
        { x: 640, y: 280 },
      );
      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      const managedEngineId =
        engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
        null;
      if (!managedEngineId) {
        throw new Error("Missing managed LLM engine config.");
      }
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId: chatSectionId,
        managed: true,
        engineConfigId: managedEngineId,
        agentProfileId: null,
        transcriptionProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      await expect
        .poll(
          async () =>
            await readSectionEngineConfigId(
              page,
              projectContext.projectConfigId,
              chatSectionId,
            ),
          { timeout: 8000 },
        )
        .toBe(managedEngineId);

      const startNode = page.getByTestId(`rf__node-${startSectionId}`);
      const gateNode = page.getByTestId(`rf__node-${gateSectionId}`);
      const endNode = page.getByTestId(`rf__node-${endSectionId}`);
      const chatNode = page.getByTestId(`rf__node-${chatSectionId}`);

      await expect(startNode).toContainText("Workflow");
      await expect(startNode).toContainText("Start");
      await expect(gateNode).toContainText("Workflow");
      await expect(gateNode).toContainText("AND Gate");
      await expect(endNode).toContainText("Workflow");
      await expect(endNode).toContainText("End");
      await expect(chatNode).toBeVisible();

      await gateNode.click();
      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();
      await expect(uiEditorPane.getByLabel("Machine Group ID")).toBeVisible();
      await expect(uiEditorPane.getByLabel("Label")).toBeVisible();
      await expect(
        uiEditorPane.getByText("Gate Type", { exact: true }),
      ).toBeVisible();

      const machineGroupInput = uiEditorPane.getByLabel("Machine Group ID");
      await machineGroupInput.fill("workflow-main");
      await machineGroupInput.blur();

      const labelInput = uiEditorPane.getByLabel("Label");
      await labelInput.fill("Review Gate");
      await labelInput.blur();

      await expect(gateNode).toContainText("Review Gate");
      await expect(gateNode).toContainText("workflow-main");
      // The edited workflow metadata must stay inside the visible node shell.
      await expectNodeTextWithinBounds(gateNode, "Review Gate");
      await expectNodeTextWithinBounds(gateNode, "workflow-main");
      await expect(
        page.getByTestId(`state-machine-draft-warning-${gateSectionId}`),
      ).toBeVisible();
      await expect(gateNode.getByLabel("Agentic link target")).toHaveCount(0);
      await expect(gateNode.getByLabel("Agentic link source")).toHaveCount(0);

      await setStateMachineSectionSettings(
        page,
        projectContext.projectConfigId,
        gateSectionId,
        {
          machineGroupId: "workflow-main",
          label: "Review Gate",
          gateType: "AND",
        },
      );

      await expect
        .poll(
          async () =>
            await readStateMachineImpl(
              page,
              projectContext.projectConfigId,
              gateSectionId,
            ),
          { timeout: 8000 },
        )
        .toMatchObject({
          type: "StateMachineGate",
          machineGroupId: "workflow-main",
        });

      const gateSourceHandle = page.getByTestId(
        `workflow-source-handle-${gateSectionId}`,
      );
      const endTargetHandle = page.getByTestId(
        `workflow-target-handle-${endSectionId}`,
      );
      await gateNode.hover();
      await expect(gateSourceHandle).toBeVisible();
      await endNode.hover();
      await expect(endTargetHandle).toBeVisible();
      await dragHandleToHandle(page, gateSourceHandle, endTargetHandle);

      await expect
        .poll(
          async () =>
            await readStateMachineEdges(page, projectContext.projectConfigId),
          { timeout: 8000 },
        )
        .toHaveLength(1);
      await expect
        .poll(
          async () =>
            (await readStateMachineEdges(page, projectContext.projectConfigId)).find(
              (edge) =>
                edge.sourceSectionId === gateSectionId &&
                edge.targetSectionId === endSectionId,
            ) ?? null,
          { timeout: 8000 },
        )
        .not.toBeNull();
      await expect
        .poll(
          async () =>
            await readStateMachineImpl(
              page,
              projectContext.projectConfigId,
              endSectionId,
            ),
          { timeout: 8000 },
        )
        .toMatchObject({
          type: "StateMachineEnd",
          machineGroupId: "workflow-main",
        });
      const temporaryEdges = await readStateMachineEdges(
        page,
        projectContext.projectConfigId,
      );
      const temporaryGateToEndEdgeId = temporaryEdges.find(
        (edge) =>
          edge.sourceSectionId === gateSectionId &&
          edge.targetSectionId === endSectionId,
      )?.id;
      if (!temporaryGateToEndEdgeId) {
        throw new Error("Missing temporary gate-to-end workflow edge.");
      }
      await postBackend(page, "/deleteStateMachineEdges", {
        projectConfigId: projectContext.projectConfigId,
        edgeIds: [temporaryGateToEndEdgeId],
      });
      await expect
        .poll(
          async () =>
            await readStateMachineEdges(page, projectContext.projectConfigId),
          { timeout: 8000 },
        )
        .toHaveLength(0);

      await setStateMachineSectionSettings(
        page,
        projectContext.projectConfigId,
        startSectionId,
        {
          machineGroupId: "workflow-main",
          label: "Review Flow",
          gateType: null,
          maxIterations: null,
        },
      );
      await setStateMachineSectionSettings(
        page,
        projectContext.projectConfigId,
        endSectionId,
        {
          machineGroupId: "workflow-main",
          label: "End",
          gateType: null,
          maxIterations: null,
        },
      );

      await expect(startNode).toContainText("workflow-main");
      await expect(endNode).toContainText("workflow-main");
      await expect(
        page.getByTestId(`state-machine-draft-warning-${gateSectionId}`),
      ).toHaveCount(0);
      await expect
        .poll(
          async () =>
            await readStateMachineImpl(
              page,
              projectContext.projectConfigId,
              startSectionId,
            ),
          { timeout: 8000 },
        )
        .toMatchObject({
          type: "StateMachineStart",
          machineGroupId: "workflow-main",
          maxIterations: null,
        });
      await expect
        .poll(
          async () =>
            await readStateMachineImpl(
              page,
              projectContext.projectConfigId,
              endSectionId,
            ),
          { timeout: 8000 },
        )
        .toMatchObject({
          type: "StateMachineEnd",
          machineGroupId: "workflow-main",
        });

      await startNode.click();
      const maxIterationsInput = uiEditorPane.getByLabel("Max Iterations");
      await expect(maxIterationsInput).toBeVisible();
      await maxIterationsInput.fill("3");
      await maxIterationsInput.blur();
      await expect
        .poll(
          async () =>
            await readStateMachineImpl(
              page,
              projectContext.projectConfigId,
              startSectionId,
            ),
          { timeout: 8000 },
        )
        .toMatchObject({
          type: "StateMachineStart",
          machineGroupId: "workflow-main",
          maxIterations: 3,
        });

      const chatTargetHandle = page.getByTestId(
        `chat-shared-target-handle-${chatSectionId}`,
      );
      const chatSourceHandle = page.getByTestId(
        `chat-shared-source-handle-${chatSectionId}`,
      );

      await startNode.hover();
      await expect(
        page.getByTestId(`workflow-source-handle-${startSectionId}`),
      ).toBeVisible();
      await gateNode.hover();
      await expect(gateSourceHandle).toBeVisible();
      await chatNode.hover();
      await expect(chatTargetHandle).toBeVisible();
      await expect(chatSourceHandle).toBeVisible();
      await expect(
        page.locator(
          `.react-flow__handle[data-nodeid="${chatSectionId}"][data-handlepos="left"]:not([data-reverse-start])`,
        ),
      ).toHaveCount(1);
      await expect(
        page.locator(
          `.react-flow__handle[data-nodeid="${chatSectionId}"][data-handlepos="right"]`,
        ),
      ).toHaveCount(1);
      await endNode.hover();
      await expect(endTargetHandle).toBeVisible();
      await page.mouse.move(1, 1);
      await expect(
        page.getByTestId(`workflow-source-handle-${startSectionId}`),
      ).toBeVisible();
      await expect(page.getByTestId(`workflow-target-handle-${gateSectionId}`)).toBeVisible();
      await expect(gateSourceHandle).toBeVisible();
      await expect(endTargetHandle).toBeVisible();

      await dragHandleToHandle(
        page,
        page.getByTestId(`workflow-reverse-start-handle-${endSectionId}`),
        page.getByTestId(`chat-shared-source-handle-${chatSectionId}`),
      );

      await expect
        .poll(
          async () =>
            await readStateMachineEdges(page, projectContext.projectConfigId),
          { timeout: 8000 },
        )
        .toHaveLength(1);
      await expect
        .poll(
          async () =>
            (await readStateMachineEdges(page, projectContext.projectConfigId))[0],
          { timeout: 8000 },
        )
        .toMatchObject({
          machineGroupId: "workflow-main",
          sourceSectionId: chatSectionId,
          targetSectionId: endSectionId,
        });

      await createStateMachineEdge(page, projectContext.projectConfigId, {
        machineGroupId: "workflow-main",
        sourceSectionId: startSectionId,
        sourcePortId: "workflow-source",
        targetSectionId: gateSectionId,
        targetPortId: "workflow-target",
        sourceFilter: null,
        targetAction: null,
      });
      await createStateMachineEdge(page, projectContext.projectConfigId, {
        machineGroupId: "workflow-main",
        sourceSectionId: gateSectionId,
        sourcePortId: "workflow-source",
        targetSectionId: chatSectionId,
        targetPortId: "workflow-target",
        sourceFilter: null,
        targetAction: {
          type: "reset_thread",
          promptTemplateId: null,
          inlinePrompt: null,
          threadStrategy: "continue_current_thread",
          stopIfRunning: false,
          engineConfigId: null,
          agentProfileId: null,
          permissionMode: null,
          searchEnabled: null,
        },
      });
      await expect
        .poll(
          async () =>
            await readStateMachineEdges(page, projectContext.projectConfigId),
          { timeout: 8000 },
        )
        .toHaveLength(3);

      const edges = await readStateMachineEdges(page, projectContext.projectConfigId);
      const gateToChatEdge = edges.find(
        (edge) =>
          edge.sourceSectionId === gateSectionId &&
          edge.targetSectionId === chatSectionId,
      );
      const chatToEndEdge = edges.find(
        (edge) =>
          edge.sourceSectionId === chatSectionId &&
          edge.targetSectionId === endSectionId,
      );
      expect(gateToChatEdge?.id).toBeTruthy();
      expect(chatToEndEdge?.id).toBeTruthy();
      if (!gateToChatEdge?.id || !chatToEndEdge?.id) {
        throw new Error("Expected workflow edge ids after connecting handles.");
      }
      const gateToChatEdgeStyleBefore = await readWorkflowEdgeStyle(
        page,
        gateToChatEdge.id,
      );
      const chatToEndEdgeStyleBefore = await readWorkflowEdgeStyle(
        page,
        chatToEndEdge.id,
      );
      expect(gateToChatEdgeStyleBefore.className).not.toContain(
        "workflow-edge--reset-thread",
      );
      expect(chatToEndEdgeStyleBefore.className).not.toContain(
        "workflow-edge--signal",
      );

      await page
        .getByTestId(`workflow-edge-hitbox-${chatToEndEdge.id}`)
        .click({ force: true });
      const inspector = page.getByTestId("workflow-edge-inspector");
      await expect(inspector).toBeVisible();
      await selectComboboxOption(
        page,
        "#workflow-edge-source-filter",
        "Structured Signal",
      );
      await page.getByTestId("workflow-edge-signal-name").fill("merge_decision");
      await page
        .getByTestId("workflow-edge-signal-payload-field")
        .fill("decision");
      await page.getByTestId("workflow-edge-signal-equals").fill("retry");
      await page.getByTestId("workflow-edge-apply").click();

      await expect
        .poll(
          async () =>
            await readStateMachineEdge(
              page,
              projectContext.projectConfigId,
              chatToEndEdge.id,
            ),
          { timeout: 8000 },
        )
        .toMatchObject({
          sourceFilter: {
            type: "signal",
            signalName: "merge_decision",
            payloadField: "decision",
            equals: "retry",
          },
        });
      const chatToEndEdgeStyleAfter = await readWorkflowEdgeStyle(
        page,
        chatToEndEdge.id,
      );
      expect(chatToEndEdgeStyleAfter.className).not.toContain(
        "workflow-edge--signal",
      );
      expect(chatToEndEdgeStyleAfter.strokeDasharray).toBe(
        chatToEndEdgeStyleBefore.strokeDasharray,
      );

      await selectStateMachineEdge(
        page,
        projectContext.projectConfigId,
        gateToChatEdge.id,
      );
      await expect(inspector).toBeVisible();
      await expect(page.locator("#workflow-edge-target-action")).toBeVisible();
      await selectComboboxOption(
        page,
        "#workflow-edge-target-action",
        "Send Prompt",
      );
      await page
        .getByTestId("workflow-edge-inline-prompt")
        .fill("Review the latest output.");
      await page.getByTestId("workflow-edge-apply").click();

      await expect
        .poll(
          async () =>
            await readStateMachineEdge(
              page,
              projectContext.projectConfigId,
              gateToChatEdge.id,
            ),
          { timeout: 8000 },
        )
        .toMatchObject({
          targetAction: {
            type: "send_prompt",
            inlinePrompt: "Review the latest output.",
            threadStrategy: "continue_current_thread",
          },
        });
      const gateToChatEdgeStyleAfter = await readWorkflowEdgeStyle(
        page,
        gateToChatEdge.id,
      );
      expect(gateToChatEdgeStyleAfter.className).not.toContain(
        "workflow-edge--send-prompt",
      );
      expect(gateToChatEdgeStyleAfter.strokeDasharray).toBe(
        gateToChatEdgeStyleBefore.strokeDasharray,
      );

      const startStatus = page.getByTestId(
        `state-machine-run-status-${startSectionId}`,
      );
      const gateStatus = page.getByTestId(
        `state-machine-run-status-${gateSectionId}`,
      );
      const gateWorkflowStatus = page.getByTestId(
        `state-machine-gate-status-${gateSectionId}`,
      );
      const startActivityPanel = page.getByTestId(
        `state-machine-activity-panel-${startSectionId}`,
      );
      const gateActivityPanel = page.getByTestId(
        `state-machine-activity-panel-${gateSectionId}`,
      );
      await openOverviewMoreDestination(page, "Custom Runs");
      const workflowControlsTrigger = page.getByTestId(
        "run-instructions-accordion-workflow-controls",
      );
      await expect(workflowControlsTrigger).toBeVisible();
      await expect(workflowControlsTrigger).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      const workflowControlRow = page.getByTestId(
        `run-instructions-workflow-control-row-${startSectionId}`,
      );
      await expect(workflowControlRow).toContainText("Review Flow");
      await expect(workflowControlRow).toContainText("workflow-main");
      const overviewWorkflowStatus = page.getByTestId(
        `run-instructions-workflow-status-${startSectionId}`,
      );
      const overviewStartButton = page.getByTestId(
        `run-instructions-workflow-start-${startSectionId}`,
      );
      const overviewStopButton = page.getByTestId(
        `run-instructions-workflow-stop-${startSectionId}`,
      );
      const overviewResetButton = page.getByTestId(
        `run-instructions-workflow-reset-${startSectionId}`,
      );

      await expect(overviewWorkflowStatus).toHaveText("Idle");
      await expect(startStatus).toHaveText("Idle");
      await expect(gateStatus).toHaveText("Idle");

      await overviewStartButton.click();
      await expect(overviewWorkflowStatus).toHaveText("Running");
      await expect(startStatus).toHaveText("Running");
      await expect(gateStatus).toHaveText("Running");
      await expect(gateWorkflowStatus).toHaveText("Satisfied");
      await expect(startActivityPanel).toContainText("Dispatched 1 start action");
      await expect(gateActivityPanel).toContainText("Gate satisfied");

      await overviewStopButton.click();
      await expect(overviewWorkflowStatus).toHaveText("Stopped");
      await expect(startStatus).toHaveText("Stopped");
      await expect(gateStatus).toHaveText("Stopped");
      await expect(startActivityPanel).toContainText("Workflow stopped");

      await overviewStartButton.click();
      await expect(overviewWorkflowStatus).toHaveText("Running");
      await expect(startStatus).toHaveText("Running");
      await expect(gateStatus).toHaveText("Running");
      await expect(gateWorkflowStatus).toHaveText("Satisfied");

      await overviewResetButton.click();
      await expect(overviewWorkflowStatus).toHaveText("Idle");
      await expect(startStatus).toHaveText("Idle");
      await expect(gateStatus).toHaveText("Idle");
      await expect(startActivityPanel).toHaveCount(0);
      await expect(gateActivityPanel).toHaveCount(0);
      await expect(overviewStopButton).toBeDisabled();
      await expect(overviewResetButton).toBeDisabled();
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

async function createSectionViaCommandPalette(
  page: Page,
  projectConfigId: string,
  optionName: string,
): Promise<string> {
  const existingSectionIds = await getSectionIds(page, projectConfigId);
  const shortcut =
    process.platform === "darwin" ? "Meta+Shift+P" : "Control+Shift+P";
  const searchInput = page.locator("#ProjectPageSearchBar");

  await page.keyboard.press(shortcut);
  await expect(searchInput).toBeVisible({ timeout: 3000 });
  await searchInput.fill(optionName);

  const option = page
    .getByRole("option", { name: optionName, exact: true })
    .first();
  if (await option.isVisible({ timeout: 2500 })) {
    await option.click();
  } else {
    await page.keyboard.press("Enter");
  }

  return await waitForNewSectionId(page, projectConfigId, existingSectionIds);
}

async function createTopLevelSection(
  page: Page,
  projectConfigId: string,
  implType: "Chat" | "StateMachineGate" | "StateMachineEnd",
  position: { x: number; y: number },
): Promise<string> {
  const response = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType,
      position,
    },
  );
  if (!response?.sectionId) {
    throw new Error(`Missing sectionId when creating ${implType}.`);
  }
  return response.sectionId;
}

async function setStateMachineSectionSettings(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  payload: {
    machineGroupId: string;
    label: string;
    gateType: string | null;
    maxIterations?: number | null;
  },
): Promise<void> {
  await postBackend(page, "/setStateMachineSectionSettings", {
    projectConfigId,
    sectionId,
    machineGroupId: payload.machineGroupId,
    label: payload.label,
    gateType: payload.gateType,
    maxIterations: payload.maxIterations ?? null,
  });
}

async function createStateMachineEdge(
  page: Page,
  projectConfigId: string,
  payload: {
    machineGroupId: string;
    sourceSectionId: string;
    sourcePortId: string;
    targetSectionId: string;
    targetPortId: string;
    sourceFilter: {
      type: string;
      signalName: string | null;
      payloadField: string | null;
      equals: string | null;
    } | null;
    targetAction: {
      type: string;
      promptTemplateId: string | null;
      inlinePrompt: string | null;
      threadStrategy: string;
      stopIfRunning: boolean;
      engineConfigId: string | null;
      agentProfileId: string | null;
      permissionMode: string | null;
      searchEnabled: boolean | null;
    } | null;
  },
): Promise<void> {
  await postBackend(page, "/createStateMachineEdge", {
    projectConfigId,
    ...payload,
  });
}

async function getSectionIds(
  page: Page,
  projectConfigId: string,
): Promise<string[]> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  return Object.keys(
    response?.projectState?.projectConfig?.sectionVariantMap ?? {},
  );
}

async function waitForNewSectionId(
  page: Page,
  projectConfigId: string,
  existingSectionIds: string[],
): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 8000) {
    const currentSectionIds = await getSectionIds(page, projectConfigId);
    const newSectionIds = currentSectionIds.filter(
      (sectionId) => !existingSectionIds.includes(sectionId),
    );
    if (newSectionIds.length === 1) {
      return newSectionIds[0];
    }
    await page.waitForTimeout(100);
  }
  throw new Error("Timed out waiting for workflow section creation.");
}

async function readStateMachineImpl(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<{
  type: string | null;
  machineGroupId: string | null;
  label: string | null;
  maxIterations: number | null;
}> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const projectState = response?.projectState;
  const sectionVariantId =
    projectState?.projectConfig?.sectionVariantMap?.[sectionId];
  if (!sectionVariantId) {
    return {
      type: null,
      machineGroupId: null,
      label: null,
      maxIterations: null,
    };
  }
  const sectionImplId = projectState.sectionVariants?.[sectionVariantId]?.impl;
  if (!sectionImplId) {
    return {
      type: null,
      machineGroupId: null,
      label: null,
      maxIterations: null,
    };
  }
  const sectionVariant = projectState.sectionVariants?.[sectionVariantId];
  const sectionCore = projectState.sections?.[sectionId];
  const sectionImpl = projectState.sectionImpls?.[sectionImplId];
  return {
    type: sectionImpl?.type ?? null,
    machineGroupId:
      sectionVariant?.modifier?.machineGroupId ??
      sectionCore?.sharedModifier?.machineGroupId ??
      sectionImpl?.machineGroupId ??
      null,
    label:
      sectionVariant?.modifier?.label ??
      sectionCore?.sharedModifier?.label ??
      sectionImpl?.label ??
      null,
    maxIterations:
      sectionVariant?.modifier?.maxIterations ??
      sectionCore?.sharedModifier?.maxIterations ??
      sectionImpl?.maxIterations ??
      null,
  };
}

async function readSectionEngineConfigId(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<string | null> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const projectState = response?.projectState;
  const sectionVariantId =
    projectState?.projectConfig?.sectionVariantMap?.[sectionId];
  if (!sectionVariantId) {
    return null;
  }
  const sectionImplId = projectState.sectionVariants?.[sectionVariantId]?.impl;
  if (!sectionImplId) {
    return null;
  }
  const sectionVariant = projectState.sectionVariants?.[sectionVariantId];
  const sectionCore = projectState.sections?.[sectionId];
  return (
    sectionVariant?.modifier?.engineConfigId ??
    sectionCore?.sharedModifier?.engineConfigId ??
    projectState.sectionImpls?.[sectionImplId]?.engineConfigId ??
    null
  );
}

async function readStateMachineEdges(
  page: Page,
  projectConfigId: string,
): Promise<
  Array<{
    id: string | null;
    machineGroupId: string | null;
    sourceSectionId: string | null;
    targetSectionId: string | null;
    sourceFilter: {
      type: string | null;
      signalName: string | null;
      payloadField: string | null;
      equals: string | null;
    } | null;
    targetAction: {
      type: string | null;
      promptTemplateId: string | null;
      inlinePrompt: string | null;
      threadStrategy: string | null;
    } | null;
  }>
> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  return (response?.projectState?.projectConfig?.stateMachineEdges ?? []).map(
    (edge) => ({
      id: edge.id ?? null,
      machineGroupId: edge.machineGroupId ?? null,
      sourceSectionId: edge.sourceSectionId ?? null,
      targetSectionId: edge.targetSectionId ?? null,
      sourceFilter: edge.sourceFilter
        ? {
            type: edge.sourceFilter.type ?? null,
            signalName: edge.sourceFilter.signalName ?? null,
            payloadField: edge.sourceFilter.payloadField ?? null,
            equals: edge.sourceFilter.equals ?? null,
          }
        : null,
      targetAction: edge.targetAction
        ? {
            type: edge.targetAction.type ?? null,
            promptTemplateId: edge.targetAction.promptTemplateId ?? null,
            inlinePrompt: edge.targetAction.inlinePrompt ?? null,
            threadStrategy: edge.targetAction.threadStrategy ?? null,
          }
        : null,
    }),
  );
}

async function readWorkflowEdgeStyle(
  page: Page,
  edgeId: string,
): Promise<{ className: string; strokeDasharray: string }> {
  const path = page.locator(
    `[data-edgeid="${edgeId}"] .react-flow__state-machine-edge-path`,
  );
  await expect(path).toBeVisible();
  return path.evaluate((element) => {
    const computed = window.getComputedStyle(element);
    return {
      className: element.getAttribute("class") ?? "",
      strokeDasharray: computed.strokeDasharray,
    };
  });
}

async function readStateMachineEdge(
  page: Page,
  projectConfigId: string,
  edgeId: string,
): Promise<{
  id: string | null;
  machineGroupId: string | null;
  sourceSectionId: string | null;
  targetSectionId: string | null;
  sourceFilter: {
    type: string | null;
    signalName: string | null;
    payloadField: string | null;
    equals: string | null;
  } | null;
  targetAction: {
    type: string | null;
    promptTemplateId: string | null;
    inlinePrompt: string | null;
    threadStrategy: string | null;
  } | null;
} | null> {
  const edges = await readStateMachineEdges(page, projectConfigId);
  return edges.find((edge) => edge.id === edgeId) ?? null;
}

async function selectStateMachineEdge(
  page: Page,
  projectConfigId: string,
  edgeId: string,
): Promise<void> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const rawEdges = response?.projectState?.projectConfig?.stateMachineEdges ?? [];
  await postBackend(page, "/setStateMachineEdges", {
    projectConfigId,
    edges: rawEdges.map((edge) => ({
      ...edge,
      selected: edge.id === edgeId,
    })),
  });
}

async function selectComboboxOption(
  page: Page,
  inputSelector: string,
  optionName: string,
): Promise<void> {
  const input = page.locator(inputSelector);
  await input.click();
  await input.fill(optionName);
  await page.getByText(optionName, { exact: true }).click();
}

async function expectNodeTextWithinBounds(
  node: Locator,
  expectedText: string,
): Promise<void> {
  const bounds = await node.evaluate((element, text) => {
    const nodeRect = element.getBoundingClientRect();
    const target = Array.from(element.querySelectorAll("*")).find(
      (candidate) => candidate.textContent?.trim() === text,
    );
    if (!target) {
      return null;
    }
    const targetRect = target.getBoundingClientRect();
    return {
      nodeTop: nodeRect.top,
      nodeBottom: nodeRect.bottom,
      nodeLeft: nodeRect.left,
      nodeRight: nodeRect.right,
      targetTop: targetRect.top,
      targetBottom: targetRect.bottom,
      targetLeft: targetRect.left,
      targetRight: targetRect.right,
    };
  }, expectedText);
  expect(bounds).not.toBeNull();
  if (bounds === null) {
    return;
  }
  expect(bounds.targetTop).toBeGreaterThanOrEqual(bounds.nodeTop);
  expect(bounds.targetBottom).toBeLessThanOrEqual(bounds.nodeBottom);
  expect(bounds.targetLeft).toBeGreaterThanOrEqual(bounds.nodeLeft);
  expect(bounds.targetRight).toBeLessThanOrEqual(bounds.nodeRight);
}

async function dragHandleToHandle(
  page: Page,
  dragStartHandle: Locator,
  dragEndHandle: Locator,
): Promise<void> {
  const dragStartNodeId = await getHandleNodeId(dragStartHandle);
  const dragStartNode = page.getByTestId(`rf__node-${dragStartNodeId}`);

  await dragStartNode.hover();
  await expect(dragStartHandle).toBeVisible();

  const dragStartBox = await dragStartHandle.boundingBox();
  if (!dragStartBox) {
    throw new Error("Unable to resolve drag start handle bounds.");
  }
  await page.mouse.move(
    dragStartBox.x + dragStartBox.width / 2,
    dragStartBox.y + dragStartBox.height / 2,
  );
  await page.mouse.down();

  await expect(dragEndHandle).toBeVisible();
  const dragEndBox = await dragEndHandle.boundingBox();
  if (!dragEndBox) {
    throw new Error("Unable to resolve drag end handle bounds.");
  }
  await page.mouse.move(
    dragEndBox.x + dragEndBox.width / 2,
    dragEndBox.y + dragEndBox.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
}

async function getHandleNodeId(handle: Locator): Promise<string> {
  const nodeId = await handle.getAttribute("data-nodeid");
  if (!nodeId) {
    throw new Error("Missing data-nodeid on edge handle.");
  }
  return nodeId;
}
