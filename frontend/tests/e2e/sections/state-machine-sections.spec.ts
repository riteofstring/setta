import { expect, test, type Locator, type Page } from "@playwright/test";
import * as http from "node:http";
import {
  applyProjectMutationsFromFrontend,
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  openOverviewMoreDestination,
  postBackend,
  seedLocalStorage,
  setSectionNameFromFrontend,
} from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const FRONTEND_ORIGIN = new URL(BASE_URL).origin;
const FRONTEND_REFERER = `${FRONTEND_ORIGIN}/`;
const BACKEND_HELPER_REQUEST_HEADERS = {
  Origin: FRONTEND_ORIGIN,
  Referer: FRONTEND_REFERER,
};

type CreateSectionResponse = {
  sectionId?: string;
};

type EngineConfigSummary = {
  id: string;
  engineType?: string;
  settaLlmConfigId?: string | null;
};

type LLMConfigEntry = {
  model: string;
  provider?: string | null;
  api_key_env?: string | null;
  base_url?: string | null;
  other_params?: Record<string, unknown> | null;
  mcpServerIds?: string[] | null;
  temporary?: boolean;
};

type LLMConfigPayload = {
  configs: Record<string, LLMConfigEntry>;
  mcpServers: Record<string, unknown>;
  defaultMcpServerIds?: string[];
  default_config_id?: string | null;
  codexMcpImportedAt?: string | null;
};

type ManagedAPIKeysSnapshot = {
  apiKeys: Record<string, string>;
  revision: number;
  corrupt?: boolean;
  errorCode?: string | null;
  message?: string | null;
};

type ManagedChatProviderRequest = {
  path: string;
  authorization: string;
  body: Record<string, unknown>;
};

type ManagedChatProviderServer = {
  origin: string;
  requests: ManagedChatProviderRequest[];
  close: () => Promise<void>;
};

const MANAGED_CHAT_PROVIDER_RESPONSE_DELAY_MS = 3000;

