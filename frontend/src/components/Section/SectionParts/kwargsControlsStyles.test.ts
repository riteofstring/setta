import { describe, expect, it } from "vitest";
import { getKwargsControlsContainerClassName } from "./kwargsControlsStyles";

describe("getKwargsControlsContainerClassName", () => {
  it("paints callable strips explicitly in the default theme", () => {
    const className = getKwargsControlsContainerClassName({
      hasSectionStyleTheme: false,
      isCallableSection: true,
    });

    expect(className).toContain("bg-setta-50");
    expect(className).toContain("dark:bg-setta-860");
    expect(className).toContain("overflow-hidden");
    expect(className).toContain("isolate");
  });

  it("keeps themed callable strips tied to the section style colors", () => {
    const className = getKwargsControlsContainerClassName({
      hasSectionStyleTheme: true,
      isCallableSection: true,
    });

    expect(className).toContain("bg-[color:var(--setta-section-style-bg)]");
    expect(className).toContain(
      "border-[color:var(--setta-section-style-border)]",
    );
    expect(className).toContain("overflow-hidden");
  });

  it("does not force default strip paint onto non-callable unthemed sections", () => {
    const className = getKwargsControlsContainerClassName({
      hasSectionStyleTheme: false,
      isCallableSection: false,
    });

    expect(className).not.toContain("bg-setta-50");
    expect(className).not.toContain("dark:bg-setta-860");
    expect(className).toContain("overflow-hidden");
  });
});
