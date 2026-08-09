import assert from "node:assert/strict";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { repositoryRoot, runPnpm } from "./lib/process.mjs";

const documentRootCount = 128;
const documentChildrenPerRoot = 7;
const sectionSiblingCount = 512;
const sectionBlockSize = 64;
const collisionCandidateCount = 256;
const itemCount = 2_000;
const deepItemDepth = 2_048;

runPnpm(["run", "build:package"]);

const distDirectory = path.join(repositoryRoot, "packages/workspace/dist");
const core = await import(pathToFileURL(path.join(distDirectory, "core.js")).href);
const testing = await import(pathToFileURL(path.join(distDirectory, "testing.js")).href);

function fixedSize(width, height) {
  return {
    height: { mode: "fixed", value: height },
    width: { mode: "fixed", value: width },
  };
}

function milestoneSection(id, childIds, index) {
  return {
    childLayout:
      childIds.length === 0
        ? null
        : {
            orientation: index % 2 === 0 ? "vertical" : "horizontal",
            overflow: index % 3 === 0 ? "scroll" : "grow",
            sectionIds: childIds,
          },
    data: { index },
    id,
    isMinimized: false,
    kind: "performance-fixture",
    positionAndSizeLocked: false,
    presentation: {
      accentColor: null,
      chrome: "default",
      tagColor: null,
    },
    size: fixedSize(320, 240),
    title: `Performance section ${String(index)}`,
  };
}

function createMilestoneDocument() {
  const rootSections = [];
  const sections = {};
  let sectionIndex = 0;
  for (let rootIndex = 0; rootIndex < documentRootCount; rootIndex += 1) {
    const rootId = `document-root-${String(rootIndex)}`;
    const childIds = Array.from(
      { length: documentChildrenPerRoot },
      (_, childIndex) => `${rootId}-child-${String(childIndex)}`,
    );
    rootSections.push({
      position: { x: (rootIndex % 16) * 360, y: Math.floor(rootIndex / 16) * 300 },
      sectionId: rootId,
    });
    sections[rootId] = milestoneSection(rootId, childIds, sectionIndex);
    sectionIndex += 1;
    for (const childId of childIds) {
      sections[childId] = milestoneSection(childId, [], sectionIndex);
      sectionIndex += 1;
    }
  }
  return {
    rootSections,
    schemaVersion: core.WORKSPACE_DOCUMENT_SCHEMA_VERSION,
    sections,
    viewport: { x: -240, y: -120, zoom: 1.25 },
  };
}

function createSectionHierarchy() {
  const sourceParentId = "section-parent-source";
  const destinationParentId = "section-parent-destination";
  const sourceIds = Array.from(
    { length: sectionSiblingCount },
    (_, index) => `source-child-${String(index)}`,
  );
  const destinationIds = Array.from(
    { length: sectionSiblingCount },
    (_, index) => `destination-child-${String(index)}`,
  );
  const parentByChild = Object.fromEntries([
    [sourceParentId, null],
    [destinationParentId, null],
    ...sourceIds.map((sectionId) => [sectionId, sourceParentId]),
    ...destinationIds.map((sectionId) => [sectionId, destinationParentId]),
  ]);
  return {
    destinationParentId,
    hierarchy: {
      childrenByParent: {
        [destinationParentId]: destinationIds,
        [sourceParentId]: sourceIds,
      },
      parentByChild,
      rootPositions: {
        [destinationParentId]: { x: 720, y: 0 },
        [sourceParentId]: { x: 0, y: 0 },
      },
      rootSectionIds: [sourceParentId, destinationParentId],
    },
    selectedIds: sourceIds.slice(192, 192 + sectionBlockSize).reverse(),
  };
}

function createSortingFixture() {
  const ids = Array.from(
    { length: sectionSiblingCount },
    (_, index) => `preview-child-${String(index)}`,
  );
  const verticalRectsById = Object.fromEntries(
    ids.map((id, index) => [id, { height: 40, width: 320, x: 0, y: index * 48 }]),
  );
  const horizontalRectsById = Object.fromEntries(
    ids.map((id, index) => [id, { height: 160, width: 80, x: index * 88, y: 0 }]),
  );
  return { horizontalRectsById, ids, verticalRectsById };
}

function createCollisionFixture() {
  const candidates = Array.from({ length: collisionCandidateCount }, (_, index) => ({
    id: `collision-target-${String(index)}`,
    intersectionArea: 2_000 - index,
    orientation: index % 2 === 0 ? "vertical" : "horizontal",
    rect: { height: 40, width: 320, x: index * 4, y: index * 3 },
    sortableContainerId: `collision-parent-${String(index % 8)}`,
    triggerDistance: index - 48,
  }));
  return {
    candidates,
    parentByChild: Object.fromEntries(candidates.map(({ id }) => [id, null])),
  };
}

function createPlacementRects() {
  return Array.from({ length: 80 }, (_, index) => ({
    height: 88,
    width: 128,
    x: 24 + (index % 10) * 156,
    y: 24 + Math.floor(index / 10) * 116,
  }));
}

function createFlatItemTree() {
  const itemIds = Array.from({ length: itemCount }, (_, index) => `item-${String(index)}`);
  return {
    childrenByParent: { "item-root": itemIds },
    itemIds,
    rootId: "item-root",
  };
}

function createDeepItemTree() {
  const itemIds = Array.from({ length: deepItemDepth }, (_, index) => `deep-item-${String(index)}`);
  const entries = [["deep-root", [itemIds[0]]]];
  for (let index = 0; index < itemIds.length - 1; index += 1) {
    entries.push([itemIds[index], [itemIds[index + 1]]]);
  }
  return {
    childrenByParent: Object.fromEntries(entries),
    itemIds,
    rootId: "deep-root",
  };
}