type DeterministicManagedChatEngine = {
  engineConfigId: string;
  providerServer: ManagedChatProviderServer;
  cleanup: () => Promise<void>;
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
        sourceActivationCountCondition?: {
          operator?: string | null;
          value?: number | null;
        } | null;
        targetAction?: {
          type?: string | null;
          promptTemplateId?: string | null;
          promptSectionId?: string | null;
          inlinePrompt?: string | null;
          promptInputs?: Record<string, string> | null;
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

type WorkflowRunRecord = {
  id?: string;
  status?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  outputs?: Record<string, unknown> | null;
  inputs?: {
    runType?: string;
    projectConfigId?: string;
    machineGroupId?: string;
  } | null;
  events?: Array<{
    type?: string;
    timestamp?: string | null;
    payload?: Record<string, unknown>;
  }>;
  [key: string]: unknown;
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
    const managedEngine = await ensureDeterministicManagedChatEngine(page);

    try {
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
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId: chatSectionId,
        managed: true,
        engineConfigId: managedEngine.engineConfigId,
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
        .toBe(managedEngine.engineConfigId);

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
            (
              await readStateMachineEdges(page, projectContext.projectConfigId)
            ).find(
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
      await deleteStateMachineEdgesFromFrontend(
        page,
        projectContext.projectConfigId,
        [temporaryGateToEndEdgeId],
      );
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
      // Start + Gate without any End in the machine group must still show the
      // draft warning. Gates are not valid End nodes.
      await expect(
        page.getByTestId(`state-machine-draft-warning-${gateSectionId}`),
      ).toBeVisible();
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
      ).toBeVisible();
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
          `.setta-gpu-flow__handle[data-nodeid="${chatSectionId}"][data-handlepos="left"]:not([data-reverse-start])`,
        ),
      ).toHaveCount(1);
      await expect(
        page.locator(
          `.setta-gpu-flow__handle[data-nodeid="${chatSectionId}"][data-handlepos="right"]`,
        ),
      ).toHaveCount(1);
      await endNode.hover();
      await expect(endTargetHandle).toBeVisible();
      await page.mouse.move(1, 1);
      await expect(
        page.getByTestId(`workflow-source-handle-${startSectionId}`),
      ).toBeVisible();
      await expect(
        page.getByTestId(`workflow-target-handle-${gateSectionId}`),
      ).toBeVisible();
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
            (
              await readStateMachineEdges(page, projectContext.projectConfigId)
            )[0],
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

      const edges = await readStateMachineEdges(
        page,
        projectContext.projectConfigId,
      );
      const startToGateEdge = edges.find(
        (edge) =>
          edge.sourceSectionId === startSectionId &&
          edge.targetSectionId === gateSectionId,
      );
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
      expect(startToGateEdge?.id).toBeTruthy();
      expect(gateToChatEdge?.id).toBeTruthy();
      expect(chatToEndEdge?.id).toBeTruthy();
      if (!startToGateEdge?.id || !gateToChatEdge?.id || !chatToEndEdge?.id) {
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

      await selectStateMachineEdge(page, chatToEndEdge.id);
      const inspector = page.getByTestId("workflow-edge-inspector");
      await expect(inspector).toBeVisible();
      await selectComboboxOption(
        page,
        "#workflow-edge-source-filter",
        "Structured Signal",
      );
      await page
        .getByTestId("workflow-edge-signal-name")
        .fill("merge_decision");
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

      await selectStateMachineEdge(page, gateToChatEdge.id);
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
      const currentWorkflowEdgeIds = (
        await readStateMachineEdges(page, projectContext.projectConfigId)
      )
        .map((edge) => edge.id)
        .filter((edgeId): edgeId is string => edgeId !== null);
      await deleteStateMachineEdgesFromFrontend(
        page,
        projectContext.projectConfigId,
        currentWorkflowEdgeIds,
      );
      await expect
        .poll(
          async () =>
            await readStateMachineEdges(page, projectContext.projectConfigId),
          { timeout: 8000 },
        )
        .toHaveLength(0);
      await createStateMachineEdge(page, projectContext.projectConfigId, {
        machineGroupId: "workflow-main",
        sourceSectionId: startSectionId,
        sourcePortId: "workflow-source",
        targetSectionId: chatSectionId,
        targetPortId: "workflow-target",
        sourceFilter: null,
        targetAction: {
          type: "send_prompt",
          promptTemplateId: null,
          inlinePrompt: "Review the latest output.",
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
        .toHaveLength(1);

      const startStatus = page.getByTestId(
        `state-machine-run-status-${startSectionId}`,
      );
      const startActivityPanel = page.getByTestId(
        `state-machine-activity-panel-${startSectionId}`,
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
      const overviewWorkflowStatus = page.locator(
        `[data-testid="run-instructions-workflow-status-${startSectionId}"]:visible`,
      );
      const overviewStartButton = page.locator(
        `[data-testid="run-instructions-workflow-start-${startSectionId}"]:visible`,
      );
      const overviewStopButton = page.locator(
        `[data-testid="run-instructions-workflow-stop-${startSectionId}"]:visible`,
      );
      const overviewResetButton = page.locator(
        `[data-testid="run-instructions-workflow-reset-${startSectionId}"]:visible`,
      );

      await expect(overviewWorkflowStatus).toHaveText("Idle");
      await expect(startStatus).toHaveText("Idle");

      await overviewStartButton.click();
      await expect
        .poll(() => managedEngine.providerServer.requests.length, {
          timeout: 8000,
        })
        .toBe(1);
      expect(managedEngine.providerServer.requests[0]?.path).toBe(
        "/v1/chat/completions",
      );
      expect(managedEngine.providerServer.requests[0]?.authorization).toBe(
        "Bearer e2e-workflow-secret",
      );
      await expect(overviewWorkflowStatus).toHaveText("Running");
      await expect(startStatus).toHaveText("Running");
      await expect(overviewStopButton).toBeEnabled();
      await expect(startActivityPanel).toContainText(
        "Dispatched 1 start action",
      );

      await overviewStopButton.click();
      await expect(overviewWorkflowStatus).toHaveText("Stopped");
      await expect(startStatus).toHaveText("Stopped");
      await expect(startActivityPanel).toContainText("Workflow stopped");

      await expect(overviewStartButton).toBeEnabled();
      await overviewStartButton.click();
      await expect(overviewWorkflowStatus).toHaveText("Running");
      await expect(startStatus).toHaveText("Running");

      await expect(overviewResetButton).toBeEnabled();
      await overviewResetButton.click();
      await expect(overviewWorkflowStatus).toHaveText("Idle");
      await expect(startStatus).toHaveText("Idle");
      await expect(startActivityPanel).toHaveCount(0);
      await expect(overviewStopButton).toBeDisabled();
      await expect(overviewResetButton).toBeDisabled();
    } finally {
      await managedEngine.cleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("warns when a workflow can never reach End and clears after a Send Prompt fix", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const startSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineStart",
        { x: 80, y: 120 },
      );
      const chatSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Chat",
        { x: 440, y: 120 },
      );
      const endSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineEnd",
        { x: 800, y: 120 },
      );

      await setStateMachineSectionSettings(
        page,
        projectContext.projectConfigId,
        startSectionId,
        {
          machineGroupId: "workflow-main",
          label: "Validation Flow",
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
          label: "Done",
          gateType: null,
          maxIterations: null,
        },
      );

      await createStateMachineEdge(page, projectContext.projectConfigId, {
        machineGroupId: "workflow-main",
        sourceSectionId: startSectionId,
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
      await createStateMachineEdge(page, projectContext.projectConfigId, {
        machineGroupId: "workflow-main",
        sourceSectionId: chatSectionId,
        sourcePortId: "workflow-source",
        targetSectionId: endSectionId,
        targetPortId: "workflow-target",
        sourceFilter: {
          type: "run_completed",
          signalName: null,
          payloadField: null,
          equals: null,
        },
        targetAction: null,
      });

      const startWarning = page.getByTestId(
        `state-machine-draft-warning-${startSectionId}`,
      );
      await expect(startWarning).toBeVisible();

      const edgesBeforeFix = await readStateMachineEdges(
        page,
        projectContext.projectConfigId,
      );
      const startToChatEdgeId = edgesBeforeFix.find(
        (edge) =>
          edge.sourceSectionId === startSectionId &&
          edge.targetSectionId === chatSectionId,
      )?.id;
      if (!startToChatEdgeId) {
        throw new Error(
          "Missing start-to-chat workflow edge for validation test.",
        );
      }

      await deleteStateMachineEdgesFromFrontend(
        page,
        projectContext.projectConfigId,
        [startToChatEdgeId],
      );
      await createStateMachineEdge(page, projectContext.projectConfigId, {
        machineGroupId: "workflow-main",
        sourceSectionId: startSectionId,
        sourcePortId: "workflow-source",
        targetSectionId: chatSectionId,
        targetPortId: "workflow-target",
        sourceFilter: null,
        targetAction: {
          type: "send_prompt",
          promptTemplateId: null,
          inlinePrompt: "Review this branch.",
          threadStrategy: "new_thread_before_send",
          stopIfRunning: false,
          engineConfigId: null,
          agentProfileId: null,
          permissionMode: null,
          searchEnabled: null,
        },
      });

      await expect(startWarning).toHaveCount(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("edits a workflow send-prompt edge to use a prompt section with bindings", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const startSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineStart",
        { x: 80, y: 120 },
      );
      const chatSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Chat",
        { x: 440, y: 120 },
      );
      const promptSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Prompt",
        { x: 440, y: 320 },
      );

      await setStateMachineSectionSettings(
        page,
        projectContext.projectConfigId,
        startSectionId,
        {
          machineGroupId: "workflow-prompt-section",
          label: "Prompt Flow",
          gateType: null,
          maxIterations: null,
        },
      );
      await setSectionNameFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId: promptSectionId,
        name: "Greeting Prompt",
      });
      await setPromptTemplateFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId: promptSectionId,
        template: "Hi my name is {{ name }}. What's your name?",
      });

      await createStateMachineEdge(page, projectContext.projectConfigId, {
        machineGroupId: "workflow-prompt-section",
        sourceSectionId: startSectionId,
        sourcePortId: "workflow-source",
        targetSectionId: chatSectionId,
        targetPortId: "workflow-target",
        sourceFilter: null,
        targetAction: {
          type: "reset_thread",
          promptTemplateId: null,
          promptSectionId: null,
          inlinePrompt: null,
          promptInputs: {},
          threadStrategy: "continue_current_thread",
          stopIfRunning: false,
          engineConfigId: null,
          agentProfileId: null,
          permissionMode: null,
          searchEnabled: null,
        },
      });

      const edges = await readStateMachineEdges(
        page,
        projectContext.projectConfigId,
      );
      const startToChatEdgeId = edges.find(
        (edge) =>
          edge.sourceSectionId === startSectionId &&
          edge.targetSectionId === chatSectionId,
      )?.id;
      if (!startToChatEdgeId) {
        throw new Error("Missing start-to-chat workflow edge.");
      }

      await selectStateMachineEdge(page, startToChatEdgeId);
      const inspector = page.getByTestId("workflow-edge-inspector");
      await expect(inspector).toBeVisible();

      await selectComboboxOption(
        page,
        "#workflow-edge-target-action",
        "Send Prompt",
      );
      await selectComboboxOption(
        page,
        "#workflow-edge-prompt-source",
        "Prompt Section",
      );
      await selectComboboxOption(
        page,
        "#workflow-edge-prompt-section",
        "Greeting Prompt",
      );
      await page
        .getByTestId("workflow-edge-prompt-inputs")
        .fill('{\n  "name": "Kevin"\n}');
      await page.getByTestId("workflow-edge-apply").click();

      await expect
        .poll(
          async () =>
            await readStateMachineEdge(
              page,
              projectContext.projectConfigId,
              startToChatEdgeId,
            ),
          { timeout: 8000 },
        )
        .toMatchObject({
          targetAction: {
            type: "send_prompt",
            promptTemplateId: null,
            promptSectionId,
            inlinePrompt: null,
            promptInputs: {
              name: "Kevin",
            },
            threadStrategy: "continue_current_thread",
          },
        });
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("edits a workflow edge to use a zero-indexed source activation condition", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const startSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineStart",
        { x: 80, y: 120 },
      );
      const gateSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineGate",
        { x: 420, y: 120 },
      );
      const endSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineEnd",
        { x: 760, y: 120 },
      );

      await setStateMachineSectionSettings(
        page,
        projectContext.projectConfigId,
        startSectionId,
        {
          machineGroupId: "workflow-source-count-condition",
          label: "Loop Start",
          gateType: null,
          maxIterations: null,
        },
      );
      await setStateMachineSectionSettings(
        page,
        projectContext.projectConfigId,
        gateSectionId,
        {
          machineGroupId: "workflow-source-count-condition",
          label: "Loop Gate",
          gateType: "AND",
          maxIterations: null,
        },
      );
      await setStateMachineSectionSettings(
        page,
        projectContext.projectConfigId,
        endSectionId,
        {
          machineGroupId: "workflow-source-count-condition",
          label: "Done",
          gateType: null,
          maxIterations: null,
        },
      );

      await createStateMachineEdge(page, projectContext.projectConfigId, {
        machineGroupId: "workflow-source-count-condition",
        sourceSectionId: startSectionId,
        sourcePortId: "workflow-source",
        targetSectionId: gateSectionId,
        targetPortId: "workflow-target",
        sourceFilter: null,
        sourceActivationCountCondition: null,
        targetAction: null,
      });
      await createStateMachineEdge(page, projectContext.projectConfigId, {
        machineGroupId: "workflow-source-count-condition",
        sourceSectionId: gateSectionId,
        sourcePortId: "workflow-source",
        targetSectionId: endSectionId,
        targetPortId: "workflow-target",
        sourceFilter: null,
        sourceActivationCountCondition: null,
        targetAction: null,
      });

      const edges = await readStateMachineEdges(
        page,
        projectContext.projectConfigId,
      );
      const gateToEndEdgeId = edges.find(
        (edge) =>
          edge.sourceSectionId === gateSectionId &&
          edge.targetSectionId === endSectionId,
      )?.id;
      if (!gateToEndEdgeId) {
        throw new Error("Missing gate-to-end workflow edge.");
      }

      await selectStateMachineEdge(page, gateToEndEdgeId);
      const inspector = page.getByTestId("workflow-edge-inspector");
      await expect(inspector).toBeVisible();

      const sourceActivationConditionToggle = inspector.getByTestId(
        "workflow-edge-enable-source-activation-condition",
      );
      await sourceActivationConditionToggle.scrollIntoViewIfNeeded();
      await inspector
        .getByText("Limit this edge by source activation count (0-indexed)")
        .click();
      await selectComboboxOption(
        page,
        "#workflow-edge-source-activation-operator",
        ">=",
      );
      await inspector
        .getByTestId("workflow-edge-source-activation-value")
        .fill("2");
      await inspector.getByTestId("workflow-edge-apply").click();

      await expect
        .poll(
          async () =>
            await readStateMachineEdge(
              page,
              projectContext.projectConfigId,
              gateToEndEdgeId,
            ),
          { timeout: 8000 },
        )
        .toMatchObject({
          sourceActivationCountCondition: {
            operator: "gte",
            value: 2,
          },
        });

      const badge = page.getByTestId(
        `workflow-edge-source-activation-badge-${gateToEndEdgeId}`,
      );
      await expect(badge).toBeVisible();
      await expect(badge).toContainText("src count >= 2");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("refreshes running workflow rows through getStateMachineRun when agent runs stay stale", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
    });

    let workflowRefreshRequestCount = 0;
    await page.route("**/api/getAgentRuns", async (route) => {
      const response = await route.fetch();
      const runs = (await response.json()) as WorkflowRunRecord[];
      const staleRuns = runs.map((run) => {
        if (
          run.inputs?.runType !== "state_machine" ||
          run.inputs.machineGroupId !== "workflow-refresh"
        ) {
          return run;
        }
        return {
          ...run,
          status: "running",
          finishedAt: null,
          events:
            run.events?.filter((event) => event.type !== "run_completed") ?? [],
        };
      });
      await route.fulfill({
        status: response.status(),
        headers: {
          ...response.headers(),
          "content-type": "application/json",
        },
        body: JSON.stringify(staleRuns),
      });
    });
    await page.route("**/api/getStateMachineRun", async (route) => {
      const payload = route.request().postDataJSON() as
        | { machineGroupId?: string }
        | undefined;
      if (payload?.machineGroupId === "workflow-refresh") {
        workflowRefreshRequestCount += 1;
      }
      await route.continue();
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const startSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineStart",
        { x: 80, y: 120 },
      );
      const endSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineEnd",
        { x: 480, y: 120 },
      );

      await setStateMachineSectionSettings(
        page,
        projectContext.projectConfigId,
        startSectionId,
        {
          machineGroupId: "workflow-refresh",
          label: "Refresh Flow",
          gateType: null,
          maxIterations: null,
        },
      );
      await setStateMachineSectionSettings(
        page,
        projectContext.projectConfigId,
        endSectionId,
        {
          machineGroupId: "workflow-refresh",
          label: "Done",
          gateType: null,
          maxIterations: null,
        },
      );
      await createStateMachineEdge(page, projectContext.projectConfigId, {
        machineGroupId: "workflow-refresh",
        sourceSectionId: startSectionId,
        sourcePortId: "workflow-source",
        targetSectionId: endSectionId,
        targetPortId: "workflow-target",
        sourceFilter: null,
        targetAction: null,
      });

      await openOverviewMoreDestination(page, "Custom Runs");
      const overviewWorkflowStatus = page.getByTestId(
        `run-instructions-workflow-status-${startSectionId}`,
      );
      const overviewStartButton = page.getByTestId(
        `run-instructions-workflow-start-${startSectionId}`,
      );
      const startNodeStatus = page.getByTestId(
        `state-machine-run-status-${startSectionId}`,
      );

      await expect(overviewWorkflowStatus).toHaveText("Idle");
      await overviewStartButton.click();

      await expect
        .poll(() => workflowRefreshRequestCount, { timeout: 15000 })
        .toBeGreaterThan(0);
      await expect(overviewWorkflowStatus).toHaveText("Completed");
      await expect(startNodeStatus).toHaveText("Completed");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("shows authoritative AND gate input counts even when recent gate activity is truncated", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
    });

    const machineGroupId = "workflow-gate-progress";
    let workflowProjectConfigId: string | null = null;
    let gateSectionId: string | null = null;
    let gateIncomingEdgeIds: string[] = [];

    await page.route("**/api/getAgentRuns", async (route) => {
      const response = await route.fetch();
      const runs = (await response.json()) as WorkflowRunRecord[];
      if (
        !workflowProjectConfigId ||
        !gateSectionId ||
        gateIncomingEdgeIds.length === 0
      ) {
        await route.fulfill({
          status: response.status(),
          headers: {
            ...response.headers(),
            "content-type": "application/json",
          },
          body: JSON.stringify(runs),
        });
        return;
      }
      const filteredRuns = runs.filter((run) => {
        return !(
          run.inputs?.runType === "state_machine" &&
          run.inputs.projectConfigId === workflowProjectConfigId &&
          run.inputs.machineGroupId === machineGroupId
        );
      });
      const gateRun: WorkflowRunRecord = {
        id: "workflow-gate-progress-run",
        status: "completed",
        startedAt: "2026-03-13T17:06:38.378618Z",
        finishedAt: "2026-03-13T17:06:45.487037Z",
        inputs: {
          runType: "state_machine",
          projectConfigId: workflowProjectConfigId,
          machineGroupId,
        },
        outputs: {
          stateMachineIteration: 1,
          gateIncomingEdgeIdsBySectionId: {
            [gateSectionId]: gateIncomingEdgeIds,
          },
          gateInputEdgeIdsBySectionId: {
            [gateSectionId]: gateIncomingEdgeIds,
          },
          gateStatusBySectionId: {
            [gateSectionId]: "satisfied",
          },
        },
        events: [
          {
            type: "gate_input_activated",
            timestamp: "2026-03-13T17:06:44.400958Z",
            payload: {
              gateSectionId,
            },
          },
          {
            type: "gate_input_activated",
            timestamp: "2026-03-13T17:06:44.836799Z",
            payload: {
              gateSectionId,
            },
          },
          {
            type: "gate_satisfied",
            timestamp: "2026-03-13T17:06:45.386601Z",
            payload: {
              gateSectionId,
            },
          },
        ],
      };
      await route.fulfill({
        status: response.status(),
        headers: {
          ...response.headers(),
          "content-type": "application/json",
        },
        body: JSON.stringify([gateRun, ...filteredRuns]),
      });
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    workflowProjectConfigId = projectContext.projectConfigId;

    try {
      const startSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineStart",
        { x: 80, y: 120 },
      );
      gateSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineGate",
        { x: 560, y: 120 },
      );
      const endSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineEnd",
        { x: 920, y: 120 },
      );
      const chatSectionIds = await Promise.all([
        createTopLevelSection(page, projectContext.projectConfigId, "Chat", {
          x: 320,
          y: 0,
        }),
        createTopLevelSection(page, projectContext.projectConfigId, "Chat", {
          x: 320,
          y: 180,
        }),
        createTopLevelSection(page, projectContext.projectConfigId, "Chat", {
          x: 320,
          y: 360,
        }),
      ]);

      await setStateMachineSectionSettings(
        page,
        projectContext.projectConfigId,
        startSectionId,
        {
          machineGroupId,
          label: "Start",
          gateType: null,
          maxIterations: null,
        },
      );
      await setStateMachineSectionSettings(
        page,
        projectContext.projectConfigId,
        gateSectionId,
        {
          machineGroupId,
          label: "Join",
          gateType: "AND",
          maxIterations: null,
        },
      );
      await setStateMachineSectionSettings(
        page,
        projectContext.projectConfigId,
        endSectionId,
        {
          machineGroupId,
          label: "Done",
          gateType: null,
          maxIterations: null,
        },
      );

      for (const chatSectionId of chatSectionIds) {
        await createStateMachineEdge(page, projectContext.projectConfigId, {
          machineGroupId,
          sourceSectionId: startSectionId,
          sourcePortId: "workflow-source",
          targetSectionId: chatSectionId,
          targetPortId: "workflow-target",
          sourceFilter: null,
          targetAction: {
            type: "reset_thread",
            promptTemplateId: null,
            promptSectionId: null,
            inlinePrompt: null,
            promptInputs: {},
            threadStrategy: "continue_current_thread",
            stopIfRunning: false,
            engineConfigId: null,
            agentProfileId: null,
            permissionMode: null,
            searchEnabled: null,
          },
        });
        await createStateMachineEdge(page, projectContext.projectConfigId, {
          machineGroupId,
          sourceSectionId: chatSectionId,
          sourcePortId: "workflow-source",
          targetSectionId: gateSectionId,
          targetPortId: "workflow-target",
          sourceFilter: {
            type: "run_completed",
            signalName: null,
            payloadField: null,
            equals: null,
          },
          targetAction: null,
        });
      }
      await createStateMachineEdge(page, projectContext.projectConfigId, {
        machineGroupId,
        sourceSectionId: gateSectionId,
        sourcePortId: "workflow-source",
        targetSectionId: endSectionId,
        targetPortId: "workflow-target",
        sourceFilter: null,
        targetAction: null,
      });

      const edges = await readStateMachineEdges(
        page,
        projectContext.projectConfigId,
      );
      gateIncomingEdgeIds = edges
        .filter((edge) => edge.targetSectionId === gateSectionId)
        .map((edge) => edge.id)
        .filter((edgeId): edgeId is string => typeof edgeId === "string");
      expect(gateIncomingEdgeIds).toHaveLength(3);

      // The activity panel still only has room for the latest few events, but
      // the gate node must show the full authoritative input count.
      await page.evaluate(async () => {
        const aiModule = await import("/src/state/actions/ai.ts");
        await aiModule.loadAgentRuns();
      });

      const gateInputProgress = page.getByTestId(
        `state-machine-gate-input-progress-${gateSectionId}`,
      );
      await expect(gateInputProgress).toHaveText("3 / 3");
      await expect(
        page.getByTestId(`state-machine-gate-status-${gateSectionId}`),
      ).toHaveText("Satisfied");
      await expect(
        page.getByTestId(`state-machine-activity-panel-${gateSectionId}`),
      ).toContainText("Gate satisfied");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("updates workflow status from websocket run updates without periodic workflow polling", async ({
    page,
  }) => {
    await installWebSocketMessageHarness(page);
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
    });

    let workflowRefreshRequestCount = 0;
    let latestWorkflowRun: WorkflowRunRecord | null = null;
    await page.route("**/api/getAgentRuns", async (route) => {
      const response = await route.fetch();
      const runs = (await response.json()) as WorkflowRunRecord[];
      const staleRuns = runs.map((run) => {
        if (
          run.inputs?.runType !== "state_machine" ||
          run.inputs.machineGroupId !== "workflow-push"
        ) {
          return run;
        }
        latestWorkflowRun = run;
        return asStaleRunningWorkflowRun(run);
      });
      await route.fulfill({
        status: response.status(),
        headers: {
          ...response.headers(),
          "content-type": "application/json",
        },
        body: JSON.stringify(staleRuns),
      });
    });
    await page.route("**/api/getStateMachineRun", async (route) => {
      const payload = route.request().postDataJSON() as
        | { machineGroupId?: string }
        | undefined;
      if (payload?.machineGroupId !== "workflow-push") {
        await route.continue();
        return;
      }
      workflowRefreshRequestCount += 1;
      const response = await route.fetch();
      const run = (await response.json()) as WorkflowRunRecord;
      latestWorkflowRun = run;
      await route.fulfill({
        status: response.status(),
        headers: {
          ...response.headers(),
          "content-type": "application/json",
        },
        body: JSON.stringify(asStaleRunningWorkflowRun(run)),
      });
    });

    await ensureAppReady(page);
    await waitForHarnessedWebSocket(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const startSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineStart",
        { x: 80, y: 120 },
      );
      const endSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "StateMachineEnd",
        { x: 480, y: 120 },
      );

      await setStateMachineSectionSettings(
        page,
        projectContext.projectConfigId,
        startSectionId,
        {
          machineGroupId: "workflow-push",
          label: "Push Flow",
          gateType: null,
          maxIterations: null,
        },
      );
      await setStateMachineSectionSettings(
        page,
        projectContext.projectConfigId,
        endSectionId,
        {
          machineGroupId: "workflow-push",
          label: "Done",
          gateType: null,
          maxIterations: null,
        },
      );
      await createStateMachineEdge(page, projectContext.projectConfigId, {
        machineGroupId: "workflow-push",
        sourceSectionId: startSectionId,
        sourcePortId: "workflow-source",
        targetSectionId: endSectionId,
        targetPortId: "workflow-target",
        sourceFilter: null,
        targetAction: null,
      });

      await openOverviewMoreDestination(page, "Custom Runs");
      const overviewWorkflowStatus = page.getByTestId(
        `run-instructions-workflow-status-${startSectionId}`,
      );
      const overviewStartButton = page.getByTestId(
        `run-instructions-workflow-start-${startSectionId}`,
      );
      const startNodeStatus = page.getByTestId(
        `state-machine-run-status-${startSectionId}`,
      );

      await expect(overviewWorkflowStatus).toHaveText("Idle");
      await overviewStartButton.click();

      await expect
        .poll(() => workflowRefreshRequestCount, { timeout: 15000 })
        .toBeGreaterThan(0);
      await expect(overviewWorkflowStatus).toHaveText("Running");
      await expect(startNodeStatus).toHaveText("Running");
      await expect
        .poll(() => latestWorkflowRun?.id ?? null, { timeout: 15000 })
        .not.toBeNull();

      const refreshCountAfterStart = workflowRefreshRequestCount;
      await page.waitForTimeout(3000);
      expect(workflowRefreshRequestCount).toBe(refreshCountAfterStart);

      const finishedAt = new Date().toISOString();
      const completedWorkflowRun: WorkflowRunRecord = {
        ...latestWorkflowRun,
        status: "completed",
        finishedAt,
        events: [
          ...((latestWorkflowRun?.events ?? []).filter(
            (event) => event.type !== "run_completed",
          ) as Array<{
            type?: string;
            timestamp?: string | null;
            payload?: Record<string, unknown>;
          }>),
          {
            type: "run_completed",
            timestamp: finishedAt,
            payload: {},
          },
        ],
      };
      await emitSyntheticWebSocketMessage(page, {
        id: "workflow-run-updated-e2e",
        messageType: "AgentRunUpdated",
        content: completedWorkflowRun,
      });

      await expect(overviewWorkflowStatus).toHaveText("Completed");
      await expect(startNodeStatus).toHaveText("Completed");
      await page.waitForTimeout(3000);
      expect(workflowRefreshRequestCount).toBe(refreshCountAfterStart);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

