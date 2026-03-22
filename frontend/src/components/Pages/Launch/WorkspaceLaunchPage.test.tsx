import { describe, expect, it } from "vitest";

import { C_ADDRESSES } from "utils/c_addresses";
import {
  resolveWorkspaceLaunchBackNavigation,
  resolveWorkspaceLaunchReturnUrl,
} from "utils/workspaceLaunchNavigation";

import {
  resolveLaunchedWorkspaceRoot,
  resolveWorkspaceLaunchErrorMessage,
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

describe("WorkspaceLaunchPage back navigation helpers", () => {
  it("keeps same-origin return URLs in app navigation", () => {
    const resolved = resolveWorkspaceLaunchBackNavigation(
      "/projects/demo?tab=recent#pane",
      "http://launcher.local/launching",
    );

    expect(resolved).toEqual({
      kind: "navigate",
      target: "/projects/demo?tab=recent&__setta_open_workspace_switcher=1#pane",
    });
  });

  it("maps backend home returns to in-app home navigation", () => {
    const resolved = resolveWorkspaceLaunchBackNavigation(
      `${C_ADDRESSES.BACKEND_ORIGIN}/home?foo=1#top`,
      "https://current.example/launching",
    );

    expect(resolved).toEqual({
      kind: "navigate",
      target: "/home?foo=1&__setta_open_workspace_switcher=1#top",
    });
  });

  it("preserves trusted cross-origin non-home returns as full redirects", () => {
    const resolved = resolveWorkspaceLaunchBackNavigation(
      `${C_ADDRESSES.LAUNCHER_ORIGIN}/projects/demo`,
      "https://current.example/launching",
    );

    expect(resolved).toEqual({
      kind: "assign",
      target: `${C_ADDRESSES.LAUNCHER_ORIGIN}/projects/demo?__setta_open_workspace_switcher=1`,
    });
  });

  it("falls back to local home navigation for untrusted origins", () => {
    const resolved = resolveWorkspaceLaunchBackNavigation(
      "https://attacker.example/projects/demo",
      "http://launcher.local/launching",
    );

    expect(resolved).toEqual({
      kind: "navigate",
      target: "/home?__setta_open_workspace_switcher=1",
    });
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

describe("WorkspaceLaunchPage workspace root helpers", () => {
  it("prefers the canonical launched session workspace root", () => {
    const resolved = resolveLaunchedWorkspaceRoot(
      {
        workspaceRoot: "/tmp/requested-workspace",
        session: {
          workspacePathCanonical: "/private/tmp/canonical-workspace",
        },
      },
      "/tmp/pending-workspace",
    );

    expect(resolved).toBe("/private/tmp/canonical-workspace");
  });

  it("falls back to the launch response workspace root when needed", () => {
    const resolved = resolveLaunchedWorkspaceRoot(
      {
        workspaceRoot: "/tmp/response-workspace",
        session: {
          workspacePathCanonical: "   ",
        },
      },
      "/tmp/pending-workspace",
    );

    expect(resolved).toBe("/tmp/response-workspace");
  });

  it("falls back to the pending request workspace root when the response omits both", () => {
    const resolved = resolveLaunchedWorkspaceRoot(
      {
        workspaceRoot: null,
        session: null,
      },
      "/tmp/pending-workspace",
    );

    expect(resolved).toBe("/tmp/pending-workspace");
  });
});
