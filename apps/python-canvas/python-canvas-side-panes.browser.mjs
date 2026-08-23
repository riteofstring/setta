import assert from "node:assert/strict";

import { fetchCanonicalSnapshot } from "./browser-processes.mjs";
import {
  clickElementCenter,
  dragBetweenPoints,
  evaluate,
  navigate,
  visibleElementPoint,
  waitFor,
} from "./browser-page.mjs";

const shellSelector = '[data-workspace-shell="true"]';
const leadingPaneRegionSelector =
  '[data-workspace-shell-pane-region="leading"]';
const trailingPaneRegionSelector =
  '[data-workspace-shell-pane-region="trailing"]';
const leadingPaneSelector = '[data-pane="leading"]';
const trailingPaneSelector = '[data-pane="trailing"]';
const leadingRailSelector = '[data-workspace-shell-rail="leading"]';
const trailingRailSelector = '[data-workspace-shell-rail="trailing"]';
const centerSelector = ".setta-workspace-shell-center";
const inspectorTabSelector = '[data-workspace-shell-tab="trailing:inspector"]';
const leadingResizeSelector = '[data-workspace-shell-resize="leading"]';
const viewportSelector = ".react-flow__viewport";
const settledPaneConfiguration = {
  leading: {
    edgeCheck: "regionRect.x === 0",
    handleSelector: leadingResizeSelector,
    paneSelector: leadingPaneSelector,
    regionSelector: leadingPaneRegionSelector,
    title: "Outline",
  },
  trailing: {
    edgeCheck: "regionRect.right === window.innerWidth",
    handleSelector: null,
    paneSelector: trailingPaneSelector,
    regionSelector: trailingPaneRegionSelector,
    title: "Inspector",
  },
};

export async function exercisePythonCanvasSidePaneParity(
  client,
  backendOrigin,
  previewOrigin,
  snapshot,
) {
  const expectedOutline = expectedOutlineEntries(snapshot);
  const nestedSection = requireNestedSection(snapshot);

  await waitForWorkspaceShell(
    client,
    "the initial Python Canvas workspace shell",
  );
  const initialGeometry = await workspaceShellGeometry(client);
  assertApproximately(
    initialGeometry.leading.width,
    335,
    1,
    "The initial Outline pane did not use the package 335 px width.",
  );
  assertApproximately(
    initialGeometry.trailing.width,
    40,
    1,
    "The initial Inspector rail did not use the package 40 px closed width.",
  );
  assert.equal(
    initialGeometry.leading.visible,
    "true",
    "The initial Outline pane was not visible.",
  );
  assert.equal(
    initialGeometry.trailing.visible,
    "false",
    "The initial Inspector pane was unexpectedly open.",
  );
  assert.equal(
    initialGeometry.noHorizontalOverflow,
    true,
    "The initial workspace shell introduced horizontal page scrolling.",
  );
  assert.deepEqual(
    await visibleOutlineEntries(client),
    expectedOutline,
    "The Outline did not preserve the saved Python Canvas hierarchy order and nesting.",
  );

  const canonicalBefore = await fetchCanonicalSnapshot(backendOrigin);
  const mutationRequests = [];
  const previewOriginUrl = new URL(previewOrigin);
  await client.send("Network.enable");
  const unsubscribe = client.on("Network.requestWillBeSent", ({ request }) => {
    if (request === undefined || request.method === "GET") {
      return;
    }
    const requestUrl = new URL(request.url);
    if (
      requestUrl.origin === previewOriginUrl.origin &&
      (requestUrl.pathname === "/api/v2/project" ||
        requestUrl.pathname.startsWith("/api/v2/project/"))
    ) {
      mutationRequests.push({
        method: request.method,
        url: request.url,
      });
    }
  });

  try {
    await activateNestedOutlineSection(client, nestedSection);
    await openInspectorForSelection(client, nestedSection.name);
    await closeInspector(client);

    const resizedGeometry = await resizeLeadingPane(client);
    await reloadAndAssertPanePreference(
      client,
      previewOrigin,
      resizedGeometry.leading.width,
    );
    await exerciseNarrowViewportReconciliation(client);
  } finally {
    unsubscribe();
    await client.send("Network.disable");
  }

  const canonicalAfter = await fetchCanonicalSnapshot(backendOrigin);
  assert.deepEqual(
    canonicalAfter,
    canonicalBefore,
    "Pane-only interactions changed the canonical Python Canvas project.",
  );
  assert.equal(
    canonicalAfter.project.revision,
    canonicalBefore.project.revision,
    "Pane-only interactions changed the project revision.",
  );
  assert.deepEqual(
    canonicalAfter.generatedCode,
    canonicalBefore.generatedCode,
    "Pane-only interactions changed generated Python.",
  );
  assert.deepEqual(
    mutationRequests,
    [],
    "Pane-only interactions issued a non-GET request to the project route family.",
  );

  await restoreProductionViewport(client);
}