async function ensureDeterministicManagedChatEngine(
  page: Page,
): Promise<DeterministicManagedChatEngine> {
  const restoreManagedEngine = await ensureManagedChatEngine(page);
  const initialLLMConfig = await getBackend<LLMConfigPayload>(
    page,
    "/llm/config",
  );
  if (!initialLLMConfig) {
    await restoreManagedEngine();
    throw new Error("Missing LLM config payload.");
  }
  const initialAPIKeysSnapshot = await getBackend<ManagedAPIKeysSnapshot>(
    page,
    "/llm/apiKeys",
  );
  if (!initialAPIKeysSnapshot) {
    await restoreManagedEngine();
    throw new Error("Missing managed API keys snapshot.");
  }
  const engineConfigs = await getBackend<EngineConfigSummary[]>(
    page,
    "/getEngineConfigs",
  );
  const managedEngine =
    engineConfigs?.find((config) => config.engineType === "setta_llm") ?? null;
  if (!managedEngine?.id || !managedEngine.settaLlmConfigId) {
    await restoreManagedEngine();
    throw new Error("Missing managed engine config.");
  }

  const providerServer = await startManagedChatProviderServer();
  let latestAPIKeysSnapshot = initialAPIKeysSnapshot;
  try {
    await postBackend(page, "/llm/config", {
      ...initialLLMConfig,
      configs: {
        ...initialLLMConfig.configs,
        [managedEngine.settaLlmConfigId]: {
          ...(initialLLMConfig.configs[managedEngine.settaLlmConfigId] ?? {
            model: "gpt-4o-mini",
            provider: "openai",
          }),
          model: "gpt-4o-mini",
          provider: "openai",
          api_key_env: "OPENAI_API_KEY",
          base_url: `${providerServer.origin}/v1`,
          other_params: null,
        },
      },
    } as Record<string, unknown>);
    latestAPIKeysSnapshot = await postManagedAPIKeys(page, {
      apiKeys: {
        ...initialAPIKeysSnapshot.apiKeys,
        OPENAI_API_KEY: "e2e-workflow-secret",
      },
      expectedRevision: initialAPIKeysSnapshot.revision,
    });
  } catch (error) {
    await providerServer.close();
    await restoreManagedEngine();
    throw error;
  }

  return {
    engineConfigId: managedEngine.id,
    providerServer,
    cleanup: async () => {
      try {
        await postManagedAPIKeys(page, {
          apiKeys: initialAPIKeysSnapshot.apiKeys,
          expectedRevision: latestAPIKeysSnapshot.revision,
        });
      } catch {
        // Ignore teardown failures; the seeded workspace is disposable.
      }
      try {
        await postBackend(page, "/llm/config", {
          ...initialLLMConfig,
        } as Record<string, unknown>);
      } catch {
        // Ignore teardown failures; the seeded workspace is disposable.
      }
      await providerServer.close().catch(() => {
        // Ignore teardown failures; the seeded workspace is disposable.
      });
      await restoreManagedEngine();
    },
  };
}

