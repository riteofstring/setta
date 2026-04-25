import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FlatCallableSectionPrototype,
  FlatDictSectionPrototype,
  FlatSectionPrototypeGallery,
} from "./FlatSectionPrototype";

describe("FlatSectionPrototype", () => {
  it("renders callable and dict prototype shells without card chrome tokens", () => {
    const markup = renderToStaticMarkup(<FlatSectionPrototypeGallery />);

    expect(markup).toContain('data-flat-section-kind="callable"');
    expect(markup).toContain('data-flat-section-kind="dict"');
    expect(markup).toContain('data-flat-theme-preview="dark"');
    expect(markup).toContain('data-flat-theme-preview="light"');
    expect((markup.match(/data-flat-preview-theme="dark"/g) ?? []).length).toBe(
      2,
    );
    expect(
      (markup.match(/data-flat-preview-theme="light"/g) ?? []).length,
    ).toBe(2);
    expect(markup).toContain('data-flat-section-type-menu="true"');
    expect(markup).toContain("flat-section-prototype-gallery");
    expect(markup).toContain("flat-section-prototype--dark");
    expect(markup).toContain("flat-section-prototype--light");
    expect(markup).toContain("rank_items");
    expect(markup).toContain("builtins.sorted");
    expect(markup).toContain("workspace_profile");
    expect(markup).toContain("gg-code-slash");
    expect(markup).toContain("gg-list");
    expect(markup).toContain("flat-section-prototype__icon-button");
    expect(markup).toContain("flat-section-prototype__icon-glyph");
    expect(markup).toContain("flat-section-prototype__header");
    expect(markup).toContain("flat-section-prototype__top-controls");
    expect(markup).not.toContain("px-2.5");
    expect(markup).toContain('placeholder="please enter function name"');
    expect(markup).toContain('aria-label="Lock section"');
    expect(markup).toContain('aria-label="Minimize section"');
    expect(markup).toContain('aria-label="Close section"');
    expect(markup).toContain('data-flat-control-toggle="true"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("flex min-h-8 items-center gap-2");
    expect(markup).not.toContain("flex items-center gap-1");
    expect(markup).not.toContain("mr-1.5");
    expect(markup).not.toContain("grid-cols");
    expect(markup).not.toContain("justify-self");
    expect(markup).toContain(
      "flat-section-prototype__top-button flat-section-prototype__top-button--lock",
    );
    expect(markup).not.toContain("rounded");
    expect(markup).not.toContain("shadow");
    expect(markup).not.toContain("opacity");
    expect(markup).not.toContain("dark:");
    expect(markup).not.toContain("[color:");
    expect(markup).not.toContain('data-flat-control="column-resize"');
    expect(markup).not.toContain("filter args");
    expect(markup).not.toContain("filter keys");
    expect(markup).toContain('data-flat-row-group="pinned"');
    expect(markup).toContain('data-flat-row-group="body"');
  });

  it("keeps the callable prototype markup lean and row-oriented", () => {
    const markup = renderToStaticMarkup(<FlatCallableSectionPrototype />);
    const divCount = (markup.match(/<div\b/g) ?? []).length;
    const spanCount = (markup.match(/<span\b/g) ?? []).length;
    const iconGlyphCount = (
      markup.match(/flat-section-prototype__icon-glyph/g) ?? []
    ).length;
    const iconElementCount = (markup.match(/<i\b/g) ?? []).length;
    const rowCount = (markup.match(/data-flat-row-key=/g) ?? []).length;
    const rowGroupListCount = (
      markup.match(/<ol[^>]*data-flat-row-group=/g) ?? []
    ).length;
    const rowGroupSectionCount = (
      markup.match(/<section[^>]*data-flat-row-group=/g) ?? []
    ).length;

    expect(divCount).toBe(0);
    expect(spanCount).toBe(iconGlyphCount);
    expect(iconGlyphCount).toBe(5);
    expect(iconElementCount).toBe(0);
    expect(rowCount).toBeGreaterThanOrEqual(4);
    expect(rowGroupListCount).toBe(2);
    expect(rowGroupSectionCount).toBe(0);
    expect(markup).toContain('data-flat-shell-strip="ports"');
    expect(markup).toContain("flat-section-prototype__ports");
    expect(markup).toContain("flat-section-prototype__port-list--left");
    expect(markup).toContain("flat-section-prototype__port-row--right");
    expect(markup).toContain('data-flat-row-emphasis="edge"');
    expect(markup).toContain('data-flat-row-emphasis="required"');
    expect(markup).toContain('data-flat-row-emphasis="optional"');
    expect(markup).toContain("flat-section-prototype__row-key");
    expect(markup).toContain("flat-section-prototype__row-value");
    expect(markup).not.toContain("hover:bg-[color:var(--flat-hover)]");
    expect(markup).not.toContain("focus:border-[color:var(--flat-focus)]");
    expect(markup).not.toContain("border-solid");
    expect(markup).not.toContain("[border-width:0_0_1px_0]");
    expect(markup).not.toContain("leading-[var(--flat-row-height)]");
    expect(markup).not.toContain("before:left-[-0.9375rem]");
    expect(markup).not.toContain("after:right-[-0.9375rem]");
    expect(markup).toContain('data-flat-port-label="IN"');
    expect(markup).not.toContain("before:content-[attr(data-flat-port-label)]");
    expect(markup).not.toContain("flex min-h-[var(--flat-row-height)]");
    expect(markup).not.toContain("pl-[calc(0.75rem+var(");
    expect(markup).not.toContain("grid");
    expect(markup).not.toContain('data-flat-pinned-marker="true"');
    expect(markup).not.toContain("gg-pin-alt");
    expect(markup).not.toContain(">Pinned Params<");
    expect(markup).not.toContain('data-flat-control="column-resize"');
    expect(markup).not.toContain("filter args");
    expect(markup).not.toContain("border-neutral-200");
    expect(markup).not.toContain("bg-blue-50/80");
    expect(markup).not.toContain("transition-colors");
  });

  it("mounts the args controls only when explicitly revealed", () => {
    const markup = renderToStaticMarkup(
      <FlatCallableSectionPrototype controlsInitiallyOpen />,
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('data-flat-control="column-resize"');
    expect(markup).toContain('data-flat-action-bar="true"');
    expect(markup).toContain('value="filter"');
    expect(markup).toContain("gg-search");
    expect(markup).toContain("flat-section-prototype__filter-input");
    expect(markup).toContain("flat-section-prototype__action-bar");
    expect(markup).toContain("flat-section-prototype__icon-glyph");
    expect(markup).toContain("flat-section-prototype__action-button--resize");
    expect(markup).not.toContain("flex min-h-9 items-center gap-0.5");
    expect(markup).not.toContain("grid-cols");
    expect(markup).not.toContain("justify-self");
    expect(markup).not.toContain(">Args<");
    expect(markup).not.toContain("filter args");
    expect(markup).not.toContain("group-hover");
  });

  it("marks dict grouping and nested row hierarchy without helper rail elements", () => {
    const markup = renderToStaticMarkup(<FlatDictSectionPrototype />);

    expect(markup).toContain('data-flat-row-emphasis="group"');
    expect(markup).toContain('data-flat-row-emphasis="nested"');
    expect(markup).toContain("flat-section-prototype__row--rail");
    expect(markup).toContain("flat-section-prototype__row--rail-start");
    expect(markup).toContain("flat-section-prototype__row--rail-end");
    expect(markup).toContain("--flat-depth-offset:0.875rem");
    expect(markup).toContain("--flat-rail-left:1.1875rem");
    expect(markup).not.toContain("--flat-rail-width");
    expect(markup).not.toContain("after:w-[var(--flat-rail-width)]");
    const spanCount = (markup.match(/<span\b/g) ?? []).length;
    const iconGlyphCount = (
      markup.match(/flat-section-prototype__icon-glyph/g) ?? []
    ).length;
    expect(spanCount).toBe(iconGlyphCount);
  });
});
