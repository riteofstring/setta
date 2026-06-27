import { join } from "node:path";

import { driverCallExpression } from "./cdp-client.mjs";
import { captureScreenshot, waitForState } from "./electron-cdp-harness.mjs";
import {
  dispatchWorkflowGraphMouseClick,
  maximizeWorkflowGraphPane,
} from "./workflow-graph-layout-helpers.mjs";

// Phase 3.5B production-path coverage: a chip click routes through the real Pixi hit-test -> renderer
// handler -> editor-store focus -> workflow node details Niri pane, deep-linking the matching detail
// row. Two chip kinds are exercised end-to-end:
//   - the command chip (chat_run_item ref) opens the owning node details and highlights the matching
//     run activity row rendered through the shared chat run-activity path;
//   - the workflow-status chip (workflow_event ref) focuses the matching workflow event row.
// The graph pane is scrolled off-screen once the details pane is focused, so the details pane is
// closed between clicks to make the graph hittable again. The approval deep-link (no pending approval
// once the run is terminal) is covered by the focused WorkflowRunDetailsContent component test.
export async function assertPhase35BChipClickThrough(client, surfaceId, artifactDir) {
  const command = await clickActivityChipForKind(client, surfaceId, "command", (chip) =>
    chip.runItemId === "" ? "" : `run-item:${chip.runItemId}`,
  );
  if (command.details.runActivityRowCount < 1) {
    throw new Error(
      `command chip details did not render shared run-activity rows: ${JSON.stringify(command.details)}`,
    );
  }
  await captureScreenshot(client, join(artifactDir, "activity-feed-chip-details.png"));

  await closeWorkflowNodeDetailsPane(client);
  // Closing the details pane leaves the graph pane scrolled off-screen in the Niri strip, so
  // re-maximize it to bring the canvas fully on-screen before the second on-canvas click.
  await maximizeWorkflowGraphPane(client, { surfaceId });
  await clickActivityChipForKind(client, surfaceId, "workflow_status", (chip) =>
    chip.workflowEventId === "" ? "" : `workflow-event:${chip.workflowEventId}`,
  );
  await captureScreenshot(client, join(artifactDir, "activity-feed-chip-details-workflow.png"));
}

async function clickActivityChipForKind(client, surfaceId, kind, elementIdForChip) {
  const { canvas, chip } = await waitForClickableActivityChip(client, surfaceId, kind);
  const expectedElementId = elementIdForChip(chip);
  if (expectedElementId === "") {
    throw new Error(`activity ${kind} chip is missing a typed detail ref: ${JSON.stringify(chip)}`);
  }
  await dispatchWorkflowGraphMouseClick(client, surfaceId, onCanvasChipClickPoint(chip, canvas));
  const details = await waitForWorkflowNodeDetailsState(
    client,
    (state) =>
      state.present && state.nodeId === chip.nodeId && state.focusElementId === expectedElementId,
  );
  assertWorkflowNodeDetailsIsCanonical(details);
  return { chip, details, expectedElementId };
}

// Waits until the chip is rendered with a clickable on-canvas area. After the details pane opens and
// is closed the graph canvas resizes, so the chip can briefly be off-canvas before it re-flows.
async function waitForClickableActivityChip(client, surfaceId, kind) {
  await client.installDriver();
  const state = await waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", { includeVisual: false, surfaceId }),
    (value) => value.ready && Boolean(clickableActivityChip(value.snapshot, kind)),
  );
  return { canvas: state.snapshot.canvas, chip: clickableActivityChip(state.snapshot, kind) };
}

function clickableActivityChip(snapshot, kind) {
  // The graph canvas must be fully on-screen (a non-negative left). After a side pane opens/closes
  // the Niri strip can leave the graph scrolled to a negative offset where chip page coordinates
  // would miss the canvas.
  if (snapshot.canvas.left < 0) {
    return null;
  }
  const chip = snapshot.visualGrammar.activityChips.find(
    (candidate) =>
      candidate.type === "marker" &&
      candidate.kind === kind &&
      candidate.nodeId === "activity" &&
      candidate.visible,
  );
  if (!chip || onCanvasChipArea(chip, snapshot.canvas) < 8) {
    return null;
  }
  return chip;
}

function onCanvasChipArea(chip, canvas) {
  const width = Math.min(chip.screenRight, canvas.clientWidth) - Math.max(chip.screenLeft, 0);
  const height = Math.min(chip.screenBottom, canvas.clientHeight) - Math.max(chip.screenTop, 0);
  return Math.min(width, height);
}

// Click the center of the chip's on-canvas portion. After a side pane opens the canvas can be
// narrower than a flipped chip, so the geometric chip center may sit just past the clip edge even
// though a clickable portion remains on screen.
function onCanvasChipClickPoint(chip, canvas) {
  const left = Math.max(chip.screenLeft, 0);
  const right = Math.min(chip.screenRight, canvas.clientWidth);
  const top = Math.max(chip.screenTop, 0);
  const bottom = Math.min(chip.screenBottom, canvas.clientHeight);
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

function assertWorkflowNodeDetailsIsCanonical(details) {
  // The chip click must route into the canonical workflow node details surface (the focused element
  // lives inside [data-testid="workflow-node-details-surface"]), not a separate chip-only details
  // surface, and it must not embed the full chat transcript.
  if (!details.present) {
    throw new Error(
      `chip click did not open the workflow node details surface: ${JSON.stringify(details)}`,
    );
  }
  if (details.chatMessageCount !== 0) {
    throw new Error(
      `workflow node details embedded a chat transcript on chip click-through: ${JSON.stringify(details)}`,
    );
  }
}

async function closeWorkflowNodeDetailsPane(client) {
  const closed = await client.evaluate(`(() => {
    const surface = document.querySelector('[data-testid="workflow-node-details-surface"]');
    const host = surface?.closest('[data-testid="workspace-pane-host"]');
    const button = host?.querySelector('[data-workspace-pane-action="close"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!closed.ok) {
    throw new Error(`could not close the workflow node details pane: ${JSON.stringify(closed)}`);
  }
  await waitForState(
    client,
    `(() => ({ present: Boolean(document.querySelector('[data-testid="workflow-node-details-surface"]')) }))()`,
    (state) => !state.present,
  );
}

async function waitForWorkflowNodeDetailsState(client, predicate, timeoutMs = 20_000) {
  return waitForState(client, workflowNodeDetailsStateExpression(), predicate, timeoutMs);
}

function workflowNodeDetailsStateExpression() {
  return `(() => {
    const surfaces = document.querySelectorAll('[data-testid="workflow-node-details-surface"]');
    const surface = surfaces[surfaces.length - 1] ?? null;
    if (surface === null) {
      return { present: false };
    }
    const focused = surface.querySelector('[data-activity-focused="true"]');
    return {
      chatMessageCount: surface.querySelectorAll('[data-chat-message]').length,
      detailsSurfaceCount: surfaces.length,
      focusElementId: focused ? focused.getAttribute('data-activity-focus-id') || '' : '',
      nodeId: surface.querySelector('[data-testid="workflow-node-details-node-id"]')?.textContent?.trim() || '',
      present: true,
      runActivityRowCount: surface.querySelectorAll('[data-testid="run-activity-row"]').length,
    };
  })()`;
}