function expectedOutlineEntries(snapshot) {
  const sectionIds = new Map();
  const names = new Map();
  for (const callable of snapshot.callables) {
    sectionIds.set(callable.id, `python-canvas:callable:${callable.id}`);
    names.set(callable.id, callable.name);
  }
  for (const dictionary of snapshot.parameterDictionaries) {
    sectionIds.set(
      dictionary.id,
      `python-canvas:parameter-dictionary:${dictionary.id}`,
    );
    names.set(dictionary.id, dictionary.name);
  }
  const lists = new Map();
  for (const list of snapshot.lists) {
    sectionIds.set(list.id, `python-canvas:list:${list.id}`);
    names.set(list.id, list.name);
    lists.set(list.id, list);
  }

  const entries = [
    {
      id: "python-canvas:generated-python",
      level: 1,
      name: "Generated Python",
    },
  ];
  function appendSection(canonicalId, level) {
    const sectionId = sectionIds.get(canonicalId);
    const name = names.get(canonicalId);
    if (sectionId === undefined || name === undefined) {
      throw new Error(
        `The saved project has no section projection for ${canonicalId}.`,
      );
    }
    entries.push({ id: sectionId, level, name });
    const list = lists.get(canonicalId);
    for (const childId of list?.childSectionIds ?? []) {
      appendSection(childId, level + 1);
    }
  }

  for (const canonicalId of snapshot.topLevelSectionIds) {
    appendSection(canonicalId, 1);
  }
  return entries;
}

function requireNestedSection(snapshot) {
  const parent = snapshot.lists.find((list) => list.childSectionIds.length > 0);
  const canonicalId = parent?.childSectionIds[0];
  if (canonicalId === undefined) {
    throw new Error("The saved project has no nested List section child.");
  }
  const callable = snapshot.callables.find(
    (candidate) => candidate.id === canonicalId,
  );
  if (callable === undefined) {
    throw new Error(
      "The saved project has no nested callable for Outline activation.",
    );
  }
  return {
    id: `python-canvas:callable:${callable.id}`,
    name: callable.name,
  };
}

async function waitForWorkspaceShell(client, description) {
  await waitFor(
    client,
    description,
    `(() => {
      const shell = document.querySelector(${JSON.stringify(shellSelector)});
      const leading = document.querySelector(${JSON.stringify(leadingPaneRegionSelector)});
      const trailing = document.querySelector(${JSON.stringify(trailingPaneRegionSelector)});
      const center = document.querySelector(${JSON.stringify(centerSelector)});
      return shell instanceof HTMLElement && leading instanceof HTMLElement &&
        trailing instanceof HTMLElement && center instanceof HTMLElement &&
        shell.getBoundingClientRect().width > 0;
    })()`,
  );
}

async function workspaceShellGeometry(client) {
  return evaluate(
    client,
    `(() => {
      const required = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return null;
        const rect = element.getBoundingClientRect();
        return { height: rect.height, left: rect.left, width: rect.width };
      };
      const shell = required(${JSON.stringify(shellSelector)});
      const leading = required(${JSON.stringify(leadingPaneRegionSelector)});
      const trailing = required(${JSON.stringify(trailingPaneRegionSelector)});
      const center = required(${JSON.stringify(centerSelector)});
      const leadingPane = document.querySelector(${JSON.stringify(leadingPaneSelector)});
      const trailingPane = document.querySelector(${JSON.stringify(trailingPaneSelector)});
      if (shell === null || leading === null || trailing === null || center === null ||
        !(leadingPane instanceof HTMLElement) || !(trailingPane instanceof HTMLElement)) {
        return null;
      }
      return {
        center,
        leading: { ...leading, visible: leadingPane.dataset.visible },
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        shell,
        trailing: { ...trailing, visible: trailingPane.dataset.visible },
      };
    })()`,
  );
}

async function visibleOutlineEntries(client) {
  return evaluate(
    client,
    `Array.from(document.querySelectorAll('[data-workspace-outline-item]')).map((entry) => ({
      id: entry.getAttribute('data-workspace-outline-item'),
      level: Number(entry.getAttribute('aria-level')),
      name: entry.querySelector('.setta-workspace-outline-label')?.textContent?.trim() ?? '',
    }))`,
  );
}

async function activateNestedOutlineSection(client, section) {
  const selector = `[data-workspace-outline-item=${JSON.stringify(section.id)}]`;
  await clickElementCenter(
    client,
    selector,
    `the ${section.name} nested Outline entry`,
  );
  await waitFor(
    client,
    `the ${section.name} Outline selection`,
    `(() => {
      const entry = document.querySelector(${JSON.stringify(selector)});
      return entry instanceof HTMLElement && entry.getAttribute('aria-selected') === 'true';
    })()`,
  );
}

