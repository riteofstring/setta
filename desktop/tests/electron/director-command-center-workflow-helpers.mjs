import { basename } from "node:path";

import { driverCallExpression } from "./cdp-client.mjs";
import { waitForBackendState } from "./electron-workflow-harness.mjs";
import { waitForSelector, waitForState } from "./electron-cdp-harness.mjs";

const workflowTimeoutMs = 60_000;

export async function verifyWorkspaceSettings(client, workspaceId, workspaceRoot) {
  const opened = await client.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Open settings"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!opened) {
    throw new Error("Director command center omitted its Settings action");
  }
  await waitForSelector(client, '[data-testid="settings-shell-page"]');
  await client.evaluate(`document.querySelector("#settings-subtab-roles")?.click()`);
  await waitForSelector(client, '[data-testid="role-configuration-scope-settings"]');
  const result = await waitForState(
    client,
    `(() => {
      const select = document.querySelector('select[aria-label="AI role configuration scope"]');
      if (!(select instanceof HTMLSelectElement)) {
        return { ready: false };
      }
      const workspaceOption = Array.from(select.options).find(
        (option) => option.value === "workspace"
      );
      return {
        ready: Boolean(workspaceOption),
        workspaceLabel: workspaceOption?.textContent ?? "",
        workspaceValue: workspaceOption?.value ?? ""
      };
    })()`,
    (state) => state.ready,
    workflowTimeoutMs,
  );
  assertEqual(result.workspaceValue, "workspace", "workspace role scope option");
  if (!result.workspaceLabel.includes(basename(workspaceRoot))) {
    throw new Error(`workspace role scope omitted the active workspace: ${JSON.stringify(result)}`);
  }
  const closed = await client.evaluate(`(() => {
    const button = document.querySelector(".setta-settings-page-back");
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!closed) {
    throw new Error("Settings page omitted Back to command center");
  }
  await waitForSelector(client, '[data-testid="director-command-center-shell"]');
  return { ...result, workspaceId };
}

export async function readDirectorHistory(client) {
  const opened = await client.evaluate(`(() => {
    const button = document.querySelector(".director-history-open");
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!opened) {
    throw new Error("Director history action was unavailable");
  }
  await waitForSelector(client, ".director-history-dialog");
  const modal = await client.driver("directorCommandCenterWorkflowHistoryModalState");
  assertDeepEqual(
    modal,
    {
      backgroundHidden: true,
      backgroundInert: true,
      focusedAfterShiftTab: true,
      focusedAfterTab: true,
      focusedInitially: true,
      ready: true,
    },
    "Director history focus isolation",
  );
  const history = await client.evaluate(`(() =>
    Array.from(document.querySelectorAll(".director-history-dialog-list li")).map((item) => ({
      kind: item.getAttribute("data-node-kind") ?? "",
      text: item.textContent?.trim() ?? ""
    }))
  )()`);
  await client.evaluate(
    `document.querySelector('.director-history-dialog button[aria-label="Close history"]')?.click()`,
  );
  await waitForState(
    client,
    `(() => {
      const background = document.querySelector(".director-command-center-content");
      const trigger = document.querySelector(".director-history-open");
      return {
        backgroundInert: background instanceof HTMLElement && background.inert,
        focusedTrigger: document.activeElement === trigger,
        overlayOpen: Boolean(document.querySelector(".director-history-overlay"))
      };
    })()`,
    (state) => !state.backgroundInert && state.focusedTrigger && !state.overlayOpen,
    workflowTimeoutMs,
  );
  return history;
}

/*
 * Above the phone breakpoint both rails sit beside the canvas and the canvas is
 * still the whole window. A narrow desktop window used to stack the rails into
 * full-width bars that covered the graph, which is the pane workspace the
 * command center replaced.
 */
export async function verifyRailsFlankTheCanvas(client) {
  await client.call("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: 720,
    mobile: false,
    width: 900,
  });
  try {
    const layout = await waitForState(
      client,
      driverCallExpression("directorCommandCenterWorkflowRailLayout"),
      (state) =>
        state.compact === false &&
        state.artifacts !== null &&
        state.canvas !== null &&
        state.composer !== null &&
        state.now !== null,
      workflowTimeoutMs,
    );
    const described = JSON.stringify(layout);
    if (layout.now.right > layout.artifacts.left) {
      throw new Error(`Director rails stacked instead of flanking the canvas: ${described}`);
    }
    if (layout.now.width < 200 || layout.artifacts.width < 200) {
      throw new Error(`Director rails collapsed beside the canvas: ${described}`);
    }
    if (layout.canvas.width < layout.viewportWidth - 1) {
      throw new Error(`Director canvas was cut down to fit the rails: ${described}`);
    }
    if (layout.composer.top < layout.now.bottom - 1) {
      throw new Error(`Director composer overlapped the Now rail: ${described}`);
    }
  } finally {
    await client.call("Emulation.clearDeviceMetricsOverride");
  }
}

