import { describe, expect, it } from "vitest";
import {
  formatSettingsGraphPageLifecycleDiagnostic,
  isSettingsGraphPageLifecycleClosureError,
} from "./settingsGraphProbePageLifecycle";

describe("settingsGraphProbePageLifecycle", () => {
  it("recognizes closed-page Playwright errors as lifecycle failures", () => {
    // This keeps the worktree-unhealthy path stable when Playwright closes the
    // page before compare-pane normalization finishes.
    expect(
      isSettingsGraphPageLifecycleClosureError(
        new Error("Target page, context or browser has been closed"),
      ),
    ).toBe(true);
    expect(
      isSettingsGraphPageLifecycleClosureError(
        new Error("Browser has been closed"),
      ),
    ).toBe(true);
  });

  it("does not collapse unrelated verifier errors into lifecycle failures", () => {
    // Real parity/preflight mismatches should still surface as their original
    // product/setup errors rather than as fake page-closure noise.
    expect(
      isSettingsGraphPageLifecycleClosureError(
        new Error("Missing target section rotaryParamCodeObjDefault"),
      ),
    ).toBe(false);
    expect(isSettingsGraphPageLifecycleClosureError("plain string")).toBe(
      false,
    );
  });

  it("formats lifecycle diagnostics as a compact JSON snapshot", () => {
    // The probe output needs enough runtime context to tell page-close failures
    // from renderer drift without reopening the browser manually.
    expect(
      formatSettingsGraphPageLifecycleDiagnostic({
        browserConnected: false,
        openPageCount: 0,
        pageClosed: true,
        pageUrl: "http://127.0.0.1:3075/settings",
      }),
    ).toBe(
      '{"browserConnected":false,"openPageCount":0,"pageClosed":true,"pageUrl":"http://127.0.0.1:3075/settings"}',
    );
  });
});
