import { afterEach, describe, expect, it } from "vitest";
import { appendWorkspaceHistoryToBootstrapUrlFragment } from "./workspaceHistory";

describe("appendWorkspaceHistoryToBootstrapUrlFragment", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalBtoa = (globalThis as { btoa?: unknown }).btoa;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
    if (originalBtoa === undefined) {
      delete (globalThis as { btoa?: unknown }).btoa;
    } else {
      (globalThis as { btoa?: unknown }).btoa = originalBtoa;
    }
  });

  it("no-ops when window is unavailable", () => {
    delete (globalThis as { window?: unknown }).window;
    const input = "http://127.0.0.1:8000/__setta__/bootstrap#token=tok";
    expect(appendWorkspaceHistoryToBootstrapUrlFragment(input, [])).toBe(input);
  });

  it("adds a workspace history payload to the hash without clobbering token", () => {
    (globalThis as { window?: unknown }).window = {
      location: { href: "http://127.0.0.1:3000/" },
    };
    (globalThis as { btoa?: unknown }).btoa = (value: string) =>
      Buffer.from(value, "binary").toString("base64");

    const input = "http://127.0.0.1:8000/__setta__/bootstrap#token=tok";
    const output = appendWorkspaceHistoryToBootstrapUrlFragment(input, [
      {
        workspaceRoot: "/tmp/work",
        sshTarget: null,
        localPort: null,
        filesRoot: null,
        filesRootBase: null,
        lastUsedAt: 123,
      },
    ]);

    const url = new URL(output);
    const params = new URLSearchParams(url.hash.slice(1));
    expect(params.get("token")).toBe("tok");
    const wh = params.get("wh");
    expect(wh).toBeTruthy();
    expect(wh).not.toContain("=");
    expect(wh).not.toContain("+");
    expect(wh).not.toContain("/");
  });
});