async function postManagedAPIKeys(
  page: Page,
  payload: {
    apiKeys: Record<string, string>;
    expectedRevision: number;
  },
): Promise<ManagedAPIKeysSnapshot> {
  const response = await page.request.post(
    `${BACKEND_ORIGIN}/api/llm/apiKeys`,
    {
      data: payload,
      headers: BACKEND_HELPER_REQUEST_HEADERS,
    },
  );
  const text = await response.text();
  if (!response.ok()) {
    const detail = text ? ` ${text}` : "";
    throw new Error(
      `Backend request failed (${response.status()}): /llm/apiKeys${detail}`,
    );
  }
  return JSON.parse(text) as ManagedAPIKeysSnapshot;
}

async function startManagedChatProviderServer(): Promise<ManagedChatProviderServer> {
  const requests: ManagedChatProviderRequest[] = [];
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          requests.push({
            path: new URL(request.url ?? "/", "http://127.0.0.1").pathname,
            authorization: Array.isArray(request.headers.authorization)
              ? request.headers.authorization.join(", ")
              : request.headers.authorization ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }
        const responseTimer = setTimeout(() => {
          if (response.destroyed || response.writableEnded) {
            return;
          }
          response.statusCode = 200;
          response.setHeader("content-type", "text/event-stream");
          response.write(
            'data: {"choices":[{"index":0,"delta":{"content":"Workflow child"}}]}\n\n',
          );
          response.write(
            'data: {"choices":[{"index":0,"delta":{"content":" reply"},"finish_reason":"stop"}]}\n\n',
          );
          response.write(
            'data: {"choices":[],"usage":{"prompt_tokens":13,"completion_tokens":2,"total_tokens":15}}\n\n',
          );
          response.end("data: [DONE]\n\n");
        }, MANAGED_CHAT_PROVIDER_RESPONSE_DELAY_MS);
        request.once("close", () => {
          clearTimeout(responseTimer);
        });
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate managed provider test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

function asStaleRunningWorkflowRun(run: WorkflowRunRecord): WorkflowRunRecord {
  return {
    ...run,
    status: "running",
    finishedAt: null,
    events: (run.events ?? []).filter(
      (event) => event.type !== "run_completed",
    ),
  };
}

async function installWebSocketMessageHarness(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const windowWithSockets = window as typeof window & {
      __settaTrackedSockets?: WebSocket[];
      __settaTrackedSocketsInstalled?: boolean;
    };
    if (!windowWithSockets.__settaTrackedSockets) {
      windowWithSockets.__settaTrackedSockets = [];
    }
    if (windowWithSockets.__settaTrackedSocketsInstalled) {
      return;
    }
    const OriginalWebSocket = WebSocket;
    const WrappedWebSocket = function (
      this: WebSocket,
      url: string | URL,
      protocols?: string | string[],
    ) {
      const socket =
        protocols === undefined
          ? new OriginalWebSocket(url)
          : new OriginalWebSocket(url, protocols);
      windowWithSockets.__settaTrackedSockets!.push(socket);
      socket.addEventListener(
        "close",
        () => {
          windowWithSockets.__settaTrackedSockets =
            windowWithSockets.__settaTrackedSockets!.filter(
              (candidate) => candidate !== socket,
            );
        },
        { once: true },
      );
      return socket;
    } as typeof WebSocket;
    WrappedWebSocket.prototype = OriginalWebSocket.prototype;
    Object.assign(WrappedWebSocket, OriginalWebSocket);
    window.WebSocket = WrappedWebSocket;
    windowWithSockets.__settaTrackedSocketsInstalled = true;
  });
}

