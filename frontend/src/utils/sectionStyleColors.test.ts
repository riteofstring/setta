import { describe, expect, it } from "vitest";
import { deriveSectionStyleTheme } from "./sectionStyleColors";

describe("deriveSectionStyleTheme", () => {
  it("derives a light-mode theme with a readable text color", () => {
    const theme = deriveSectionStyleTheme("#ff0000", false);
    expect(theme).not.toBeNull();
    expect(theme?.bg).toBe("#ffe0e0");
    expect(theme?.border).toBe("#ffa6a6");
    expect(theme?.outline).toBe("#ff5959");
    expect(theme?.text).toBe("#000000");
  });

  it("derives a dark-mode theme with a readable text color", () => {
    const theme = deriveSectionStyleTheme("#ff0000", true);
    expect(theme).not.toBeNull();
    expect(theme?.bg).toBe("#2e0000");
    expect(theme?.border).toBe("#660000");
    expect(theme?.outline).toBe("#b30000");
    expect(theme?.text).toBe("#ffffff");
  });

  it("returns null for invalid hex values", () => {
    expect(deriveSectionStyleTheme("not-a-color", false)).toBeNull();
    expect(deriveSectionStyleTheme("#fff", false)).toBeNull();
    expect(deriveSectionStyleTheme("#zzzzzz", false)).toBeNull();
  });
});
