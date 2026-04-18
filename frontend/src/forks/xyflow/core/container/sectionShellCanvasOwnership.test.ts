import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import { describe, expect, it } from "vitest";
import {
  CANVAS_OWNED_SECTION_SHELL_ID,
  isCanvasOwnedSectionShell,
  resolveCanvasOwnedSectionShellChrome,
} from "./sectionShellCanvasOwnership";

describe("sectionShellCanvasOwnership", () => {
  it("targets the canonical settings callable section", () => {
    expect(isCanvasOwnedSectionShell(CANVAS_OWNED_SECTION_SHELL_ID)).toBe(true);
    expect(
      isCanvasOwnedSectionShell("settings-section__dictSectionDefault"),
    ).toBe(false);
  });

  it("uses the default callable shell colors when no style color is set", () => {
    expect(
      resolveCanvasOwnedSectionShellChrome({
        darkMode: false,
        styleColor: null,
      }),
    ).toEqual({
      fill: "hsl(222, 28%, 95%)",
      headerDivider: "hsl(220, 24%, 86%)",
      headerFill: "hsl(220, 33%, 98%)",
      stroke: "#ffffff",
    });

    expect(
      resolveCanvasOwnedSectionShellChrome({
        darkMode: true,
        styleColor: "",
      }),
    ).toEqual({
      fill: "hsl(220, 25%, 8.5%)",
      headerDivider: "hsl(219, 24%, 18%)",
      headerFill: "hsl(220, 24%, 12%)",
      stroke: "hsl(219, 26%, 23%)",
    });
  });

  it("reuses section style theme colors when a style color is present", () => {
    const theme = deriveSectionStyleTheme("#22c55e", false);
    if (!theme) {
      throw new Error("Expected a valid derived theme for the test color.");
    }

    expect(
      resolveCanvasOwnedSectionShellChrome({
        darkMode: false,
        styleColor: "#22c55e",
      }),
    ).toEqual({
      fill: theme.bg,
      headerDivider: theme.border,
      headerFill: theme.panelBg,
      stroke: theme.border,
    });
  });
});
