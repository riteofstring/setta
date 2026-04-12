import { DependencyEventSchema } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("DependencyEventSchema", () => {
  it("does not include binaryPayload in the schema", () => {
    expect(Object.keys(DependencyEventSchema.shape)).not.toContain(
      "binaryPayload",
    );
  });
});
