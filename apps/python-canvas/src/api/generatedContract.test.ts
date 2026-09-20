import projectSnapshotFixture from "@setta/python-canvas/project-snapshot-v2.json";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  PROJECT_CALLABLES_PATH_V2,
  PROJECT_EVENTS_PATH_V2,
  PROJECT_PATH_V2,
  PROJECT_RENAME_PATH_V2,
  PROJECT_SNAPSHOT_VERSION_V2,
  projectCallableCompletionsPath,
  projectCallableParametersPath,
  type ProjectSnapshotV2,
} from "./generatedContract";
import { parseProjectSnapshotV2 } from "./runtimeContract";

describe("generated V2 contract", () => {
  it("exposes the closed V2 route and dynamic callable helpers", () => {
    const snapshot = parseProjectSnapshotV2(projectSnapshotFixture);

    expect(PROJECT_PATH_V2).toBe("/api/v2/project");
    expect(PROJECT_EVENTS_PATH_V2).toBe("/api/v2/project/events");
    expect(PROJECT_RENAME_PATH_V2).toBe("/api/v2/project/rename");
    expect(PROJECT_CALLABLES_PATH_V2).toBe("/api/v2/project/callables");
    expect(projectCallableParametersPath("callable:one/two")).toBe(
      "/api/v2/project/callables/callable%3Aone%2Ftwo/parameters",
    );
    expect(projectCallableCompletionsPath("callable:one")).toBe(
      "/api/v2/project/callables/callable%3Aone/completions",
    );
    expect(snapshot.version).toBe(PROJECT_SNAPSHOT_VERSION_V2);
    expect(snapshot.project).toEqual({
      id: "project:fixture",
      name: "Fixture project",
      revision: 1,
    });
    expect(snapshot.diagnosticsRevision).toBe(snapshot.project.revision);
    expectTypeOf(snapshot).toEqualTypeOf<ProjectSnapshotV2>();
  });
});
