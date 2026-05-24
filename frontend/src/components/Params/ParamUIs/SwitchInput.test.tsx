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
});