function checksum(previous, value, iteration) {
  return (previous + value * (iteration + 1)) % 1_000_000_007;
}

function measure(iterations, action) {
  const warmupIterations = Math.min(5, iterations);
  for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
    action(iteration);
  }
  let observationChecksum = 0;
  const startedAt = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    observationChecksum = checksum(observationChecksum, action(iteration), iteration);
  }
  return {
    checksum: observationChecksum,
    iterations,
    totalMs: Number((performance.now() - startedAt).toFixed(3)),
  };
}

const document = createMilestoneDocument();
const documentSectionCount = Object.keys(document.sections).length;
assert.equal(documentSectionCount, 1_024);
core.validateWorkspaceDocument(document);

const serializedDocument = core.serializeWorkspaceDocument(document);
const documentTraversal = measure(40, () => {
  core.validateWorkspaceDocument(document);
  const order = core.getWorkspaceNavigationOrder(document);
  assert.equal(order.length, documentSectionCount);
  return order.length + (order.at(-1)?.length ?? 0);
});
const documentRoundTrip = measure(20, () => {
  const parsed = core.parseWorkspaceDocument(serializedDocument);
  return Object.keys(parsed.sections).length + serializedDocument.length;
});

const sectionFixture = createSectionHierarchy();
const sectionPlanAndApply = measure(200, () => {
  const decision = testing.planSectionMove({
    destination: {
      index: 256,
      parentId: sectionFixture.destinationParentId,
      topLevelPositions: null,
    },
    hierarchy: sectionFixture.hierarchy,
    mode: "free",
    selectedIds: sectionFixture.selectedIds,
  });
  assert.equal(decision.status, "planned");
  const applied = testing.applySectionMovePlan(sectionFixture.hierarchy, decision.plan);
  return (
    decision.plan.sectionIds.length +
    (applied.childrenByParent[sectionFixture.destinationParentId]?.length ?? 0)
  );
});

const sortingFixture = createSortingFixture();
const sectionPreview = measure(120, (iteration) => {
  const horizontal = iteration % 2 !== 0;
  const preview = testing.resolveSortingPreview({
    activeId: sortingFixture.ids[64],
    ids: sortingFixture.ids,
    orientation: horizontal ? "horizontal" : "vertical",
    pastMidpoint: iteration % 3 !== 0,
    rectsById: horizontal ? sortingFixture.horizontalRectsById : sortingFixture.verticalRectsById,
    targetId: sortingFixture.ids[448],
  });
  assert.ok(preview);
  return preview.destinationIndex + Object.keys(preview.transformsById).length;
});

const collisionFixture = createCollisionFixture();
let collisionState = testing.EMPTY_COLLISION_TRACKER_STATE;
const collisionResolution = measure(1_000, (iteration) => {
  const resolution = testing.resolveCollisionFrame({
    activeRect: { height: 96, width: 320, x: iteration % 80, y: iteration % 64 },
    candidates: collisionFixture.candidates,
    parentByChild: collisionFixture.parentByChild,
    pointer: { x: iteration % 640, y: iteration % 480 },
    previousState: collisionState,
  });
  collisionState = resolution.state;
  assert.ok(resolution.candidate);
  return Number(resolution.candidate.id.slice("collision-target-".length)) + 1;
});

const placementRects = createPlacementRects();
const smartPlacement = measure(60, (iteration) => {
  const result = core.planWorkspaceSectionPlacement({
    grid: [16, 16],
    padding: 24,
    rootRects: placementRects,
    size: { height: 160, width: 240 },
    viewport: { height: 960, width: 1_600, x: iteration % 3, y: -(iteration % 5) },
  });
  return Math.abs(result.position.x) + Math.abs(result.position.y);
});

const flatItemTree = createFlatItemTree();
const movingItemIds = flatItemTree.itemIds.slice(400, 400 + sectionBlockSize);
const itemPlanAndApply = measure(100, () => {
  const decision = core.planSortableItemMove({
    activeItemId: movingItemIds[0],
    destinationIndex: 1_200,
    destinationParentId: flatItemTree.rootId,
    selectedItemIds: movingItemIds,
    tree: flatItemTree,
  });
  assert.equal(decision.status, "planned");
  const applied = core.applySortableItemMove(flatItemTree, decision.plan);
  return decision.plan.itemIds.length + applied.childrenByParent[flatItemTree.rootId].length;
});

const deepItemTree = createDeepItemTree();
const deepItemValidation = measure(30, () => {
  core.validateSortableItemTree(deepItemTree);
  const order = core.getSortableItemOrder(deepItemTree);
  assert.equal(order.length, deepItemDepth);
  return order.length + (order.at(-1)?.length ?? 0);
});

const observations = {
  collisionResolution,
  deepItemValidation,
  documentRoundTrip,
  documentTraversal,
  itemPlanAndApply,
  sectionPlanAndApply,
  sectionPreview,
  smartPlacement,
};

console.log(
  JSON.stringify(
    {
      environment: {
        architecture: process.arch,
        node: process.version,
        platform: process.platform,
      },
      fixtures: {
        collisionCandidates: collisionCandidateCount,
        deepItemDepth,
        documentChildrenPerRoot,
        documentRoots: documentRootCount,
        documentSections: documentSectionCount,
        flatItems: itemCount,
        sectionBlockSize,
        sectionSiblingsPerParent: sectionSiblingCount,
      },
      observations,
      suiteChecksum: Object.values(observations).reduce(
        (total, observation) => (total + observation.checksum) % 1_000_000_007,
        0,
      ),
    },
    null,
    2,
  ),
);
