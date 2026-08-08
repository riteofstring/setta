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
    expect(typeof resolved.style["--app-button-ring"]).toBe("string");
    expect(typeof resolved.style["--app-input-border"]).toBe("string");
  });

  it("supports theme.components overrides for component-role tokens", () => {
    const resolved = resolveAppTheme({
      components: {
        button: {
          bg: "#00ff00",
        },
      },
    });

    expect(resolved.style["--app-button-bg"]).toBe("#00ff00");
    expect(typeof resolved.style["--app-button-text"]).toBe("string");
  });

  it("supports motion token overrides", () => {
    const resolved = resolveAppTheme({
      motion: {
        durationMs: 640,
        easing: "linear",
        staggerMs: 123,
      },
    });

    expect(resolved.motion.durationMs).toBe(640);
    expect(resolved.motion.easing).toBe("linear");
    expect(resolved.motion.staggerMs).toBe(123);
    expect(typeof resolved.motion.delayMs).toBe("number");
  });

  it("supports typography token overrides", () => {
    const resolved = resolveAppTheme({
      typography: {
        bodySize: 18,
        bodyLineHeight: 1.7,
        headingSizes: { h2: "2.25rem" },
      },
    });

    expect(resolved.typography.bodySize).toBe(18);
    expect(resolved.typography.bodyLineHeight).toBe(1.7);
    expect(resolved.typography.headingSizes?.h2).toBe("2.25rem");
  });

  it("sets a default typography scale and supports overrides", () => {
    const resolvedDefault = resolveAppTheme(null);
    expect(resolvedDefault.style["--app-text-xs"]).toBe("0.75rem");
    expect(resolvedDefault.style["--app-text-2xl"]).toBe("1.5rem");

    const resolvedOverride = resolveAppTheme({
      typography: {
        scale: {
          xs: 14,
          "2xl": "3rem",
        },
      },
    });
    expect(resolvedOverride.style["--app-text-xs"]).toBe("14px");
    expect(resolvedOverride.style["--app-text-2xl"]).toBe("3rem");
  });

  it("supports shadow token overrides", () => {
    const resolved = resolveAppTheme({
      shadows: {
        sm: "0 0 0 10px rgba(255, 0, 255, 0.9)",
      },
    });

    expect(resolved.style["--app-shadow-sm"]).toBe(
      "0 0 0 10px rgba(255, 0, 255, 0.9)",
    );
    expect(typeof resolved.style["--app-card-shadow"]).toBe("string");
  });

  it("sets a themeable background image for app pages", () => {
    const resolved = resolveAppTheme(null);
    const value = resolved.style["--app-page-bg-image"];
    expect(typeof value).toBe("string");
    expect(value).toContain("radial-gradient");
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
