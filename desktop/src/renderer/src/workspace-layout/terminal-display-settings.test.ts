import { describe, expect, test } from "vitest";

import {
  defaultTerminalDisplaySettings,
  normalizeTerminalDisplaySettings,
  terminalTheme,
  terminalThemeBackground,
} from "./terminal-display-settings";

describe("terminal display settings", () => {
  test("normalizes profile display settings without accepting profile launch fields", () => {
    expect(
      normalizeTerminalDisplaySettings({
        cwd: "/tmp/ignored",
        fontFamily: "JetBrains Mono",
        fontSize: 14.4,
        profileId: "ignored",
        scrollback: 20_000,
        shellPath: "/bin/zsh",
        themeId: "high-contrast-dark",
      }),
    ).toEqual({
      fontFamily: "JetBrains Mono",
      fontSize: 14,
      scrollback: 10_000,
      themeId: "high-contrast-dark",
    });
  });

  test("falls back to defaults for invalid profile display fields", () => {
    expect(
      normalizeTerminalDisplaySettings({
        fontFamily: "",
        fontSize: Number.NaN,
        scrollback: "bad",
        themeId: "unknown",
      }),
    ).toEqual(defaultTerminalDisplaySettings);
  });

  test("returns xterm themes for profile theme ids", () => {
    expect(terminalTheme("setta-light").background).toBe("#fbfbfc");
  });

  test("returns the concrete xterm background for profile theme ids", () => {
    expect(terminalThemeBackground("setta-dark")).toBe("#09090b");
    expect(terminalThemeBackground("high-contrast-dark")).toBe("#000000");
    expect(terminalThemeBackground("setta-light")).toBe("#fbfbfc");
  });
});
