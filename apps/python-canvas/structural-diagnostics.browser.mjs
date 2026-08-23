import assert from "node:assert/strict";

import { fetchCanonicalSnapshot } from "./browser-processes.mjs";
import { callableSectionSelector } from "./param-dict-list.browser-support.mjs";
import { generatedPythonEditorSelector } from "./python-target.browser.mjs";
import {
  clickElementCenter,
  evaluate,
  labeledSelector,
  rightClickPoint,
  visibleElementPoint,
  waitFor,
} from "./browser-page.mjs";

const diagnosticsGateKey = "__pythonCanvasDiagnosticsRevalidationGate";
const pendingCallableKind = "python-canvas.callable-pending";

export function matchesStructuralDiagnosticsMutation(
  operation,
  method,
  pathname,
) {
  if (operation === "create") {
    return method === "POST" && pathname === "/api/v2/project/callables";
  }
  if (operation === "delete") {
    return (
      method === "POST" &&
      pathname.startsWith("/api/v2/project/callables/") &&
      pathname.endsWith("/delete")
    );
  }
  return false;
}

export async function exerciseStructuralDiagnosticsLifecycle(
  client,
  backendOrigin,
) {
  const beforeCreate = await fetchCanonicalSnapshot(backendOrigin);
  assert.deepEqual(
    beforeCreate.callables,
    [],
    "The structural diagnostics lifecycle requires a fresh callable forest.",
  );

  await installDiagnosticsResponseGate(client, "create");
  try {
    await createCallable(client);
    const created = await waitForLaggingMutationResponse(client, "create");
    const createdCallable = created.callables.at(-1);
    assert.ok(
      createdCallable,
      "Creating a callable returned no canonical section.",
    );
    const generatedLine = addedGeneratedLine(beforeCreate, created);
    const sectionSelector = callableSectionSelector(createdCallable.id);

    await waitForCanonicalCreate(client, sectionSelector, generatedLine);
    const beforeCreateResponseHold = await readCreatePresentation(
      client,
      sectionSelector,
      generatedLine,
    );
    await waitForHeldDiagnosticsResponse(client, "create");
    const whileCreateResponseHeld = await readCreatePresentation(
      client,
      sectionSelector,
      generatedLine,
    );
    assertCreatePresentation(beforeCreateResponseHold, whileCreateResponseHeld);
    await releaseDiagnosticsResponse(client, "create");
    await waitForDiagnosticsSettlement(client, "create");

    await disposeDiagnosticsResponseGate(client);
    await installDiagnosticsResponseGate(client, "delete");
    try {
      const beforeDelete = await readCreatePresentation(
        client,
        sectionSelector,
        generatedLine,
      );
      await clickElementCenter(
        client,
        `${sectionSelector} ${labeledSelector("Delete section")}`,
        "the canonical callable delete control",
      );
      const deleted = await waitForLaggingMutationResponse(client, "delete");
      assert.equal(
        deleted.callables.some(
          (callable) => callable.id === createdCallable.id,
        ),
        false,
        "Deleting a callable retained it in the canonical mutation response.",
      );
      assert.notEqual(
        deleted.generatedCode.body,
        created.generatedCode.body,
        "Deleting a callable did not change Generated Python before diagnostics settled.",
      );

      await waitForCanonicalDelete(client, sectionSelector, generatedLine);
      await waitForHeldDiagnosticsResponse(client, "delete");
      const whileDeleteResponseHeld = await readDeletePresentation(
        client,
        sectionSelector,
        generatedLine,
      );
      assertDeletePresentation(beforeDelete, whileDeleteResponseHeld);
      await releaseDiagnosticsResponse(client, "delete");
      await waitForDiagnosticsSettlement(client, "delete");
    } finally {
      await disposeDiagnosticsResponseGate(client);
    }
  } finally {
    await disposeDiagnosticsResponseGate(client);
  }
}

async function createCallable(client) {
  await rightClickPoint(
    client,
    await visibleElementPoint(
      client,
      '.react-flow__pane[aria-label="Workspace canvas background"]',
      "the blank workspace pane",
    ),
  );
  await waitFor(
    client,
    "the Python callable creation menu item",
    `(() => {
      const menu = document.querySelector(${JSON.stringify(labeledSelector("Create a workspace section"))});
      const item = Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? [])
        .find((candidate) => candidate.textContent?.trim() === "Python callable");
      return item instanceof HTMLElement && item.getAttribute("aria-disabled") !== "true";
    })()`,
  );
  const clicked = await evaluate(
    client,
    `(() => {
      const menu = document.querySelector(${JSON.stringify(labeledSelector("Create a workspace section"))});
      const item = Array.from(menu?.querySelectorAll('[role="menuitem"]') ?? [])
        .find((candidate) => candidate.textContent?.trim() === "Python callable");
      if (!(item instanceof HTMLElement) || item.getAttribute("aria-disabled") === "true") {
        return false;
      }
      item.click();
      return true;
    })()`,
  );
  assert.equal(clicked, true, "The Python callable creation item is missing.");
}

