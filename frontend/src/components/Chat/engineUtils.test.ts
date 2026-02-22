import { describe, expect, it } from "vitest";
import {
  type ExternalEngineStatus,
  getExternalEngineIssueMessage,
} from "./engineUtils";

describe("getExternalEngineIssueMessage", () => {
  it("returns null when the external engine is available or still loading", () => {
    // Healthy and loading states should not create warning notifications.
    const available: ExternalEngineStatus = {
      status: "available",
      issues: [],
      name: "Codex",
    };
    const loading: ExternalEngineStatus = {
      status: "loading",
      issues: [],
      name: "Codex",
    };

    expect(getExternalEngineIssueMessage(available)).toBeNull();
    expect(getExternalEngineIssueMessage(loading)).toBeNull();
  });

  it("includes the engine name and issue list for unavailable states", () => {
    // The warning should provide enough detail for the notifications area.
    const unavailable: ExternalEngineStatus = {
      status: "unavailable",
      issues: ["Could not resolve host", "Missing SDK binary"],
      name: "Codex",
    };

    expect(getExternalEngineIssueMessage(unavailable)).toBe(
      'External engine "Codex" unavailable: Could not resolve host; Missing SDK binary',
    );
  });

  it("falls back to a generic unavailable label when no details exist", () => {
    // Missing/invalid config states may not include a name or issue details.
    const missing: ExternalEngineStatus = {
      status: "missing",
      issues: [],
      name: null,
    };

    expect(getExternalEngineIssueMessage(missing)).toBe(
      "External engine unavailable",
    );
  });
});
