import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PasswordInput } from "./PasswordInput";

describe("PasswordInput", () => {
  it("marks input and toggle surfaces as GPU flow interactive nodrag regions", () => {
    const markup = renderToStaticMarkup(
      <PasswordInput
        className="fixture-input"
        toggleClassName="fixture-toggle"
        value="secret"
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain('data-gpu-flow-interactive="true"');
    expect(markup).toContain("nodrag nopan section-value relative min-w-0");
    expect(markup).toContain("nodrag nopan fixture-input pr-8");
    expect(markup).toContain("nodrag nopan absolute inset-y-0 right-0");
    expect(markup).toContain("fixture-toggle");
  });
});
