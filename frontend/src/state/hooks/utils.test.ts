import { describe, expect, it } from "vitest";
import { resolvePendingValueOnGlobalUpdate } from "./utils";

describe("resolvePendingValueOnGlobalUpdate", () => {
  it("preserves null when no local pending draft exists", () => {
    // No local draft means there is nothing to reconcile.
    expect(resolvePendingValueOnGlobalUpdate(null)).toBeNull();
  });

  it("clears a non-null pending draft on authoritative global updates", () => {
    // Undo/redo patches from backend must win over stale local drafts.
    expect(resolvePendingValueOnGlobalUpdate("123")).toBeNull();
  });

  it("clears falsy drafts such as empty strings", () => {
    // Empty-string drafts are valid user input and must not bypass reconciliation.
    expect(resolvePendingValueOnGlobalUpdate("")).toBeNull();
  });
});
