import { describe, expect, it } from "vitest";

import {
  assertWorkspaceDetachmentProviderCallbacks,
  resolveWorkspaceDetachedWindowInitialBounds,
  resolveWorkspaceDetachmentDecision,
  workspaceDetachedWindowFeatures,
} from "../src/internal/workspace-section-detachment-contract.js";

describe("workspace section detachment contract", () => {
  it("resolves strict host decisions without guessing", () => {
    expect(resolveWorkspaceDetachmentDecision({ allowed: true })).toEqual({ allowed: true });
    expect(
      resolveWorkspaceDetachmentDecision({ allowed: false, reason: "  Keep it docked.  " }),
    ).toEqual({ allowed: false, reason: "Keep it docked." });

    expect(() => resolveWorkspaceDetachmentDecision({ allowed: true, reason: "Unused" })).toThrow(
      "cannot include a reason",
    );
    expect(() => resolveWorkspaceDetachmentDecision({ allowed: false, reason: "  " })).toThrow(
      "requires a reason",
    );
    expect(() => resolveWorkspaceDetachmentDecision({ allowed: true, extra: true })).toThrow(
      "Unknown workspace detachment decision field extra",
    );
  });

  it("defaults and serializes finite detached-window bounds", () => {
    expect(resolveWorkspaceDetachedWindowInitialBounds(undefined)).toEqual({
      height: 560,
      width: 720,
    });
    const bounds = resolveWorkspaceDetachedWindowInitialBounds({
      height: 499.6,
      width: 640.4,
      x: -20.4,
      y: 32.6,
    });

    expect(bounds).toEqual({ height: 499.6, width: 640.4, x: -20.4, y: 32.6 });
    expect(workspaceDetachedWindowFeatures(bounds)).toBe(
      "popup=yes,width=640,height=500,left=-20,top=33",
    );
    expect(() => resolveWorkspaceDetachedWindowInitialBounds({ width: 0 })).toThrow(
      "width must be greater than zero",
    );
    expect(() => resolveWorkspaceDetachedWindowInitialBounds({ x: Number.NaN })).toThrow(
      "x must be a finite number",
    );
  });

  it("rejects malformed provider callbacks before rendering children", () => {
    expect(() =>
      assertWorkspaceDetachmentProviderCallbacks(undefined, "notify", undefined, undefined),
    ).toThrow("onWindowChange must be a function");
    expect(() =>
      assertWorkspaceDetachmentProviderCallbacks(
        () => undefined,
        () => undefined,
        () => null,
        () => ({ allowed: true }),
      ),
    ).not.toThrow();
  });
});
