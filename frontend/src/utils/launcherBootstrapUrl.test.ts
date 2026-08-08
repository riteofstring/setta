import { describe, expect, it } from "vitest";

import { resolveLauncherBootstrapUrl } from "./launcherBootstrapUrl";

describe("resolveLauncherBootstrapUrl", () => {
  it("returns the bootstrap fragment unchanged", () => {
    const input =
      "http://127.0.0.1:61111/__setta__/bootstrap#token=tok&lo=http%3A%2F%2Flauncher.example%3A9001&lop=proof";

    expect(resolveLauncherBootstrapUrl(input)).toBe(input);
  });
});
