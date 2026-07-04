/* global document */

(() => {
  const version = "setta-workflow-node-details-driver-v1";

  function installWorkflowNodeDetailsDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      workflowNodeDetailsVersion: version,
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
      workflowTrajectorySurfaceCount: scopedTrajectoryCount(trajectories, "workflowNodeExecution"),
    };
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
