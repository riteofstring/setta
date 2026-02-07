import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RotaryInput } from "./RotaryInput";

describe("RotaryInput theme overrides", () => {
  it("uses the default indicator theme when override is not provided", () => {
    const markup = renderToStaticMarkup(
      <RotaryInput value={0} min={0} max={10} step={1} />,
    );

    expect(markup).toContain("bg-blue-500");
  });

  it("uses the override indicator theme and does not include defaults", () => {
    const markup = renderToStaticMarkup(
      <RotaryInput
        value={0}
        min={0}
        max={10}
        step={1}
        indicatorThemeClassName="bg-red-500"
      />,
    );

    expect(markup).toContain("bg-red-500");
    expect(markup).not.toContain("bg-blue-500");
  });
});