async function waitForHarnessedWebSocket(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          return (
            (
              window as typeof window & {
                __settaTrackedSockets?: WebSocket[];
              }
            ).__settaTrackedSockets?.length ?? 0
          );
        }),
      { timeout: 15000 },
    )
    .toBeGreaterThan(0);
}

async function emitSyntheticWebSocketMessage(
  page: Page,
  message: Record<string, unknown>,
): Promise<void> {
  await page.evaluate((payload) => {
    const sockets =
      (
        window as typeof window & {
          __settaTrackedSockets?: WebSocket[];
        }
      ).__settaTrackedSockets ?? [];
    const data = JSON.stringify(payload);
    for (const socket of sockets) {
      socket.dispatchEvent(
        new MessageEvent("message", {
          data,
        }),
      );
    }
  }, message);
}

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
  implType:
    | "Chat"
    | "StateMachineGate"
    | "StateMachineStart"
    | "StateMachineEnd",
  position: { x: number; y: number },
): Promise<string> {
  const response = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType,
    position,
  });
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
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId,
    operations: [
      {
        operationName: "setStateMachineSectionSettings",
        body: {
          sectionId,
          machineGroupId: payload.machineGroupId,
          label: payload.label,
          gateType: payload.gateType,
          frontendOpId: null,
        },
      },
    ],
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
    sourceActivationCountCondition?: {
      operator: string;
      value: number;
    } | null;
    targetAction: {
      type: string;
      promptTemplateId: string | null;
      promptSectionId?: string | null;
      inlinePrompt: string | null;
      promptInputs?: Record<string, string>;
      threadStrategy: string;
      stopIfRunning: boolean;
      engineConfigId: string | null;
      agentProfileId: string | null;
      permissionMode: string | null;
      searchEnabled: boolean | null;
    } | null;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId,
    operations: [
      {
        operationName: "createStateMachineEdge",
        body: {
          ...payload,
          frontendOpId: null,
        },
      },
    ],
  });
}

