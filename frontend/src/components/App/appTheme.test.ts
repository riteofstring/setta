import { describe, expect, it } from "vitest";

import { resolveAppTheme } from "./appTheme";

describe("resolveAppTheme vars", () => {
  it("applies component-role defaults and allows overriding via theme.vars", () => {
    const resolved = resolveAppTheme({
      mode: "dark",
      vars: {
        "--app-button-bg": "#ff00ff",
        "--app-input-bg": "rgba(255, 255, 255, 0.12)",
      },
    });

    expect(resolved.style["--app-button-bg"]).toBe("#ff00ff");
    expect(resolved.style["--app-input-bg"]).toBe("rgba(255, 255, 255, 0.12)");
    expect(typeof resolved.style["--app-button-text"]).toBe("string");
    expect(typeof resolved.style["--app-input-border"]).toBe("string");
  });

  it("ignores vars outside the --app- namespace", () => {
    const resolved = resolveAppTheme({
      vars: {
        "--not-app": "nope",
      },
    });

    expect(resolved.style["--not-app"]).toBeUndefined();
  });
});

