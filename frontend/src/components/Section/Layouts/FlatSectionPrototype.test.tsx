import { renderToStaticMarkup } from "react-dom/server";
import {
  FlatCallableSectionPrototype,
  FlatSectionPrototypeGallery,
} from "./FlatSectionPrototype";
import { describe, expect, it } from "vitest";

describe("FlatSectionPrototype", () => {
  it("renders callable and dict prototype shells without card chrome tokens", () => {
    const markup = renderToStaticMarkup(<FlatSectionPrototypeGallery />);

    expect(markup).toContain('data-flat-section-kind="callable"');
    expect(markup).toContain('data-flat-section-kind="dict"');
    expect(markup).toContain("Callable Prototype");
    expect(markup).toContain("Dict Prototype");
    expect(markup).not.toContain("rounded");
    expect(markup).not.toContain("shadow");
    expect(markup).not.toContain("opacity");
    expect(markup).not.toContain(" grid");
  });

  it("keeps the callable prototype markup div-free and row-oriented", () => {
    const markup = renderToStaticMarkup(<FlatCallableSectionPrototype />);
    const divCount = (markup.match(/<div\b/g) ?? []).length;
    const rowCount = (markup.match(/data-flat-row-key=/g) ?? []).length;

    expect(divCount).toBe(0);
    expect(rowCount).toBeGreaterThanOrEqual(4);
    expect(markup).toContain('data-flat-shell-strip="ports"');
  });
});