async function openInspectorForSelection(client, sectionName) {
  await clickElementCenter(
    client,
    inspectorTabSelector,
    "the Inspector workspace rail tab",
  );
  await waitFor(
    client,
    `the Inspector for ${sectionName}`,
    `(() => {
      const pane = document.querySelector(${JSON.stringify(trailingPaneSelector)});
      const inspector = document.querySelector('[data-inspector-branch="section"]');
      const heading = inspector?.querySelector('h3')?.textContent?.trim();
      return pane instanceof HTMLElement && pane.dataset.visible === 'true' &&
        heading === ${JSON.stringify(sectionName)};
    })()`,
  );
  await waitForSettledPane(client, "trailing");
}

async function closeInspector(client) {
  await clickElementCenter(
    client,
    inspectorTabSelector,
    "the open Inspector workspace rail tab",
  );
  await waitFor(
    client,
    "the closed Inspector pane",
    `document.querySelector(${JSON.stringify(trailingPaneSelector)})?.getAttribute('data-visible') === 'false'`,
  );
}

async function resizeLeadingPane(client) {
  await waitForSettledPane(client, "leading");
  const before = await workspaceShellGeometry(client);
  const viewportBefore = await viewportTranslation(client);
  if (before === null) {
    throw new Error(
      "The workspace shell was unavailable before leading-pane resize.",
    );
  }
  const start = await visibleElementPoint(
    client,
    leadingResizeSelector,
    "the Outline pane resize separator",
    { exactElementHit: true },
  );
  const requestedDelta = 60;
  await dragBetweenPoints(client, start, {
    x: start.x + requestedDelta,
    y: start.y,
  });
  await waitFor(
    client,
    "the committed Outline pane pointer resize",
    `(() => {
      const region = document.querySelector(${JSON.stringify(leadingPaneRegionSelector)});
      return region instanceof HTMLElement &&
        region.getBoundingClientRect().width >= ${String(before.leading.width + requestedDelta - 2)};
    })()`,
  );
  const after = await workspaceShellGeometry(client);
  if (after === null) {
    throw new Error(
      "The workspace shell was unavailable after leading-pane resize.",
    );
  }
  assertApproximately(
    after.leading.width - before.leading.width,
    requestedDelta,
    2,
    "The leading pane did not resize by the pointer delta.",
  );
  await waitFor(
    client,
    "the leading camera shift after the 100ms viewport transition",
    `(() => {
      const viewport = document.querySelector(${JSON.stringify(viewportSelector)});
      if (!(viewport instanceof HTMLElement)) return false;
      const transform = getComputedStyle(viewport).transform;
      const translation = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41;
      return Math.abs(translation - ${String(viewportBefore.x + requestedDelta)}) <= 2;
    })()`,
  );
  const viewportAfter = await viewportTranslation(client);
  assertApproximately(
    viewportAfter.x - viewportBefore.x,
    requestedDelta,
    2,
    "The canvas camera did not shift by the leading pane true-width delta.",
  );
  return after;
}

async function waitForSettledPane(client, pane) {
  const configuration = settledPaneConfiguration[pane];
  const handleExpression =
    configuration.handleSelector === null
      ? "null"
      : `document.querySelector(${JSON.stringify(configuration.handleSelector)})`;
  const requiresHandle = configuration.handleSelector !== null;
  await waitFor(
    client,
    `the settled ${configuration.title} pane`,
    `(() => {
      const region = document.querySelector(${JSON.stringify(configuration.regionSelector)});
      const shellPane = document.querySelector(${JSON.stringify(configuration.paneSelector)});
      const handle = ${handleExpression};
      if (!(region instanceof HTMLElement) || !(shellPane instanceof HTMLElement) ||
        shellPane.dataset.visible !== 'true' ||
        (${String(requiresHandle)} && !(handle instanceof HTMLElement))) {
        return false;
      }
      const regionRect = region.getBoundingClientRect();
      const handleRect = handle instanceof HTMLElement ? handle.getBoundingClientRect() : null;
      const transform = getComputedStyle(shellPane).transform;
      const matrix = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
      const handleCenter = handleRect === null ? null : handleRect.left + handleRect.width / 2;
      const identity = matrix.a === 1 && matrix.b === 0 && matrix.c === 0 &&
        matrix.d === 1 && matrix.e === 0 && matrix.f === 0;
      const handleInViewport = handleCenter === null ||
        (handleCenter >= 0 && handleCenter <= window.innerWidth);
      return ${configuration.edgeCheck} && identity && handleInViewport;
    })()`,
  );
}

