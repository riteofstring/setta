/* global Event, HTMLButtonElement, HTMLDetailsElement, HTMLElement, HTMLTextAreaElement, InputEvent, document, window */

(() => {
  const version = "setta-workflow-node-details-driver-v3";

  function installWorkflowNodeDetailsDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      clickWorkflowDefinitionSidebarItem,
      clickWorkflowNodeTrajectoryDecisionApproval,
      clickWorkflowNodeTrajectoryLoadMoreOutput,
      clickWorkflowNodeTrajectorySteeringSend,
      expandWorkflowNodeTrajectoryActivityGroup,
      expandWorkflowNodeTrajectoryCommandOutput,
      openWorkflowNodeDetailsFromGraphDebug,
      setWorkflowNodeTrajectorySteeringText,
      workflowDefinitionSidebarItemState,
      workflowGraphRunNavigationState,
      workflowNodeDetailsVersion: version,
      workflowNodeTrajectoryComposerState,
      workflowNodeTrajectoryState,
      workflowRunDetailsState,
    });
  }

  function workflowDefinitionSidebarItemState({ name }) {
    const button = workflowDefinitionSidebarButton(name);
    return {
      disabled: button instanceof HTMLButtonElement ? button.disabled : null,
      exists: button instanceof HTMLButtonElement,
      selected: button?.getAttribute("aria-current") === "page",
      text: button?.textContent?.trim() ?? "",
    };
  }

  function clickWorkflowDefinitionSidebarItem({ name }) {
    const button = workflowDefinitionSidebarButton(name);
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return {
        clicked: false,
        state: workflowDefinitionSidebarItemState({ name }),
      };
    }
    button.click();
    return {
      clicked: true,
      state: workflowDefinitionSidebarItemState({ name }),
    };
  }

  function workflowDefinitionSidebarButton(name) {
    return (
      queryAll(document, '[data-testid="workflow-definition-list-item"]').find(
        (button) => button.getAttribute("title") === name,
      ) ?? null
    );
  }

  function workflowGraphRunNavigationState({ definitionId, executionId, surfaceId }) {
    const debugState = workflowGraphRunDebugState(surfaceId);
    if (!debugState.ready) {
      return debugState;
    }
    const workflow = debugState.snapshot.graph?.workflow ?? null;
    const runSelectorButton = workflowToolbarElementForSurface(
      surfaceId,
      '[data-testid="workflow-run-selector-button"]',
    );
    const viewActiveRunButton = workflowToolbarElementForSurface(
      surfaceId,
      '[data-testid="workflow-view-active-run-button"]',
    );
    const selectedRunId = workflowRunSelectorSelectedRunId(runSelectorButton);
    return {
      ready: true,
      roots: workflowGraphRootStates(),
      runProjectionMatches: workflowRunProjectionMatches(workflow, definitionId, executionId),
      runSelectorReady:
        runSelectorButton instanceof HTMLButtonElement && !runSelectorButton.disabled,
      selectedRunId,
      selectedRunMatches: selectedRunId === executionId,
      viewActiveRunReady:
        viewActiveRunButton instanceof HTMLButtonElement && !viewActiveRunButton.disabled,
      workflow,
    };
  }

  function workflowGraphRunDebugState(surfaceId) {
    const api = window.__settaWorkflowGraphDebug;
    if (!api) {
      return workflowGraphRunNavigationNotReady("missing-debug-api");
    }
    const surfaceIds = api.getSurfaceIds();
    if (surfaceId && !surfaceIds.includes(surfaceId)) {
      return workflowGraphRunNavigationNotReady("surface-not-registered", surfaceIds);
    }
    return { ready: true, snapshot: api.getSnapshot(surfaceId, { includeVisual: false }) };
  }

  function workflowGraphRunNavigationNotReady(reason, surfaceIds = []) {
    return {
      ready: false,
      reason,
      roots: workflowGraphRootStates(),
      runProjectionMatches: false,
      selectedRunId: "",
      selectedRunMatches: false,
      surfaceIds,
    };
  }

  function workflowGraphRootStates() {
    return queryAll(document, '[data-testid="workflow-graph"]').map(workflowGraphRootState);
  }

  function workflowGraphRootState(root) {
    const rect = root.getBoundingClientRect();
    return {
      canvasCount: root.querySelectorAll("canvas").length,
      height: rect.height,
      left: rect.left,
      surfaceId: root.dataset.surfaceId ?? null,
      top: rect.top,
      visible: elementIntersectsViewport(root),
      width: rect.width,
    };
  }

  function elementIntersectsViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.left < window.innerWidth &&
      rect.top < window.innerHeight
    );
  }

  function workflowRunProjectionMatches(workflow, definitionId, executionId) {
    return (
      workflow?.definitionId === definitionId &&
      workflow.viewMode === "run" &&
      workflow.executionId === executionId
    );
  }

  function workflowRunSelectorSelectedRunId(runSelectorButton) {
    if (!(runSelectorButton instanceof HTMLElement)) {
      return "";
    }
    return runSelectorButton.getAttribute("data-selected-run-id") ?? "";
  }

  function workflowToolbarElementForSurface(surfaceId, selector) {
    return workflowGraphHostBySurfaceId(surfaceId)?.querySelector(selector) ?? null;
  }

  function workflowGraphHostBySurfaceId(surfaceId) {
    return (
      workflowGraphSurfaceById(surfaceId)?.closest('[data-testid="workspace-pane-host"]') ?? null
    );
  }

  function workflowGraphSurfaceById(surfaceId) {
    return (
      queryAll(document, '[data-testid="workflow-graph"]').find(
        (candidate) => candidate.dataset.surfaceId === surfaceId,
      ) ?? null
    );
  }

  function openWorkflowNodeDetailsFromGraphDebug({ nodeExecutionId = "", nodeId, surfaceId }) {
    const api = window.__settaWorkflowNodeDetailsDebug;
    if (!api) {
      return { ok: false, reason: "missing-debug-api" };
    }
    const surfaceIds = api.getSurfaceIds();
    if (!surfaceIds.includes(surfaceId)) {
      return { ok: false, reason: "surface-not-registered", surfaceIds };
    }
    return api.openNodeDetails(surfaceId, nodeId, nodeExecutionId)
      ? { ok: true }
      : { ok: false, reason: "node-not-opened" };
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
    const approvalCards = queryAll(trajectory, '[data-testid="approval-card"]');
    const outputButtons = queryAll(trajectory, "button").filter(
      (button) => button.textContent?.trim() === "Load more",
    );
    return {
      approvalApproveButtonReady: approvalDecisionButtonReady(approvalCards, "Approve"),
      approvalCardCount: approvalCards.length,
      approvalDenyButtonReady: approvalDecisionButtonReady(approvalCards, "Deny"),
      approvalText: approvalCards.map((card) => elementText(card)).join("\n"),
      disabledLoadMoreButtonCount: outputButtons.filter((button) => button.disabled).length,
      loadMoreButtonCount: outputButtons.length,
      nodeExecutionId: trajectory?.getAttribute("data-workflow-node-execution-id") ?? "",
      outputText: outputTextForTrajectory(trajectory),
      runId: trajectory?.getAttribute("data-workflow-node-run-id") ?? "",
      text: elementText(trajectory),
      trajectoryPresent: trajectory !== null,
      trajectorySteeringComposer: workflowNodeTrajectoryComposerStateForTrajectory(trajectory),
    };
  }

  function approvalDecisionButtonReady(approvalCards, label) {
    return approvalCards.some((card) => {
      const button = decisionButton(card, label);
      return button instanceof HTMLButtonElement && !button.disabled;
    });
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

  function clickWorkflowNodeTrajectoryDecisionApproval({ approved = true } = {}) {
    const trajectory = workflowNodeTrajectoryElement();
    const approvalCard = queryAll(trajectory, '[data-testid="approval-card"]')[0] ?? null;
    const label = approved ? "Approve" : "Deny";
    const button = decisionButton(approvalCard, label);
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
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

  function workflowNodeTrajectoryComposerState() {
    return workflowNodeTrajectoryComposerStateForTrajectory(workflowNodeTrajectoryElement());
  }

  function workflowNodeTrajectoryComposerStateForTrajectory(trajectory) {
    const composer = workflowNodeTrajectoryComposerElement(trajectory);
    const textarea = workflowNodeTrajectoryComposerTextarea(composer);
    const sendButton = workflowNodeTrajectoryComposerSendButton(composer);
    return {
      composerPresent: composer !== null,
      sendButtonReady: enabledButton(sendButton),
      textareaDisabled: textAreaDisabled(textarea),
      textareaExists: textAreaExists(textarea),
      textareaValue: textAreaValue(textarea),
    };
  }

  function workflowNodeTrajectoryComposerElement(trajectory) {
    return trajectory?.querySelector('[data-testid="chat-composer"]') ?? null;
  }

  function workflowNodeTrajectoryComposerTextarea(composer) {
    return composer?.querySelector('textarea[aria-label="Ask Setta"]') ?? null;
  }

  function workflowNodeTrajectoryComposerSendButton(composer) {
    return composer?.querySelector('button[aria-label="Send steering message"]') ?? null;
  }

  function enabledButton(element) {
    return element instanceof HTMLButtonElement && !element.disabled;
  }

  function textAreaDisabled(element) {
    if (!(element instanceof HTMLTextAreaElement)) {
      return null;
    }
    return element.disabled;
  }

  function textAreaExists(element) {
    return element instanceof HTMLTextAreaElement;
  }

  function textAreaValue(element) {
    if (!(element instanceof HTMLTextAreaElement)) {
      return "";
    }
    return element.value;
  }

  function setWorkflowNodeTrajectorySteeringText({ text }) {
    const trajectory = workflowNodeTrajectoryElement();
    const composer = trajectory?.querySelector('[data-testid="chat-composer"]') ?? null;
    const textarea = composer?.querySelector('textarea[aria-label="Ask Setta"]') ?? null;
    if (!(textarea instanceof HTMLTextAreaElement) || textarea.disabled) {
      return {
        updated: false,
        state: workflowNodeTrajectoryComposerStateForTrajectory(trajectory),
      };
    }
    setTextAreaValue(textarea, text);
    return {
      updated: textarea.value === text,
      state: workflowNodeTrajectoryComposerStateForTrajectory(trajectory),
    };
  }

  function clickWorkflowNodeTrajectorySteeringSend() {
    const trajectory = workflowNodeTrajectoryElement();
    const composer = trajectory?.querySelector('[data-testid="chat-composer"]') ?? null;
    const sendButton =
      composer?.querySelector('button[aria-label="Send steering message"]') ?? null;
    if (!(sendButton instanceof HTMLButtonElement) || sendButton.disabled) {
      return {
        clicked: false,
        state: workflowNodeTrajectoryComposerStateForTrajectory(trajectory),
      };
    }
    sendButton.click();
    return {
      clicked: true,
      state: workflowNodeTrajectoryComposerStateForTrajectory(trajectory),
    };
  }

  function setTextAreaValue(textarea, value) {
    const previousValue = textarea.value;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    descriptor?.set?.call(textarea, value);
    textarea._valueTracker?.setValue(previousValue);
    textarea.focus();
    textarea.select();
    textarea.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: value,
        inputType: "insertText",
      }),
    );
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function decisionButton(root, label) {
    return queryAll(root, "button").find((button) => button.textContent?.trim() === label) ?? null;
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