export async function verifyCompactRailFocusRestoration(client) {
  await client.call("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: 844,
    mobile: true,
    width: 390,
  });
  try {
    await waitForState(
      client,
      `(() => ({
        compact: matchMedia("(max-width: 760px)").matches,
        triggerReady: Boolean(
          document.querySelector('button[aria-controls="director-now-rail"][aria-expanded="false"]')
        )
      }))()`,
      (state) => state.compact && state.triggerReady,
      workflowTimeoutMs,
    );
    const opened = await client.evaluate(`(() => {
      const trigger = document.querySelector(
        'button[aria-controls="director-now-rail"][aria-expanded="false"]'
      );
      if (!(trigger instanceof HTMLButtonElement)) {
        return false;
      }
      trigger.click();
      return true;
    })()`);
    if (!opened) {
      throw new Error("compact Now rail did not expose its disclosure button");
    }
    await waitForState(
      client,
      `(() => {
        const rail = document.querySelector("#director-now-rail");
        const trigger = document.querySelector('button[aria-controls="director-now-rail"]');
        return {
          expanded: trigger?.getAttribute("aria-expanded") === "true",
          visible: rail instanceof HTMLElement && getComputedStyle(rail).display !== "none"
        };
      })()`,
      (state) => state.expanded && state.visible,
      workflowTimeoutMs,
    );
    const escaped = await client.evaluate(`(() => {
      const railAction = document.querySelector("#director-now-rail .director-history-open");
      if (!(railAction instanceof HTMLButtonElement)) {
        return false;
      }
      railAction.focus();
      railAction.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape"
      }));
      return true;
    })()`);
    if (!escaped) {
      throw new Error("compact Now rail did not contain a focusable history action");
    }
    await waitForState(
      client,
      `(() => {
        const rail = document.querySelector("#director-now-rail");
        const trigger = document.querySelector('button[aria-controls="director-now-rail"]');
        return {
          collapsed: trigger?.getAttribute("aria-expanded") === "false",
          focusedTrigger: document.activeElement === trigger,
          hidden: rail instanceof HTMLElement && getComputedStyle(rail).display === "none"
        };
      })()`,
      (state) => state.collapsed && state.focusedTrigger && state.hidden,
      workflowTimeoutMs,
    );
    await verifyMinimumCompactWidth(client);
  } finally {
    await client.call("Emulation.clearDeviceMetricsOverride");
  }
}

async function verifyMinimumCompactWidth(client) {
  await client.call("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: 720,
    mobile: true,
    width: 320,
  });
  const layout = await waitForState(
    client,
    driverCallExpression("directorCommandCenterWorkflowMinimumCompactLayout"),
    (state) =>
      state.composer !== null &&
      state.controls !== null &&
      state.headingCount === 1 &&
      state.metaHidden &&
      state.navigation !== null &&
      !state.titleClipped &&
      state.viewportWidth === 320,
    workflowTimeoutMs,
  );
  const described = JSON.stringify(layout);
  if (layout.navigation.right > layout.controls.left + 1) {
    throw new Error(`Director compact navigation overlapped view controls: ${described}`);
  }
  if (layout.composer.left < 0 || layout.composer.right > layout.viewportWidth) {
    throw new Error(`Director compact composer escaped the viewport: ${described}`);
  }
}