async function viewportTranslation(client) {
  const translation = await evaluate(
    client,
    `(() => {
      const viewport = document.querySelector(${JSON.stringify(viewportSelector)});
      if (!(viewport instanceof HTMLElement)) return null;
      const transform = getComputedStyle(viewport).transform;
      return { x: transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41 };
    })()`,
  );
  if (translation === null) {
    throw new Error(
      "The workspace viewport was unavailable for the leading camera shift.",
    );
  }
  return translation;
}

async function reloadAndAssertPanePreference(client, previewOrigin, width) {
  await navigate(client, previewOrigin);
  await waitForWorkspaceShell(
    client,
    "the reloaded Python Canvas workspace shell",
  );
  await waitFor(
    client,
    "the persisted leading pane width",
    `(() => {
      const leading = document.querySelector(${JSON.stringify(leadingPaneRegionSelector)});
      const trailing = document.querySelector(${JSON.stringify(trailingPaneRegionSelector)});
      const trailingPane = document.querySelector(${JSON.stringify(trailingPaneSelector)});
      return leading instanceof HTMLElement && trailing instanceof HTMLElement &&
        trailingPane instanceof HTMLElement &&
        Math.abs(leading.getBoundingClientRect().width - ${String(width)}) <= 2 &&
        Math.abs(trailing.getBoundingClientRect().width - 40) <= 1 &&
        trailingPane.dataset.visible === 'false';
    })()`,
  );
}

async function exerciseNarrowViewportReconciliation(client) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: 900,
    mobile: false,
    width: 640,
  });
  await waitFor(
    client,
    "the constrained 640 px workspace shell",
    `window.innerWidth === 640 && document.querySelector(${JSON.stringify(shellSelector)}) instanceof HTMLElement`,
  );
  await clickElementCenter(
    client,
    inspectorTabSelector,
    "the constrained Inspector workspace rail tab",
  );
  await waitFor(
    client,
    "Inspector opening with the constrained Outline pane closed",
    `(() => {
      const leading = document.querySelector(${JSON.stringify(leadingPaneSelector)});
      const trailing = document.querySelector(${JSON.stringify(trailingPaneSelector)});
      return leading instanceof HTMLElement && trailing instanceof HTMLElement &&
        leading.dataset.visible === 'false' && trailing.dataset.visible === 'true';
    })()`,
  );
  await waitForSettledPane(client, "trailing");
  const reachability = await evaluate(
    client,
    `(() => {
      const reachable = (selector) => {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + Math.min(rect.height / 2, 24),
        );
        return hit !== null && element.contains(hit);
      };
      const center = document.querySelector(${JSON.stringify(centerSelector)});
      const leadingRail = document.querySelector(${JSON.stringify(leadingRailSelector)});
      const trailingPane = document.querySelector(${JSON.stringify(trailingPaneSelector)});
      let centerReachable = false;
      let exposedCenterStrip = 0;
      if (center instanceof HTMLElement && leadingRail instanceof HTMLElement &&
        trailingPane instanceof HTMLElement) {
        const centerRect = center.getBoundingClientRect();
        const leadingRailRect = leadingRail.getBoundingClientRect();
        const trailingPaneRect = trailingPane.getBoundingClientRect();
        exposedCenterStrip = trailingPaneRect.left - leadingRailRect.right;
        const stripMidpoint = leadingRailRect.right + exposedCenterStrip / 2;
        const hit = document.elementFromPoint(
          stripMidpoint,
          centerRect.top + centerRect.height / 2,
        );
        centerReachable = exposedCenterStrip > 0 && hit !== null && center.contains(hit);
      }
      return {
        centerReachable,
        centerWidth: center instanceof HTMLElement ? center.getBoundingClientRect().width : 0,
        exposedCenterStrip,
        leadingRailReachable: reachable(${JSON.stringify(leadingRailSelector)}),
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        trailingRailReachable: reachable(${JSON.stringify(trailingRailSelector)}),
      };
    })()`,
  );
  assert.equal(
    reachability.noHorizontalOverflow,
    true,
    "The constrained workspace shell introduced horizontal page scrolling.",
  );
  assert.equal(
    reachability.leadingRailReachable,
    true,
    "The constrained leading rail was not pointer reachable.",
  );
  assert.equal(
    reachability.trailingRailReachable,
    true,
    "The constrained trailing rail was not pointer reachable.",
  );
  assert.ok(
    reachability.exposedCenterStrip > 0,
    "The constrained Inspector left no exposed center strip between the rails.",
  );
  assert.ok(
    reachability.centerWidth > 0 && reachability.centerReachable,
    "The constrained workspace shell center was not reachable.",
  );
}

async function restoreProductionViewport(client) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: 900,
    mobile: false,
    width: 1_440,
  });
  await waitFor(
    client,
    "the restored production viewport",
    "window.innerWidth === 1440",
  );
}

function assertApproximately(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message} Expected ${String(expected)} ± ${String(tolerance)}; received ${String(actual)}.`,
  );
}
