import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ParamRowShell } from "./ParamRowShell";

describe("ParamRowShell", () => {
  it("renders the shared row shell with nested-child and top-level padding classes", () => {
    const markup = renderToStaticMarkup(
      <ParamRowShell
        id="row-1"
        isNestedChildInTree={true}
        isTopLevelWithPad={true}
        extraClassName="bg-red-500"
      >
        <p>label</p>
      </ParamRowShell>,
    );

    expect(markup).toContain('id="row-1"');
    expect(markup).toContain('data-param-row="true"');
    expect(markup).toContain("section-param-row");
    expect(markup).toContain("section-min-rows");
    expect(markup).toContain("relative");
    expect(markup).toContain("min-w-0");
    expect(markup).not.toContain("section-param-row section-min-rows relative grid");
    expect(markup).toContain("ml-[1.44rem]");
    expect(markup).toContain("[&amp;&gt;p]:!pb-0");
    expect(markup).toContain("bg-red-500");
  });

  it("renders the placeholder shell without interactive-only props", () => {
    const markup = renderToStaticMarkup(
      <ParamRowShell
        isNestedChildInTree={false}
        justifyBetween={true}
        extraClassName="bg-blue-500/40"
      />,
    );

    expect(markup).toContain("section-param-row");
    expect(markup).toContain("section-min-rows");
    expect(markup).toContain("relative");
    expect(markup).toContain("min-w-0");
    expect(markup).not.toContain("section-param-row section-min-rows relative grid");
    expect(markup).toContain("ml-[0.72rem]");
    expect(markup).toContain("justify-between");
    expect(markup).toContain("bg-blue-500/40");
    expect(markup).not.toContain("tabindex");
  });
});