async function deleteStateMachineEdgesFromFrontend(
  page: Page,
  projectConfigId: string,
  edgeIds: string[],
): Promise<void> {
  if (edgeIds.length === 0) {
    return;
  }
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId,
    operations: [
      {
        operationName: "deleteStateMachineEdges",
        body: {
          edgeIds,
          frontendOpId: null,
        },
      },
    ],
  });
}

async function setPromptTemplateFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    template: string;
  },
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId: payload.projectConfigId,
    operations: [
      {
        operationName: "setPromptTemplate",
        body: {
          sectionId: payload.sectionId,
          template: payload.template,
          frontendOpId: null,
        },
      },
    ],
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
    sourceActivationCountCondition: {
      operator: string | null;
      value: number | null;
    } | null;
    targetAction: {
      type: string | null;
      promptTemplateId: string | null;
      promptSectionId: string | null;
      inlinePrompt: string | null;
      promptInputs: Record<string, string>;
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
      sourceActivationCountCondition: edge.sourceActivationCountCondition
        ? {
            operator: edge.sourceActivationCountCondition.operator ?? null,
            value: edge.sourceActivationCountCondition.value ?? null,
          }
        : null,
      targetAction: edge.targetAction
        ? {
            type: edge.targetAction.type ?? null,
            promptTemplateId: edge.targetAction.promptTemplateId ?? null,
            promptSectionId: edge.targetAction.promptSectionId ?? null,
            inlinePrompt: edge.targetAction.inlinePrompt ?? null,
            promptInputs: edge.targetAction.promptInputs ?? {},
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
    `[data-edgeid="${edgeId}"] .setta-gpu-flow__state-machine-edge-path`,
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
  sourceActivationCountCondition: {
    operator: string | null;
    value: number | null;
  } | null;
  targetAction: {
    type: string | null;
    promptTemplateId: string | null;
    promptSectionId: string | null;
    inlinePrompt: string | null;
    promptInputs: Record<string, string>;
    threadStrategy: string | null;
  } | null;
} | null> {
  const edges = await readStateMachineEdges(page, projectConfigId);
  return edges.find((edge) => edge.id === edgeId) ?? null;
}

async function selectStateMachineEdge(
  page: Page,
  edgeId: string,
): Promise<void> {
  await expect
    .poll(
      async () =>
        await page.evaluate(
          async ({ workflowEdgeId }) => {
            const { useProjectState } = await import(
              "/src/state/definitions.ts"
            );
            return useProjectState
              .getState()
              .projectConfig.stateMachineEdges.some(
                (edge) => edge.id === workflowEdgeId,
              );
          },
          { workflowEdgeId: edgeId },
        ),
      { timeout: 8000 },
    )
    .toBe(true);
  await page.evaluate(
    async ({ workflowEdgeId }) => {
      const { setActiveSectionIds } = await import(
        "/src/state/actions/activeSections.ts"
      );
      const { useProjectState } = await import("/src/state/definitions.ts");
      setActiveSectionIds([], { syncMode: "ui-only" });
      useProjectState.setState((state) => {
        for (const edge of state.projectConfig.stateMachineEdges) {
          edge.selected = edge.id === workflowEdgeId;
        }
      });
    },
    { workflowEdgeId: edgeId },
  );
  await expect
    .poll(
      async () =>
        await page.evaluate(
          async ({ workflowEdgeId }) => {
            const definitions = await import("/src/state/definitions.ts");
            const selectedEdgeIds = definitions.useProjectState
              .getState()
              .projectConfig.stateMachineEdges.filter((edge) => edge.selected)
              .map((edge) => edge.id);
            const activeSectionIds =
              definitions.useActiveSectionUI.getState().activeIds;
            return {
              selected:
                selectedEdgeIds.length === 1 &&
                selectedEdgeIds[0] === workflowEdgeId &&
                activeSectionIds.length === 0,
              selectedEdgeIds,
              activeSectionIds,
            };
          },
          { workflowEdgeId: edgeId },
        ),
      { timeout: 8000 },
    )
    .toMatchObject({
      selected: true,
      activeSectionIds: [],
      selectedEdgeIds: [edgeId],
    });
}

async function selectComboboxOption(
  page: Page,
  inputSelector: string,
  optionName: string,
): Promise<void> {
  const input = page.locator(inputSelector);
  const option = page.getByRole("option", { name: optionName, exact: true });
  await expect(input).toBeVisible();
  await input.focus();
  await page.keyboard.press("ArrowDown");
  await expect(option).toBeVisible();
  await option.click();
  await expect(input).toHaveValue(optionName);
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

async function getBackend<T>(page: Page, path: string): Promise<T | null> {
  const response = await page.request.get(`${BACKEND_ORIGIN}/api${path}`, {
    headers: BACKEND_HELPER_REQUEST_HEADERS,
  });
  const text = await response.text();
  if (!response.ok()) {
    const detail = text ? ` ${text}` : "";
    throw new Error(
      `Backend request failed (${response.status()}): ${path}${detail}`,
    );
  }
  if (!text) {
    return null;
  }
  return JSON.parse(text) as T;
}