async function installDiagnosticsResponseGate(client, operation) {
  const installed = await evaluate(
    client,
    `(() => {
      const gateKey = ${JSON.stringify(diagnosticsGateKey)};
      if (globalThis[gateKey] !== undefined) return false;
      const originalFetch = window.fetch;
      const matchesMutation = ${matchesStructuralDiagnosticsMutation.toString()};
      let release;
      const held = new Promise((resolve) => { release = resolve; });
      const gate = {
        freshResponseDelivered: false,
        heldSnapshot: null,
        intercepted: false,
        latestDeliveredSnapshot: null,
        mutationResponseSeen: false,
        mutationSnapshot: null,
        operation: ${JSON.stringify(operation)},
        originalFetch,
        release: () => {
          gate.released = true;
          release(true);
        },
        released: false,
      };
      globalThis[gateKey] = gate;
      window.fetch = async (...args) => {
        const input = args[0];
        const requestUrl = typeof input === "string" || input instanceof URL
          ? String(input)
          : input.url;
        const method = String(
          args[1]?.method ?? (input instanceof Request ? input.method : "GET"),
        ).toUpperCase();
        const path = new URL(requestUrl, location.href).pathname;
        const isProjectGet = method === "GET" && path === "/api/v2/project";
        const isMutation = matchesMutation(gate.operation, method, path);
        const response = await originalFetch.apply(window, args);
        if (!isMutation && !(gate.mutationResponseSeen && isProjectGet)) {
          return response;
        }
        const snapshot = await response.clone().json().catch(() => null);
        if (isMutation) {
          gate.mutationResponseSeen = true;
          gate.mutationSnapshot = snapshot;
          return response;
        }
        if (!gate.intercepted) {
          gate.intercepted = true;
          gate.heldSnapshot = snapshot;
          await held;
        }
        gate.latestDeliveredSnapshot = snapshot;
        if (snapshot?.diagnosticsRevision === snapshot?.project?.revision) {
          gate.freshResponseDelivered = true;
        }
        return response;
      };
      return true;
    })()`,
  );
  assert.equal(
    installed,
    true,
    `The ${operation} diagnostics response gate was already installed.`,
  );
}

async function waitForLaggingMutationResponse(client, operation) {
  await waitFor(
    client,
    `the lagging canonical ${operation} response`,
    `(() => {
      const gate = globalThis[${JSON.stringify(diagnosticsGateKey)}];
      const snapshot = gate?.mutationSnapshot;
      return gate?.mutationResponseSeen === true &&
        Number.isInteger(snapshot?.project?.revision) &&
        Number.isInteger(snapshot?.diagnosticsRevision) &&
        snapshot.diagnosticsRevision < snapshot.project.revision;
    })()`,
  );
  const snapshot = await evaluate(
    client,
    `globalThis[${JSON.stringify(diagnosticsGateKey)}]?.mutationSnapshot ?? null`,
  );
  assert.ok(snapshot, `The ${operation} response carried no project snapshot.`);
  return snapshot;
}

async function waitForHeldDiagnosticsResponse(client, operation) {
  await waitFor(
    client,
    `the held ${operation} diagnostics revalidation response`,
    `globalThis[${JSON.stringify(diagnosticsGateKey)}]?.intercepted === true`,
  );
}

async function releaseDiagnosticsResponse(client, operation) {
  const released = await evaluate(
    client,
    `(() => {
      const gate = globalThis[${JSON.stringify(diagnosticsGateKey)}];
      if (gate?.intercepted !== true || gate.released === true) return false;
      gate.release();
      return true;
    })()`,
  );
  assert.equal(
    released,
    true,
    `The ${operation} diagnostics revalidation response was not held.`,
  );
}

async function waitForDiagnosticsSettlement(client, operation) {
  await waitFor(
    client,
    `the released ${operation} diagnostics settlement`,
    `globalThis[${JSON.stringify(diagnosticsGateKey)}]?.freshResponseDelivered === true`,
  );
  const settled = await evaluate(
    client,
    `globalThis[${JSON.stringify(diagnosticsGateKey)}]?.latestDeliveredSnapshot ?? null`,
  );
  assert.equal(
    settled?.diagnosticsRevision,
    settled?.project?.revision,
    `The released ${operation} response did not settle diagnostics freshness.`,
  );
}

