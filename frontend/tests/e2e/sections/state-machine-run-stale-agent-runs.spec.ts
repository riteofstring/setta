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
  createStateMachineEdge,
  createTopLevelSection,
  setStateMachineSectionSettings,
} from "./state-machine-section-helpers";

test("keeps completed workflow rows from the start response when agent runs stay stale", async ({
  page,
}) => {
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
  await page.route("**/api/startStateMachineRun", async (route) => {
    const payload = route.request().postDataJSON() as
      | { machineGroupId?: string }
      | undefined;
    if (payload?.machineGroupId !== "workflow-refresh") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const run = (await response.json()) as WorkflowRunRecord;
    latestWorkflowRun = run;
    await route.fulfill({
      status: response.status(),
      headers: {
        ...response.headers(),
        "content-type": "application/json",
      },
      body: JSON.stringify(run),
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
      .poll(() => latestWorkflowRun?.id ?? null, { timeout: 15000 })
      .not.toBeNull();
    expect(workflowRefreshRequestCount).toBe(0);
    await expect(overviewWorkflowStatus).toHaveText("Completed");
    await expect(startNodeStatus).toHaveText("Completed");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
