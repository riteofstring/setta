import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  openOverviewMoreDestination,
  seedLocalStorage,
} from "../helpers";

import { type WorkflowRunRecord } from "./state-machine-section-test-types";

import {
  asStaleRunningWorkflowRun,
  createStateMachineEdge,
  createTopLevelSection,
  emitSyntheticWebSocketMessage,
  installWebSocketMessageHarness,
  readStateMachineEdges,
  setStateMachineSectionSettings,
  waitForHarnessedWebSocket,
} from "./state-machine-section-helpers";

test.describe.serial("state machine workflow runs", () => {
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
