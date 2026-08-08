import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { repositoryRoot, runPnpm } from "./lib/process.mjs";

const rootCount = 200;
const childrenPerRoot = 9;
const queryIterations = 500;
const updateIterations = 1_000;

runPnpm(["run", "build:package"]);
const geometryModuleUrl = pathToFileURL(
  path.join(repositoryRoot, "packages/workspace/dist/internal/geometry-index.js"),
);
const { WorkspaceGeometryIndex } = await import(geometryModuleUrl.href);
const index = new WorkspaceGeometryIndex();
const registrations = [];
let notifications = 0;
index.subscribe(() => {
  notifications += 1;
});

const registrationStart = performance.now();
for (let rootIndex = 0; rootIndex < rootCount; rootIndex += 1) {
  const rootId = `root-${String(rootIndex)}`;
  registrations.push({
    frame: {
      sectionId: rootId,
      parentSectionId: null,
      depth: 0,
      order: rootIndex,
      rect: { x: rootIndex * 32, y: rootIndex * 18, width: 300, height: 220 },
    },
  });
  for (let childIndex = 0; childIndex < childrenPerRoot; childIndex += 1) {
    registrations.push({
      frame: {
        sectionId: `${rootId}-child-${String(childIndex)}`,
        parentSectionId: rootId,
        depth: 1,
        order: childIndex,
        rect: {
          x: rootIndex * 32 + 20,
          y: rootIndex * 18 + 24 + childIndex * 18,
          width: 240,
          height: 40,
        },
      },
    });
  }
}
for (const entry of registrations) {
  entry.registration = index.register(entry.frame);
}
const registrationMs = performance.now() - registrationStart;

let marqueeMatchChecksum = 0;
const queryStart = performance.now();
for (let iteration = 0; iteration < queryIterations; iteration += 1) {
  marqueeMatchChecksum += index.framesInRect(
    { x: iteration * 8, y: iteration * 5, width: 640, height: 480 },
    iteration % 2 === 0 ? "partial" : "full",
  ).length;
}
const marqueeQueryMs = performance.now() - queryStart;

let boundsChecksum = 0;
const boundsStart = performance.now();
for (let iteration = 0; iteration < queryIterations; iteration += 1) {
  const rootIndex = iteration % rootCount;
  const bounds = index.boundsWhenReady([
    `root-${String(rootIndex)}-child-0`,
    `root-${String(rootIndex)}-child-8`,
  ]);
  boundsChecksum += bounds?.height ?? 0;
}
const combinedBoundsMs = performance.now() - boundsStart;

const updateStart = performance.now();
for (let iteration = 0; iteration < updateIterations; iteration += 1) {
  const entry = registrations[iteration % registrations.length];
  if (!entry?.registration) {
    throw new Error("The geometry performance fixture is missing an active registration.");
  }
  entry.registration.update({
    ...entry.frame,
    rect: { ...entry.frame.rect, x: entry.frame.rect.x + (iteration % 3) },
  });
}
const incrementalUpdateMs = performance.now() - updateStart;

if (index.size !== registrations.length) {
  throw new Error(
    `Expected ${String(registrations.length)} measured frames, found ${String(index.size)}.`,
  );
}

console.log(
  JSON.stringify(
    {
      environment: {
        architecture: process.arch,
        node: process.version,
        platform: process.platform,
      },
      fixture: {
        childrenPerRoot,
        frames: registrations.length,
        queryIterations,
        rootCount,
        updateIterations,
      },
      observations: {
        boundsChecksum,
        combinedBoundsMs,
        incrementalUpdateMs,
        marqueeMatchChecksum,
        marqueeQueryMs,
        notifications,
        registrationMs,
      },
    },
    null,
    2,
  ),
);