async function disposeDiagnosticsResponseGate(client) {
  await evaluate(
    client,
    `(() => {
      const gateKey = ${JSON.stringify(diagnosticsGateKey)};
      const gate = globalThis[gateKey];
      if (gate === undefined) return;
      gate.release();
      window.fetch = gate.originalFetch;
      delete globalThis[gateKey];
    })()`,
  );
}

async function waitForCanonicalCreate(client, sectionSelector, generatedLine) {
  await waitFor(
    client,
    "the canonical callable and Generated Python before diagnostics revalidation",
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector)});
      const generated = document.querySelector(${JSON.stringify(`${generatedPythonEditorSelector} [role="textbox"]`)});
      return section instanceof HTMLElement && generated instanceof HTMLElement &&
        (generated.textContent ?? "").includes(${JSON.stringify(generatedLine)});
    })()`,
  );
}

async function waitForCanonicalDelete(client, sectionSelector, generatedLine) {
  await waitFor(
    client,
    "the canonical callable deletion and Generated Python before diagnostics revalidation",
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector)});
      const generated = document.querySelector(${JSON.stringify(`${generatedPythonEditorSelector} [role="textbox"]`)});
      return section === null && generated instanceof HTMLElement &&
        !(generated.textContent ?? "").includes(${JSON.stringify(generatedLine)});
    })()`,
  );
}

async function readCreatePresentation(client, sectionSelector, generatedLine) {
  return evaluate(
    client,
    presentationExpression(sectionSelector, generatedLine),
  );
}

async function readDeletePresentation(client, sectionSelector, generatedLine) {
  return evaluate(
    client,
    presentationExpression(sectionSelector, generatedLine),
  );
}

function presentationExpression(sectionSelector, generatedLine) {
  return `(() => {
    const section = document.querySelector(${JSON.stringify(sectionSelector)});
    const pending = document.querySelector(${JSON.stringify(`[data-section-type="${pendingCallableKind}"]`)});
    const callable = section?.querySelector(".python-canvas-callable-section");
    const field = section?.querySelector('[data-workspace-section-field="true"]');
    const editor = field?.querySelector('[role="textbox"]');
    const lock = section?.querySelector('button[aria-label="Lock position and size"]');
    const unlock = section?.querySelector('button[aria-label="Unlock position and size"]');
    const generated = document.querySelector(${JSON.stringify(`${generatedPythonEditorSelector} [role="textbox"]`)});
    const disabled = Array.from(section?.querySelectorAll("button, [role=button]") ?? []).some((element) =>
      element.hasAttribute("disabled") ||
      element.getAttribute("aria-disabled") === "true" ||
      element.getAttribute("data-disabled") === "" ||
      element.getAttribute("data-disabled") === "true",
    );
    const visibleAlert = [...document.querySelectorAll('[role="alert"]')].some((element) => {
      const rect = element.getBoundingClientRect();
      return (element.textContent ?? "").trim() !== "" && rect.width > 1 && rect.height > 1;
    });
    const mutationError = document.querySelector("#python-canvas-mutation-error");
    return {
      callableBusy: callable?.getAttribute("aria-busy") === "true",
      editorDisabled: editor?.getAttribute("aria-disabled") === "true",
      fieldDisabled: field?.getAttribute("data-disabled") !== "false",
      generatedHeight: generated instanceof HTMLElement ? generated.clientHeight : null,
      generatedLinePresent: generated instanceof HTMLElement && (generated.textContent ?? "").includes(${JSON.stringify(generatedLine)}),
      generatedWidth: generated instanceof HTMLElement ? generated.clientWidth : null,
      lockPresent: lock instanceof HTMLElement,
      mutationError: (mutationError?.textContent ?? "").trim(),
      overlayPresent: section?.querySelector('[data-python-canvas-parameter-pending="true"]') !== null,
      pendingPresent: pending !== null,
      sectionHeight: section instanceof HTMLElement ? section.clientHeight : null,
      sectionPresent: section instanceof HTMLElement,
      sectionWidth: section instanceof HTMLElement ? section.clientWidth : null,
      spinnerPresent: document.querySelector(".python-canvas-parameter-spinner") !== null,
      statusBusy: document.querySelector('[role="status"]')?.getAttribute("aria-busy") === "true",
      toolbarDisabled: disabled,
      unlockPresent: unlock instanceof HTMLElement,
      visibleAlert,
    };
  })()`;
}

