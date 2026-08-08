import { describe, expect, it } from "vitest";

import {
  resolveWorkspaceLaunchErrorMessage,
  resolveWorkspaceLaunchReturnUrl,
} from "./WorkspaceLaunchPage";

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

describe("WorkspaceLaunchPage launch error helpers", () => {
  it("maps typed outdated-settings launch errors to migration guidance", () => {
    const resolved = resolveWorkspaceLaunchErrorMessage({
      code: "OutdatedProjectSettings",
      message: "any backend detail",
    });

    expect(resolved).toContain("older Setta settings/project format");
    expect(resolved).toContain("migrate the project metadata");
  });

  it("does not remap messages when the typed error code is missing", () => {
    const rawMessage = [
      "Traceback ...",
      'File "/tmp/site-packages/setta/project_state/settings_project.py", line 625',
      "KeyError: 'Missing settings section pluginSectionDefault.'",
    ].join("\n");
    const resolved = resolveWorkspaceLaunchErrorMessage({
      code: null,
      message: rawMessage,
    });
    expect(resolved).toBe(rawMessage);
  });

  it("keeps non-outdated launch errors unchanged", () => {
    const resolved = resolveWorkspaceLaunchErrorMessage({
      code: "InvalidWorkspace",
      message: "Workspace root does not exist: /tmp/demo",
    });
    expect(resolved).toBe("Workspace root does not exist: /tmp/demo");
  });

  it("falls back to a generic launch error when message is empty", () => {
    expect(
      resolveWorkspaceLaunchErrorMessage({ code: null, message: "   " }),
    ).toBe("Launch failed.");
  });
});
