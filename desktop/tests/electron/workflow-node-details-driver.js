/* global HTMLButtonElement, HTMLDetailsElement, document */

(() => {
  const version = "setta-workflow-node-details-driver-v2";

  function installWorkflowNodeDetailsDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      clickWorkflowNodeTrajectoryLoadMoreOutput,
      expandWorkflowNodeTrajectoryActivityGroup,
      expandWorkflowNodeTrajectoryCommandOutput,
      workflowNodeDetailsVersion: version,
      workflowNodeTrajectoryState,
      workflowRunDetailsState,
    });
  }

  function workflowRunDetailsState() {
    const details = document.querySelector('[data-testid="workflow-node-run-details"]');
    const surfaces = document.querySelectorAll('[data-testid="workflow-node-details-surface"]');
    const surface = lastSurface(surfaces);
    const trajectories = queryAll(details, '[data-testid="agent-trajectory-surface"]');
    return {
      activityGroupHeaderCount: countSelector(details, '[data-testid="activity-group-header"]'),
      chatConversationTrajectoryCount: scopedTrajectoryCount(trajectories, "chatConversation"),
      chatMessageCount: countSelector(surface, "[data-chat-message]"),
      detailsSurfaceCount: surfaces.length,
      focusElementId: focusedActivityId(surface),
      nodeId: workflowNodeDetailsNodeId(surface),
      present: surface !== null,
      runActivityRowCount: countSelector(details, '[data-testid="run-activity-row"]'),
      text: elementText(details),
      trajectory: workflowNodeTrajectoryStateForDetails(details),
      workflowTrajectorySurfaceCount: scopedTrajectoryCount(trajectories, "workflowNodeExecution"),
    };
  }

  function workflowNodeTrajectoryState() {
    const details = document.querySelector('[data-testid="workflow-node-run-details"]');
    return workflowNodeTrajectoryStateForDetails(details);
  }

  function workflowNodeTrajectoryStateForDetails(details) {
    const trajectory = details?.querySelector('[data-testid="workflow-node-agent-trajectory"]');
    const outputButtons = queryAll(trajectory, "button").filter(
      (button) => button.textContent?.trim() === "Load more",
    );
    return {
      approvalCardCount: countSelector(trajectory, '[data-testid="approval-card"]'),
      disabledLoadMoreButtonCount: outputButtons.filter((button) => button.disabled).length,
      loadMoreButtonCount: outputButtons.length,
      outputText: outputTextForTrajectory(trajectory),
      text: elementText(trajectory),
      trajectoryPresent: trajectory !== null,
    };
  }

  function expandWorkflowNodeTrajectoryActivityGroup() {
    const trajectory = workflowNodeTrajectoryElement();
    const groupButton = queryAll(trajectory, '[data-testid="activity-group-header"]').find(
      (candidate) =>
        candidate instanceof HTMLButtonElement &&
        candidate.getAttribute("aria-expanded") === "false",
    );
    if (groupButton instanceof HTMLButtonElement) {
      groupButton.click();
    }
    return workflowNodeTrajectoryState();
  }

  function expandWorkflowNodeTrajectoryCommandOutput() {
    const trajectory = workflowNodeTrajectoryElement();
    const rows = queryAll(trajectory, 'details[data-testid="run-activity-row"]');
    const row =
      rows.find((candidate) => elementText(candidate).includes("Projection command")) ?? rows[0];
    if (row instanceof HTMLDetailsElement && !row.open) {
      row.querySelector("summary")?.click();
    }
    return workflowNodeTrajectoryState();
  }

  function clickWorkflowNodeTrajectoryLoadMoreOutput() {
    const trajectory = workflowNodeTrajectoryElement();
    const button = queryAll(trajectory, "button").find(
      (candidate) => candidate.textContent?.trim() === "Load more" && !candidate.disabled,
    );
    if (!(button instanceof HTMLButtonElement)) {
      return {
        clicked: false,
        state: workflowNodeTrajectoryStateForDetails(
          document.querySelector('[data-testid="workflow-node-run-details"]'),
        ),
      };
    }
    button.click();
    return {
      clicked: true,
      state: workflowNodeTrajectoryStateForDetails(
        document.querySelector('[data-testid="workflow-node-run-details"]'),
      ),
    };
  }

  function outputTextForTrajectory(trajectory) {
    return queryAll(trajectory, "pre")
      .map((pre) => pre.textContent ?? "")
      .join("\n");
  }

  function workflowNodeTrajectoryElement() {
    return document.querySelector('[data-testid="workflow-node-agent-trajectory"]');
  }

  function lastSurface(surfaces) {
    return surfaces[surfaces.length - 1] ?? null;
  }

  function queryAll(element, selector) {
    return element ? [...element.querySelectorAll(selector)] : [];
  }

  function countSelector(element, selector) {
    return queryAll(element, selector).length;
  }

  function scopedTrajectoryCount(trajectories, scope) {
    return trajectories.filter((trajectory) => trajectoryScopeMatches(trajectory, scope)).length;
  }

  function trajectoryScopeMatches(trajectory, scope) {
    return trajectory.getAttribute("data-agent-trajectory-scope") === scope;
  }

  function focusedActivityId(surface) {
    const focused = surface?.querySelector('[data-activity-focused="true"]') ?? null;
    return focused?.getAttribute("data-activity-focus-id") ?? "";
  }

  function workflowNodeDetailsNodeId(surface) {
    const nodeId = surface?.querySelector('[data-testid="workflow-node-details-node-id"]') ?? null;
    return elementText(nodeId).trim();
  }

  function elementText(element) {
    return element?.textContent ?? "";
  }

  installWorkflowNodeDetailsDriver();
})();
