import projectSnapshotFixture from "../../backend/internal/contracts/testdata/project-snapshot-v1.json";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  PROJECT_PATH_V1,
  PROJECT_SNAPSHOT_VERSION_V1,
  type ProjectSnapshotV1,
} from "./generatedContract";
import { parseProjectSnapshotV1 } from "./runtimeContract";

describe("generated V1 contract", () => {
  it("supplies the runtime constants and type used by the frontend boundary", () => {
    const snapshot = parseProjectSnapshotV1(projectSnapshotFixture);

    expect(PROJECT_PATH_V1).toBe("/api/v1/project");
    expect(snapshot.version).toBe(PROJECT_SNAPSHOT_VERSION_V1);
    expectTypeOf(snapshot).toEqualTypeOf<ProjectSnapshotV1>();
  });
});
