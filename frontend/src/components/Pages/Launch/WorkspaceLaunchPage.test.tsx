import { describe, expect, it } from "vitest";

import { resolveWorkspaceLaunchReturnUrl } from "./WorkspaceLaunchPage";

describe("WorkspaceLaunchPage return URL helpers", () => {
  it("falls back to /home when the value is missing", () => {
    const resolved = resolveWorkspaceLaunchReturnUrl(
      null,
      "http://launcher.local/launching",
    );
    expect(resolved).toBe("http://launcher.local/home");
  });

  it("resolves relative paths against the current launcher origin", () => {
    const resolved = resolveWorkspaceLaunchReturnUrl(
      "/projects/demo",
      "http://launcher.local/launching",
    );
    expect(resolved).toBe("http://launcher.local/projects/demo");
  });

  it("rejects non-http(s) schemes", () => {
    const resolved = resolveWorkspaceLaunchReturnUrl(
      "javascript:alert('xss')",
      "http://launcher.local/launching",
    );
    expect(resolved).toBe("http://launcher.local/home");
  });
});
