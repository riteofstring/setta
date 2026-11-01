import { describe, expect, it } from "vitest";
import { assertWorkspaceCanvasConfiguration } from "./configuration.js";
import type { WorkspaceCanvasConfiguration } from "./configuration.js";

describe("Workspace canvas configuration", () => {
  it("accepts an absent or empty configuration", () => {
    expect(() => assertWorkspaceCanvasConfiguration(undefined)).not.toThrow();
    expect(() => assertWorkspaceCanvasConfiguration({})).not.toThrow();
  });

  it("rejects a malformed canvas boundary before rendering", () => {
    expect(() =>
      assertWorkspaceCanvasConfiguration(
        null as unknown as WorkspaceCanvasConfiguration,
      ),
    ).toThrow("Workspace canvas configuration must be an object.");
    expect(() =>
      assertWorkspaceCanvasConfiguration({
        externalDrop: {
          canDrop: () => true,
          onDrop: null,
        } as unknown as NonNullable<
          WorkspaceCanvasConfiguration["externalDrop"]
        >,
      }),
    ).toThrow(
      "Workspace external drop configuration requires canDrop and onDrop callbacks.",
    );
  });
});