export function assertHistoryContainsOnlyUserAndTerminalTurns(history) {
  if (history.length === 0) {
    throw new Error("Director history omitted completed work");
  }
  const allowed = new Set(["user_goal", "completed", "failed", "cancelled"]);
  const unexpected = history.filter((item) => !allowed.has(item.kind));
  if (unexpected.length > 0) {
    throw new Error(`Director history exposed intermediate activity: ${JSON.stringify(history)}`);
  }
  if (!history.some((item) => item.kind === "completed" && item.text !== "Run completed")) {
    throw new Error(`Director history omitted a final response: ${JSON.stringify(history)}`);
  }
}

export async function answerDirectorApprovalInRail(client, approvalId, questionId, answer) {
  const approvalSelector = `[data-approval-id="${approvalId}"]`;
  await waitForSelector(client, approvalSelector);
  const fieldSelector = `${approvalSelector} [name="${questionId}"]`;
  const updated = await client.evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(fieldSelector)});
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) {
      return { ok: false, reason: "missing-question" };
    }
    const valueDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value");
    valueDescriptor?.set?.call(field, ${JSON.stringify(answer)});
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  })()`);
  if (!updated.ok) {
    throw new Error(`Director approval rail did not update: ${JSON.stringify(updated)}`);
  }
  const answered = await client.evaluate(`(() => {
    const approval = document.querySelector(${JSON.stringify(approvalSelector)});
    if (!(approval instanceof HTMLElement)) {
      return { ok: false, reason: "missing-approval" };
    }
    const answerButton = Array.from(approval.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Answer" && !button.disabled
    );
    if (!(answerButton instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-answer-button" };
    }
    answerButton.click();
    return { ok: true };
  })()`);
  if (!answered.ok) {
    throw new Error(`Director approval rail did not submit: ${JSON.stringify(answered)}`);
  }
}

/**
 * Waits for an artifact's rail preview to render its projected document.
 *
 * The card is read lazily once it enters the rail viewport, so a preview that
 * never leaves `loading` means the read, the parse, or the projection never
 * reached the rail.
 */
export async function waitForDirectorArtifactPreview(client, artifactId) {
  const selector = `.director-artifact-preview[data-artifact-id="${artifactId}"]`;
  await waitForSelector(client, selector);
  await client.evaluate(`document
    .querySelector(${JSON.stringify(selector)})
    ?.scrollIntoView({ block: "center", inline: "nearest" })`);
  return waitForState(
    client,
    `(() => {
      const card = document.querySelector(${JSON.stringify(selector)});
      const viewport = card?.querySelector(".director-artifact-preview-viewport");
      return {
        expandDisabled: card?.querySelector(".director-artifact-expand")?.disabled ?? true,
        height: card ? Math.round(card.getBoundingClientRect().height) : 0,
        previewInert: viewport instanceof HTMLElement ? viewport.inert : null,
        previewText: viewport?.textContent ?? "",
        state: card?.getAttribute("data-preview-state") ?? ""
      };
    })()`,
    (preview) => preview.state === "ready" && !preview.expandDisabled,
    workflowTimeoutMs,
  );
}

/**
 * A single click on a preview card is not an affordance.
 *
 * The card is not a control, so clicking its body must not open anything and
 * must not resize the card the way a selected-card expansion would.
 */
export async function assertArtifactPreviewIgnoresSingleClick(client, artifactId, before) {
  const after = await client.evaluate(`(() => {
    const card = document.querySelector(
      ${JSON.stringify(`.director-artifact-preview[data-artifact-id="${artifactId}"]`)}
    );
    card?.querySelector(".director-artifact-preview-viewport")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
    return {
      browserOpen: Boolean(document.querySelector(".director-artifact-browser")),
      height: card ? Math.round(card.getBoundingClientRect().height) : 0
    };
  })()`);
  if (after.browserOpen) {
    throw new Error("Director artifact preview opened the browser on a single click");
  }
  assertEqual(after.height, before.height, "Director artifact preview height after single click");
}

export async function assertArtifactExpandControlRegainedFocus(client, artifactId) {
  const focused = await client.evaluate(`(() => {
    const card = document.querySelector(
      ${JSON.stringify(`.director-artifact-preview[data-artifact-id="${artifactId}"]`)}
    );
    return card?.querySelector(".director-artifact-expand") === document.activeElement;
  })()`);
  if (!focused) {
    throw new Error("Director artifact browser did not restore focus to its expand control");
  }
}

export async function openDirectorArtifactBrowser(client, artifactId, documentMarker) {
  const opened = await client.driver("directorCommandCenterWorkflowOpenArtifact", { artifactId });
  if (!opened.ok) {
    throw new Error(`Director artifact did not open: ${JSON.stringify(opened)}`);
  }
  if (
    !opened.backgroundHidden ||
    !opened.backgroundInert ||
    !opened.focusInsideModal ||
    !opened.modalOpen
  ) {
    throw new Error(`Director artifact modal handoff was inaccessible: ${JSON.stringify(opened)}`);
  }
  return waitForOpenDirectorArtifact(client, artifactId, documentMarker);
}

export async function openDirectorArtifactBrowserByDoubleClick(client, artifactId, documentMarker) {
  const opened = await client.evaluate(`(() => {
    const card = document.querySelector(
      ${JSON.stringify(`.director-artifact-preview[data-artifact-id="${artifactId}"]`)}
    );
    if (!(card instanceof HTMLElement)) {
      return false;
    }
    card.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    return true;
  })()`);
  if (!opened) {
    throw new Error("Director artifact double-click target was unavailable");
  }
  return waitForOpenDirectorArtifact(client, artifactId, documentMarker);
}

export function waitForOpenDirectorArtifact(client, artifactId, documentMarker) {
  return waitForState(
    client,
    driverCallExpression("directorCommandCenterWorkflowArtifactBrowserState", { artifactId }),
    (detail) =>
      detail.activeDocumentId === artifactId &&
      detail.documentCount === 1 &&
      detail.status === "ready" &&
      detail.documentText.includes(documentMarker) &&
      detail.position !== "" &&
      detail.liveText.includes(detail.position),
    workflowTimeoutMs,
  );
}

export async function activateArtifactBrowserControl(client, label, artifactId, documentMarker) {
  const activated = await client.evaluate(`(() => {
    const button = document.querySelector(
      ${JSON.stringify(`.director-artifact-browser button[aria-label="${label}"]`)}
    );
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-control" };
    }
    if (button.disabled) {
      return { ok: false, reason: "disabled-control" };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!activated.ok) {
    throw new Error(`Director artifact control did not activate: ${JSON.stringify(activated)}`);
  }
  return waitForOpenDirectorArtifact(client, artifactId, documentMarker);
}

export async function navigateArtifactBrowserWithArrow(client, key, artifactId, documentMarker) {
  const dispatched = await client.evaluate(`(() => {
    const browser = document.querySelector(".director-artifact-browser");
    if (!(browser instanceof HTMLElement)) {
      return false;
    }
    browser.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: ${JSON.stringify(key)}
      })
    );
    return true;
  })()`);
  if (!dispatched) {
    throw new Error("Director artifact browser keyboard target was unavailable");
  }
  return waitForOpenDirectorArtifact(client, artifactId, documentMarker);
}

export async function assertArtifactTableOwnsHorizontalArrow(client, artifactId) {
  const activeArtifactId = await client.evaluate(`(async () => {
    const table = document.querySelector(
      ".director-artifact-browser [data-slot='table-container']"
    );
    if (!(table instanceof HTMLElement)) {
      return "";
    }
    table.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "ArrowRight"
      })
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return document.querySelector(".director-artifact-browser")?.getAttribute("data-artifact-id")
      ?? "";
  })()`);
  assertEqual(activeArtifactId, artifactId, "Director artifact table horizontal arrow ownership");
}

export function assertArtifactBrowserBoundaries(detail, expected) {
  assertEqual(detail.previousDisabled, expected.previousDisabled, "previous artifact boundary");
  assertEqual(detail.nextDisabled, expected.nextDisabled, "next artifact boundary");
}

export function assertArtifactBrowserTheme(detail) {
  if (
    detail.backgroundColor === "" ||
    detail.backgroundColor === "rgba(0, 0, 0, 0)" ||
    detail.color === "" ||
    detail.color === detail.backgroundColor
  ) {
    throw new Error(`Director artifact browser theme was unreadable: ${JSON.stringify(detail)}`);
  }
}

export function assertArtifactBrowserModalIsolation(detail) {
  if (!detail.backgroundHidden || !detail.backgroundInert) {
    throw new Error(
      `Director artifact browser did not isolate its background: ${JSON.stringify(detail)}`,
    );
  }
}

export async function assertArtifactBrowserContainsFocus(client) {
  await client.evaluate(`document.querySelector("#director-composer-input")?.focus()`);
  const contained = await waitForState(
    client,
    `document.activeElement?.closest(".director-artifact-browser") !== null`,
    (inside) => inside === true,
    workflowTimeoutMs,
  );
  if (!contained) {
    throw new Error("Director artifact browser did not contain focus");
  }
}

export async function rememberDirectorGraphCanvas(client) {
  const remembered = await client.evaluate(`(() => {
    const canvas = document.querySelector(".director-graph-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return false;
    }
    globalThis.__settaArtifactBrowserGraphCanvas = canvas;
    return true;
  })()`);
  if (!remembered) {
    throw new Error("Director graph canvas was unavailable before opening an artifact");
  }
}

export async function assertDirectorGraphCanvasPreserved(client) {
  const preserved = await client.evaluate(
    `globalThis.__settaArtifactBrowserGraphCanvas === document.querySelector(".director-graph-canvas")`,
  );
  if (!preserved) {
    throw new Error("Director artifact browser remounted the graph canvas");
  }
}

export function directorAppearanceMode(client) {
  return client.evaluate(`document.documentElement.dataset.colorMode ?? "dark"`);
}

export async function setDirectorAppearanceMode(client, mode) {
  const opened = await client.evaluate(`(() => {
    const trigger = document.querySelector('button[aria-label="Open settings"]');
    if (!(trigger instanceof HTMLButtonElement)) {
      return false;
    }
    trigger.click();
    return true;
  })()`);
  if (!opened) {
    throw new Error("Director appearance check could not open settings");
  }
  await waitForSelector(client, '[data-testid="settings-shell-page"]');
  await client.evaluate(`document.querySelector("#settings-subtab-theme")?.click()`);
  await waitForSelector(client, '[data-testid="appearance-settings"]');
  const changed = await client.evaluate(`(() => {
    const button = document.querySelector(
      ${JSON.stringify(`[data-testid="appearance-settings"] button[title="${mode === "light" ? "Light" : "Dark"} mode"]`)}
    );
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!changed) {
    throw new Error(`Director appearance check could not select ${mode} mode`);
  }
  await waitForState(
    client,
    `document.documentElement.dataset.colorMode ?? ""`,
    (current) => current === mode,
    workflowTimeoutMs,
  );
  const closed = await client.evaluate(`(() => {
    const button = document.querySelector(".setta-settings-page-back");
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!closed) {
    throw new Error("Director appearance check could not return to the command center");
  }
  await waitForSelector(client, '[data-testid="director-command-center-shell"]');
}

export async function assertDirectorArtifactPreviewTheme(client, artifactId, mode) {
  const theme = await client.evaluate(`(() => {
    const viewport = document.querySelector(
      ${JSON.stringify(
        `.director-artifact-preview[data-artifact-id="${artifactId}"] .director-artifact-preview-viewport`,
      )}
    );
    const style = viewport instanceof HTMLElement ? getComputedStyle(viewport) : null;
    return {
      backgroundColor: style?.backgroundColor ?? "",
      color: style?.color ?? "",
      mode: document.documentElement.dataset.colorMode ?? ""
    };
  })()`);
  assertEqual(theme.mode, mode, `Director artifact preview ${mode} appearance`);
  if (
    theme.backgroundColor === "" ||
    theme.backgroundColor === "rgba(0, 0, 0, 0)" ||
    theme.color === "" ||
    theme.color === theme.backgroundColor
  ) {
    throw new Error(`Director artifact preview theme was unreadable: ${JSON.stringify(theme)}`);
  }
}

export async function closeDirectorArtifactBrowser(client) {
  const closed = await client.evaluate(`(() => {
    const button = document.querySelector(
      '.director-artifact-browser button[aria-label="Close artifact browser"]'
    );
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!closed) {
    throw new Error("Director artifact browser did not expose a close action");
  }
  await waitForState(
    client,
    `Boolean(document.querySelector(".director-artifact-browser"))`,
    (open) => open === false,
    workflowTimeoutMs,
  );
}

export function waitForConversationSnapshot(backend, workspaceId, conversationId, ready) {
  return waitForBackendState(
    () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId }),
    ready,
    workflowTimeoutMs,
  );
}

export function conversationID(workstreamId) {
  const prefix = "workstream:";
  if (!workstreamId.startsWith(prefix) || workstreamId.length === prefix.length) {
    throw new Error(`unexpected workstream identity ${workstreamId}`);
  }
  return workstreamId.slice(prefix.length);
}

export function assertDirectorEventSequence(cursor, events) {
  if (events.length === 0) {
    throw new Error("Director renderer subscription delivered no events");
  }
  let expected = cursor.sequence + 1;
  for (const event of events) {
    if (event.kind === "director.resync_required") {
      throw new Error(`Director renderer subscription required resync: ${JSON.stringify(event)}`);
    }
    if (event.streamId !== cursor.streamId || event.sequence !== expected) {
      throw new Error(
        `Director renderer event sequence drifted: ${JSON.stringify({
          actual: `${event.streamId}:${event.sequence}`,
          expected: `${cursor.streamId}:${expected}`,
        })}`,
      );
    }
    expected += 1;
  }
}

export function assertEventKinds(events, requiredKinds) {
  const actual = new Set(events.map((event) => event.kind));
  const missing = requiredKinds.filter((kind) => !actual.has(kind));
  if (missing.length > 0) {
    throw new Error(`Director renderer events omitted kinds: ${missing.join(", ")}`);
  }
}

export function assertGraphUpdates(events, requiredWorkstreamIds) {
  const actual = new Set(
    events
      .filter((event) => event.kind === "director.graph.updated")
      .map((event) => event.graphUpdated?.workstreamId),
  );
  const missing = requiredWorkstreamIds.filter((workstreamId) => !actual.has(workstreamId));
  if (missing.length > 0) {
    throw new Error(`Director pushed graph updates omitted: ${missing.join(", ")}`);
  }
}

export function hasProjectedDirectorCreation(snapshot, workstreamId) {
  try {
    assertProjectedDirectorCreation(snapshot, workstreamId);
    return true;
  } catch {
    return false;
  }
}

export function assertProjectedDirectorCreation(snapshot, workstreamId) {
  const lane = snapshot.graphs.find((graph) => graph.workstreamId === "director");
  const workstream = snapshot.graphs.find((graph) => graph.workstreamId === workstreamId);
  if (!lane || !workstream) {
    throw new Error(
      `Director creation omitted graph scopes: ${JSON.stringify({
        graphs: snapshot.graphs.map((graph) => graph.workstreamId),
        workstreamId,
      })}`,
    );
  }
  const request = requiredGraphNode(
    lane,
    (node) =>
      node.kind === "user_goal" && node.publicSummary === "Director create workspace workstream.",
    "Director creation request",
  );
  const listed = requiredGraphNode(
    lane,
    (node) => node.kind === "action" && node.publicSummary.includes("workspace(s) are open"),
    "Director list_workspaces call",
  );
  const created = requiredGraphNode(
    lane,
    (node) =>
      node.kind === "action" && node.publicSummary === 'Started the workstream "Director root".',
    "Director create_workstream call",
  );
  const decision = requiredGraphNode(
    lane,
    (node) =>
      node.kind === "director_decision" &&
      node.publicSummary === 'Started the workstream "Director root".',
    "Director create decision",
  );
  const reply = requiredGraphNode(
    lane,
    (node) =>
      node.kind === "milestone" && node.publicSummary === "Created and selected Director root.",
    "Director creation reply",
  );
  for (const [from, to, label] of [
    [request, listed, "request to list_workspaces"],
    [listed, created, "list_workspaces to create_workstream"],
    [created, decision, "create_workstream to decision"],
    [decision, reply, "decision to reply"],
  ]) {
    if (
      !lane.edges.some(
        (edge) =>
          edge.kind === "followed_by" && edge.fromNodeId === from.id && edge.toNodeId === to.id,
      )
    ) {
      throw new Error(`Director creation graph omitted ${label}: ${JSON.stringify(lane.edges)}`);
    }
  }
  const anchor = requiredGraphNode(
    workstream,
    (node) =>
      node.kind === "workstream" &&
      node.status === "active" &&
      node.publicSummary === "Director root",
    "created workstream anchor",
  );
  // The anchor's provenance is the durable conversation record, so it cites a
  // committed event and never a Director fact.
  if (
    anchor.sourceEventIds.length === 0 ||
    anchor.sourceEventIds.some((eventId) => eventId.startsWith("director-fact:"))
  ) {
    throw new Error(
      `workstream anchor did not carry committed provenance: ${JSON.stringify(anchor)}`,
    );
  }
}

function requiredGraphNode(graph, matches, label) {
  const node = graph.nodes.find(matches);
  if (!node) {
    throw new Error(`${label} was missing: ${JSON.stringify(graph.nodes)}`);
  }
  return node;
}

export function comparableDirectorSnapshot(snapshot) {
  return {
    artifacts: snapshot.artifacts,
    graphs: snapshot.graphs,
    selectedWorkstreamId: snapshot.selectedWorkstreamId,
    unresolvedApprovals: snapshot.unresolvedApprovals,
    unresolvedResourceRequests: snapshot.unresolvedResourceRequests,
    workstreams: snapshot.workstreams,
  };
}

export function requiredString(value, label) {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label} was missing: ${JSON.stringify(value)}`);
  }
  return value;
}

export async function directorArtifactMarker(client, artifact) {
  const artifactId = requiredString(artifact?.id, "Director artifact");
  const source = await client.evaluate(
    `window.setta.conversations.readArtifact(${JSON.stringify({
      artifactId,
      conversationId: artifact.conversationId,
      workspaceId: artifact.workspaceId,
    })}).then((entry) => entry.document.source)`,
  );
  const marker = source.match(/[A-Za-z0-9_-]+-artifact\.png/u)?.[0];
  const mixedMarker = "The policy memo is ready for review.";
  return requiredString(
    marker ?? (source.includes(mixedMarker) ? mixedMarker : undefined),
    "Director artifact document marker",
  );
}

export function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} = ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
}

export function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} changed: ${JSON.stringify({ actual, expected }, null, 2)}`);
  }
}

export function assertExcludes(value, marker, label) {
  if (value.includes(marker)) {
    throw new Error(`${label} exposed ${JSON.stringify(marker)}`);
  }
}
