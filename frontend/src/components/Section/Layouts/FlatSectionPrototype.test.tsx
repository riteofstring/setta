import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FlatCallableSectionPrototype,
  FlatDictSectionPrototype,
  FlatSectionPrototypeGallery,
} from "./FlatSectionPrototype";

const css = readFileSync(
  new URL("./FlatSectionPrototype.css", import.meta.url),
  "utf8",
);

describe("FlatSectionPrototype", () => {
  it("renders callable and dict prototype shells without grid or theme utility churn", () => {
    const markup = renderToStaticMarkup(<FlatSectionPrototypeGallery />);

    expect(markup).toContain("flat-section-prototype-gallery");
    expect(markup).toContain("flat-section-card--callable");
    expect(markup).toContain("flat-section-card--dict");
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
    expect(markup).toContain("--flat-action-h:0px");
    expect(markup).toContain("rank_items");
    expect(markup).toContain("builtins.sorted");
    expect(markup).toContain("workspace_profile");
    expect(markup).toContain("gg-code-slash");
    expect(markup).toContain("gg-list");
    expect(markup).toContain('placeholder="please enter function name"');
    expect(markup).toContain('aria-label="Lock section"');
    expect(markup).toContain('aria-label="Minimize section"');
    expect(markup).toContain('aria-label="Close section"');
    expect(markup).toContain('data-flat-control-toggle="true"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("flat-section-card__control gg-lock");
    expect(markup).not.toContain("<header");
    expect(markup).not.toContain("grid");
    expect(markup).not.toContain("rounded");
    expect(markup).not.toContain("shadow");
    expect(markup).not.toContain("opacity");
    expect(markup).not.toContain("dark:");
    expect(markup).not.toContain('data-flat-control="column-resize"');
    expect(markup).not.toContain("filter args");
    expect(markup).not.toContain("filter keys");
    expect(markup).not.toContain('data-flat-row-group="pinned"');
    expect(markup).not.toContain('data-flat-row-group="body"');
  });

  it("keeps the callable prototype flat while preserving row and port targets", () => {
    const markup = renderToStaticMarkup(<FlatCallableSectionPrototype />);
    const divCount = (markup.match(/<div\b/g) ?? []).length;
    const spanCount = (markup.match(/<span\b/g) ?? []).length;
    const iconElementCount = (markup.match(/<i\b/g) ?? []).length;
    const navCount = (markup.match(/<nav\b/g) ?? []).length;
    const sectionCount = (markup.match(/<section\b/g) ?? []).length;
    const olCount = (markup.match(/<ol\b/g) ?? []).length;
    const liCount = (markup.match(/<li\b/g) ?? []).length;
    const rowCount = (markup.match(/data-flat-row-key=/g) ?? []).length;

    expect(divCount).toBe(0);
    expect(spanCount).toBe(0);
    expect(iconElementCount).toBe(0);
    expect(navCount).toBe(0);
    expect(sectionCount).toBe(1);
    expect(olCount).toBe(3);
    expect(liCount).toBe(7);
    expect(rowCount).toBe(4);
    expect(markup).not.toContain('data-flat-shell-strip="ports"');
    expect(markup).toContain('data-flat-row-emphasis="edge"');
    expect(markup).toContain('data-flat-row-emphasis="required"');
    expect(markup).toContain('data-flat-row-emphasis="optional"');
    expect(markup).toContain('data-flat-row-divider="true"');
    expect(markup).toContain('data-flat-port-id="items"');
    expect(markup).toContain('data-flat-port-id="result"');
    expect(markup).toContain("flat-section-card__callable");
    expect(markup).toContain("flat-section-card__rows");
    expect(markup).toContain("flat-section-card__row");
    expect(markup).toContain("--flat-row-top:168px");
    expect(markup).toContain("--flat-row-height:45px");
    expect(markup).toContain("--flat-row-indent:0rem");
    expect(markup).toContain('data-flat-port-label="IN"');
    expect(markup).toContain('data-flat-port-label="OUT"');
    expect(markup).not.toContain("grid");
    expect(markup).not.toContain('data-flat-pinned-marker="true"');
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
    expect(markup).toContain('data-flat-controls-open="true"');
    expect(markup).toContain("--flat-action-h:36px");
    expect(markup).toContain("flat-section-card__actions");
    expect(markup).toContain('data-flat-control="column-resize"');
    expect(markup).toContain('value="filter"');
    expect(markup).toContain("gg-search");
    expect(markup).not.toContain("grid");
    expect(markup).not.toContain("justify-self");
    expect(markup).not.toContain(">Args<");
    expect(markup).not.toContain("filter args");
    expect(markup).not.toContain("group-hover");
  });

  it("marks dict grouping and nested row hierarchy without helper rail elements", () => {
    const markup = renderToStaticMarkup(<FlatDictSectionPrototype />);
    const sectionCount = (markup.match(/<section\b/g) ?? []).length;

    expect(markup).toContain('data-flat-row-emphasis="group"');
    expect(markup).toContain('data-flat-row-emphasis="nested"');
    expect(markup).toContain('data-flat-row-depth="1"');
    expect(markup).toContain("--flat-rail-left:1.1875rem");
    expect(markup).toContain("--flat-row-indent:0.875rem");
    expect(markup).toContain("--flat-row-top:107px");
    expect(sectionCount).toBe(1);
    expect(markup).not.toContain("--flat-rail-width");
    expect(markup).not.toContain("<span");
  });

  it("moves passive dividers and containment into shared CSS", () => {
    expect(css).toContain("contain: layout style");
    expect(css).toContain(".flat-section-card--callable");
    expect(css).toContain("linear-gradient(var(--flat-border-strong)");
    expect(css).toContain("content: attr(data-flat-port-label)");
    expect(css).toContain(
      "top: calc(var(--flat-row-top) + var(--flat-action-h))",
    );
    expect(css).not.toContain("display: grid");
    expect(css).not.toContain("grid-template");
  });
});