function assertCreatePresentation(beforeHeld, whileHeld) {
  assert.equal(
    whileHeld.sectionPresent,
    true,
    "The canonical callable is not visible.",
  );
  assert.equal(
    whileHeld.generatedLinePresent,
    true,
    "Generated Python did not show the canonical callable mutation.",
  );
  assert.equal(
    whileHeld.pendingPresent,
    false,
    "A provisional callable pane remained visible.",
  );
  assert.equal(
    whileHeld.lockPresent,
    true,
    "Diagnostics revalidation removed the ordinary lock-position control.",
  );
  assert.equal(
    whileHeld.unlockPresent,
    false,
    "Diagnostics revalidation locked the callable section.",
  );
  assert.equal(
    whileHeld.toolbarDisabled,
    false,
    "Diagnostics revalidation disabled the callable toolbar.",
  );
  assert.equal(
    whileHeld.callableBusy,
    false,
    "Diagnostics revalidation marked the callable busy.",
  );
  assert.equal(
    whileHeld.fieldDisabled,
    false,
    "Diagnostics revalidation disabled the callable field.",
  );
  assert.equal(
    whileHeld.editorDisabled,
    false,
    "Diagnostics revalidation disabled the callable editor.",
  );
  assert.equal(
    whileHeld.overlayPresent,
    false,
    "Diagnostics revalidation showed a callable overlay.",
  );
  assert.equal(
    whileHeld.spinnerPresent,
    false,
    "Diagnostics revalidation showed a spinner.",
  );
  assert.equal(
    whileHeld.statusBusy,
    false,
    "Diagnostics revalidation announced a pending mutation.",
  );
  assert.equal(
    whileHeld.mutationError,
    "",
    "Diagnostics revalidation showed a mutation error.",
  );
  assert.equal(
    whileHeld.visibleAlert,
    false,
    "Diagnostics revalidation showed a visible error panel.",
  );
  assert.deepEqual(
    { height: whileHeld.sectionHeight, width: whileHeld.sectionWidth },
    { height: 150, width: 250 },
    "The canonical callable geometry does not match main.",
  );
  assert.deepEqual(
    {
      generatedHeight: whileHeld.generatedHeight,
      generatedWidth: whileHeld.generatedWidth,
      sectionHeight: whileHeld.sectionHeight,
      sectionWidth: whileHeld.sectionWidth,
    },
    {
      generatedHeight: beforeHeld.generatedHeight,
      generatedWidth: beforeHeld.generatedWidth,
      sectionHeight: beforeHeld.sectionHeight,
      sectionWidth: beforeHeld.sectionWidth,
    },
    "Holding diagnostics revalidation changed section geometry.",
  );
}

function assertDeletePresentation(beforeDelete, whileHeld) {
  assert.equal(
    whileHeld.sectionPresent,
    false,
    "The deleted callable reappeared.",
  );
  assert.equal(
    whileHeld.generatedLinePresent,
    false,
    "Generated Python retained the deleted callable while diagnostics were held.",
  );
  assert.equal(
    whileHeld.pendingPresent,
    false,
    "Deleting a callable showed a provisional pane.",
  );
  assert.equal(
    whileHeld.overlayPresent,
    false,
    "Deleting a callable showed an overlay.",
  );
  assert.equal(
    whileHeld.spinnerPresent,
    false,
    "Deleting a callable showed a spinner.",
  );
  assert.equal(
    whileHeld.statusBusy,
    false,
    "Deleting a callable announced a pending mutation.",
  );
  assert.equal(
    whileHeld.mutationError,
    "",
    "Deleting a callable showed a mutation error.",
  );
  assert.equal(
    whileHeld.visibleAlert,
    false,
    "Deleting a callable showed a visible error panel.",
  );
  assert.deepEqual(
    {
      generatedHeight: whileHeld.generatedHeight,
      generatedWidth: whileHeld.generatedWidth,
    },
    {
      generatedHeight: beforeDelete.generatedHeight,
      generatedWidth: beforeDelete.generatedWidth,
    },
    "Holding delete diagnostics changed Generated Python geometry.",
  );
}

function addedGeneratedLine(before, after) {
  const priorLines = new Set(before.generatedCode.body.split("\n"));
  const line = after.generatedCode.body
    .split("\n")
    .find((candidate) => candidate.trim() !== "" && !priorLines.has(candidate));
  assert.ok(
    line,
    "Creating a callable added no visible Generated Python line.",
  );
  return line;
}
