import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SwitchInput } from "./SwitchInput";

describe("SwitchInput theme overrides", () => {
  it("uses default theme classes when overrides are not provided", () => {
    const markup = renderToStaticMarkup(
      <SwitchInput value={false} onChange={() => undefined} />,
    );

    expect(markup).toContain("bg-setta-400");
    expect(markup).toContain("data-[state=&#x27;checked&#x27;]:bg-blue-500");
    expect(markup).toContain("bg-white");
  });

  it("uses override theme classes and does not include defaults", () => {
    const markup = renderToStaticMarkup(
      <SwitchInput
        value={false}
        onChange={() => undefined}
        rootThemeClassName="bg-red-500"
        thumbThemeClassName="bg-green-500"
      />,
    );

    expect(markup).toContain("bg-red-500");
    expect(markup).not.toContain("bg-setta-400");
    expect(markup).toContain("bg-green-500");
    expect(markup).not.toContain("bg-white");
  });

  it("renders switch root directly when no outer wrapper is provided", () => {
    const markup = renderToStaticMarkup(
      <SwitchInput value={false} onChange={() => undefined} />,
    );

    expect(markup.startsWith("<button")).toBe(true);
    expect(markup).not.toContain("<div");
  });

  it("keeps optional outer wrapper and applies root class overrides", () => {
    const markup = renderToStaticMarkup(
      <SwitchInput
        value={false}
        onChange={() => undefined}
        outerDivClassName="section-value"
        rootClassName="justify-self-start"
      />,
    );

    expect(markup.startsWith('<div class="section-value"')).toBe(true);
    expect(markup).toContain("justify-self-start");
  });

  it("supports a thumbless flattening path via pseudo-element classes", () => {
    const markup = renderToStaticMarkup(
      <SwitchInput
        value={false}
        onChange={() => undefined}
        flattenThumb={true}
        thumbThemeClassName="bg-green-500 dark:bg-green-700"
      />,
    );

    expect(markup).toContain("before:block");
    expect(markup).toContain("before:bg-green-500");
    expect(markup).toContain("dark:before:bg-green-700");
    expect(markup).not.toContain("<span");
  });
});
