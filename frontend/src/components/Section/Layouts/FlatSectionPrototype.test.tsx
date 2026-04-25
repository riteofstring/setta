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
    expect(markup).toContain("rank_items");
    expect(markup).toContain("builtins.sorted");
    expect(markup).toContain("workspace_profile");
    expect(markup).toContain("gg-code-slash");
    expect(markup).toContain("gg-list");
    expect(markup).toContain("px-2 py-1");
    expect(markup).not.toContain("px-2.5");
    expect(markup).toContain('placeholder="please enter function name"');
    expect(markup).toContain('aria-label="Lock section"');
    expect(markup).toContain('aria-label="Minimize section"');
    expect(markup).toContain('aria-label="Close section"');
    expect(markup).toContain('data-flat-control-toggle="true"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("grid-cols-[repeat(4,1rem)]");
    expect(markup).not.toContain("mr-1.5");
    expect(markup).toContain("gg-lock [--ggs:0.36]");
    expect(markup).not.toContain("rounded");
    expect(markup).not.toContain("shadow");
    expect(markup).not.toContain("opacity");
    expect(markup).not.toContain("dark:");
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
    const iconElementCount = (markup.match(/<i\b/g) ?? []).length;
    const rowCount = (markup.match(/data-flat-row-key=/g) ?? []).length;

    expect(divCount).toBe(0);
    expect(spanCount).toBe(0);
    expect(iconElementCount).toBe(0);
    expect(rowCount).toBeGreaterThanOrEqual(4);
    expect(markup).toContain('data-flat-shell-strip="ports"');
    expect(markup).toContain('data-flat-row-emphasis="edge"');
    expect(markup).toContain('data-flat-row-emphasis="required"');
    expect(markup).toContain('data-flat-row-emphasis="optional"');
    expect(markup).toContain("hover:bg-[color:var(--flat-hover)]");
    expect(markup).toContain("focus:border-[color:var(--flat-focus)]");
    expect(markup).toContain("border-solid");
    expect(markup).toContain("[border-width:0_0_1px_0]");
    expect(markup).toContain("leading-7");
    expect(markup).toContain("text-left font-mono");
    expect(markup).toContain("whitespace-nowrap py-1");
    expect(markup).toContain("before:-left-3");
    expect(markup).toContain("after:-right-3");
    expect(markup).toContain("var(--flat-key-width)");
    expect(markup).toContain("grid-cols-[1.125rem_minmax(0,1fr)_auto]");
    expect(markup).toContain("pl-[calc(var(--flat-depth,0)*0.875rem)]");
    expect(markup).toContain("pr-0");
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
    expect(markup).toContain('value="filter"');
    expect(markup).toContain("gg-search");
    expect(markup).toContain("text-left");
    expect(markup).toContain("grid-cols-[repeat(5,1rem)_auto_minmax(0,1fr)]");
    expect(markup).toContain("gap-x-0.5");
    expect(markup).toContain("justify-self-center");
    expect(markup).not.toContain(">Args<");
    expect(markup).not.toContain("filter args");
    expect(markup).not.toContain("group-hover");
  });

  it("marks dict grouping and nested row hierarchy without helper rail elements", () => {
    const markup = renderToStaticMarkup(<FlatDictSectionPrototype />);

    expect(markup).toContain('data-flat-row-emphasis="group"');
    expect(markup).toContain('data-flat-row-emphasis="nested"');
    expect(markup).toContain("before:left-[var(--flat-rail-left)]");
    expect(markup).toContain("--flat-rail-left:0.4375rem");
    expect(markup).not.toContain("--flat-rail-width");
    expect(markup).not.toContain("after:w-[var(--flat-rail-width)]");
    expect(markup).not.toContain("<span");
  });
});
